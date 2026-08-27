-- C6 XS-W2-04 — Community ownership invariant
--
-- GINV-COM-001: every active Community has exactly EXACTLY ONE active Owner.
--
-- "Exactly one" is two separate obligations, and they need different mechanisms:
--
--   at most one   expressible as a PARTIAL UNIQUE INDEX, so the database refuses a second
--                 owner without any application code being involved;
--   at least one  NOT expressible as a constraint, because SQL cannot require that a row
--                 exists. It needs a trigger that refuses the last owner's departure, plus
--                 semantic commands that never leave the community ownerless mid-transaction.
--
-- The concurrency requirement is the sharp edge: two transfers racing must produce neither
-- 0 owners nor 2. Both are enforced below and both are tested with genuinely concurrent
-- transactions (QA-INV-008).
--
-- Target commands are added ALONGSIDE the legacy ones. transfer_community_ownership and
-- leave_community keep operating on community_members exactly as before; these operate on
-- the community_memberships relation XS-W2-02 introduced. Two implementations coexist,
-- but they govern different tables, so there is still one authority per aggregate
-- (GINV-AUTH-001).

-- ── At most one active Owner ───────────────────────────────────────────────
create unique index if not exists community_memberships_one_active_owner
  on public.community_memberships (community_id)
  where role = 'owner' and status = 'active';

-- ── At least one active Owner ──────────────────────────────────────────────
-- A DEFERRED CONSTRAINT TRIGGER, not a BEFORE trigger, and the difference matters.
--
-- A row-level BEFORE trigger judges each statement in isolation, so it cannot tell a real
-- violation from a legal intermediate state. Transferring ownership necessarily passes
-- through one: the outgoing owner is demoted before the incoming one is promoted, and in
-- that instant the community has no owner. A BEFORE trigger refuses the transfer outright
-- -- which is exactly what the first version of this migration did, and the suite caught it.
--
-- Deferring to COMMIT means the invariant is judged on the FINAL state. Intermediate steps
-- are free; the transaction as a whole must still leave exactly one active owner.
create or replace function public.check_community_has_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_community_id uuid := coalesce(new.community_id, old.community_id);
  v_owners integer;
begin
  -- The community may have been deleted in this same transaction, cascading its
  -- memberships. An invariant about a community that no longer exists is vacuous.
  if not exists (select 1 from public.communities where id = v_community_id) then
    return null;
  end if;

  select count(*) into v_owners
    from public.community_memberships m
   where m.community_id = v_community_id
     and m.role = 'owner'
     and m.status = 'active';

  if v_owners <> 1 then
    raise exception 'Community % must have exactly one active owner, found %',
      v_community_id, v_owners
      using errcode = '23514';
  end if;

  return null;
end;
$$;

revoke all on function public.check_community_has_active_owner() from public, anon, authenticated;

drop trigger if exists check_community_has_active_owner_trg on public.community_memberships;
create constraint trigger check_community_has_active_owner_trg
  after insert or update or delete on public.community_memberships
  deferrable initially deferred
  for each row execute function public.check_community_has_active_owner();

-- ── CreateCommunity ────────────────────────────────────────────────────────
-- Root + OWNER membership commit atomically. A function body is a single transaction, so
-- there is no window in which the community exists without an owner.
create or replace function public.create_community_with_owner(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_community_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Community name is required' using errcode = '23514';
  end if;

  insert into public.communities (name, owner_id)
  values (btrim(p_name), v_uid)
  returning id into v_community_id;

  insert into public.community_memberships (community_id, user_id, role, status)
  values (v_community_id, v_uid, 'owner', 'active');

  return v_community_id;
end;
$$;

revoke all on function public.create_community_with_owner(text) from public, anon;
grant execute on function public.create_community_with_owner(text) to authenticated;

-- ── TransferCommunityOwnership ─────────────────────────────────────────────
-- Exactly one active owner after commit.
--
-- The row lock is what makes concurrency safe. Two racing transfers both try to lock the
-- current owner's row; the second waits, then re-reads and finds the caller is no longer
-- the owner, so it is refused rather than producing a second owner or none.
create or replace function public.transfer_community_ownership_v2(
  p_community_id uuid,
  p_new_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current_owner_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_new_owner_user_id = v_uid then
    raise exception 'Ownership is already held by this account' using errcode = '23514';
  end if;

  -- Serialise on the current owner row. FOR UPDATE is the whole concurrency story.
  select m.id into v_current_owner_id
    from public.community_memberships m
   where m.community_id = p_community_id
     and m.role = 'owner'
     and m.status = 'active'
   for update;

  if v_current_owner_id is null then
    raise exception 'Community % has no active owner', p_community_id using errcode = '23514';
  end if;

  -- Re-checked AFTER the lock: a racing transfer may have moved ownership while this
  -- transaction waited, and the caller's authority must be judged against committed state.
  if not exists (
    select 1 from public.community_memberships m
     where m.id = v_current_owner_id and m.user_id = v_uid
  ) then
    raise exception 'Only the current owner may transfer ownership' using errcode = '42501';
  end if;

  -- The recipient must already be an active member: ownership is not a way to add someone.
  if not exists (
    select 1 from public.community_memberships m
     where m.community_id = p_community_id
       and m.user_id = p_new_owner_user_id
       and m.status = 'active'
  ) then
    raise exception 'The new owner must already be an active member' using errcode = '23514';
  end if;

  -- Promote first, then demote. The reverse order would momentarily leave the community
  -- ownerless and trip the last-owner guard; this order momentarily has two owners, which
  -- the partial unique index would reject -- so the demotion is done in the same statement
  -- sequence with the index deferred by ordering: demote to admin, then promote.
  update public.community_memberships
     set role = 'admin', updated_at = now()
   where id = v_current_owner_id;

  update public.community_memberships
     set role = 'owner', updated_at = now()
   where community_id = p_community_id
     and user_id = p_new_owner_user_id;

  -- Keep the denormalised column on communities consistent with the relation.
  update public.communities
     set owner_id = p_new_owner_user_id
   where id = p_community_id;
end;
$$;

revoke all on function public.transfer_community_ownership_v2(uuid, uuid) from public, anon;
grant execute on function public.transfer_community_ownership_v2(uuid, uuid) to authenticated;

comment on function public.transfer_community_ownership_v2(uuid, uuid) is
  'Target TransferCommunityOwnership (C6 XS-W2-04). Locks the current owner row, so racing transfers cannot yield 0 or 2 owners.';
comment on index public.community_memberships_one_active_owner is
  'GINV-COM-001 "at most one": the "at least one" half is enforced by guard_last_community_owner.';
