-- C6 XS-W2-05 — JoinRequest separation
--
-- The four target commands over the community_join_requests relation XS-W2-02 introduced.
--
-- THE RULE: approval creates or REACTIVATES effective Membership in the same transaction,
-- and pending/rejected intent is never represented as a pseudo-membership. The legacy shape
-- did the opposite -- a pending join occupied a row in community_members, so intent and
-- access shared one representation and one slot.
--
-- Authorization composes with XS-W2-03 rather than re-deriving anything: approve and reject
-- require the semantic capability `community.members.manage`, so the answer to "who may
-- decide this" comes from the capability resolver, never from a role comparison
-- (GINV-CAP-002).
--
-- The legacy RPCs (request_to_join_community, approve_join_request, reject_join_request)
-- are untouched and keep operating on community_members. These operate on the target
-- relation, so the two paths govern different tables and there is one authority per
-- aggregate (GINV-AUTH-001).

-- ── RequestCommunityJoin ───────────────────────────────────────────────────
create or replace function public.request_community_join(p_community_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_request_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.communities c where c.id = p_community_id) then
    raise exception 'Community not found' using errcode = '23503';
  end if;

  -- Already inside: a request would be meaningless, and approving it later would
  -- overwrite an existing membership.
  if exists (
    select 1 from public.community_memberships m
     where m.community_id = p_community_id
       and m.user_id = v_uid
       and m.status = 'active'
  ) then
    raise exception 'Already an active member of this community' using errcode = '23505';
  end if;

  -- The partial unique index enforces one pending request; this turns the raw constraint
  -- violation into a domain error the caller can act on.
  if exists (
    select 1 from public.community_join_requests r
     where r.community_id = p_community_id
       and r.user_id = v_uid
       and r.status = 'pending'
  ) then
    raise exception 'A pending request already exists' using errcode = '23505';
  end if;

  insert into public.community_join_requests (community_id, user_id, status)
  values (p_community_id, v_uid, 'pending')
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.request_community_join(uuid) from public, anon;
grant execute on function public.request_community_join(uuid) to authenticated;

-- ── ApproveCommunityJoinRequest ────────────────────────────────────────────
-- The whole point of the slice: the decision and the resulting access commit together.
create or replace function public.approve_community_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_community_id uuid;
  v_applicant uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Lock the request: two reviewers deciding the same request must serialise, or both
  -- could see 'pending' and both act on it.
  select r.community_id, r.user_id, r.status
    into v_community_id, v_applicant, v_status
    from public.community_join_requests r
   where r.id = p_request_id
   for update;

  if v_community_id is null then
    raise exception 'Join request not found' using errcode = '23503';
  end if;

  if not public.current_user_has_community_capability(v_community_id, 'community.members.manage') then
    raise exception 'Missing capability community.members.manage' using errcode = '42501';
  end if;

  if v_status <> 'pending' then
    raise exception 'Join request is already %', v_status using errcode = '23514';
  end if;

  update public.community_join_requests
     set status = 'approved', decided_at = now(), decided_by = v_uid
   where id = p_request_id;

  -- Create OR REACTIVATE. Someone previously suspended who reapplies must regain access
  -- rather than collide with their historical row.
  insert into public.community_memberships (community_id, user_id, role, status)
  values (v_community_id, v_applicant, 'member', 'active')
  on conflict (community_id, user_id)
  do update set status = 'active', updated_at = now();
end;
$$;

revoke all on function public.approve_community_join_request(uuid) from public, anon;
grant execute on function public.approve_community_join_request(uuid) to authenticated;

-- ── RejectCommunityJoinRequest ─────────────────────────────────────────────
create or replace function public.reject_community_join_request(
  p_request_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_community_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select r.community_id, r.status into v_community_id, v_status
    from public.community_join_requests r
   where r.id = p_request_id
   for update;

  if v_community_id is null then
    raise exception 'Join request not found' using errcode = '23503';
  end if;

  if not public.current_user_has_community_capability(v_community_id, 'community.members.manage') then
    raise exception 'Missing capability community.members.manage' using errcode = '42501';
  end if;

  if v_status <> 'pending' then
    raise exception 'Join request is already %', v_status using errcode = '23514';
  end if;

  update public.community_join_requests
     set status = 'rejected', decided_at = now(), decided_by = v_uid, decision_reason = p_reason
   where id = p_request_id;

  -- Deliberately NO membership write. A rejection grants nothing and, critically, must not
  -- disturb an existing membership either.
end;
$$;

revoke all on function public.reject_community_join_request(uuid, text) from public, anon;
grant execute on function public.reject_community_join_request(uuid, text) to authenticated;

-- ── WithdrawCommunityJoinRequest ───────────────────────────────────────────
-- The applicant's own action. It needs no community capability, and deliberately cannot be
-- used by a reviewer to quietly dispose of a request without recording a decision.
create or replace function public.withdraw_community_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_applicant uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select r.user_id, r.status into v_applicant, v_status
    from public.community_join_requests r
   where r.id = p_request_id
   for update;

  if v_applicant is null then
    raise exception 'Join request not found' using errcode = '23503';
  end if;

  if v_applicant <> v_uid then
    raise exception 'Only the applicant may withdraw a request' using errcode = '42501';
  end if;

  if v_status <> 'pending' then
    raise exception 'Join request is already %', v_status using errcode = '23514';
  end if;

  update public.community_join_requests
     set status = 'withdrawn', decided_at = now(), decided_by = v_uid
   where id = p_request_id;
end;
$$;

revoke all on function public.withdraw_community_join_request(uuid) from public, anon;
grant execute on function public.withdraw_community_join_request(uuid) to authenticated;

comment on function public.approve_community_join_request(uuid) is
  'Target ApproveCommunityJoinRequest (C6 XS-W2-05): decision and effective Membership commit together.';
