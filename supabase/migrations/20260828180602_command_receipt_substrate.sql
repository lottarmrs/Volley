-- C6 XS-W3-06 — Command receipt substrate
--
-- A durable idempotency ledger for commands that are not naturally idempotent the way
-- `ensure_account_ready` is (see the KNOWN GAP recorded when that gap was still open in
-- `commandFoundation.dbtest.ts`). Recording a receipt keyed by the caller-supplied
-- `command_id` lets a retried command return its original terminal result instead of
-- re-executing an effect.
--
-- ADR-DATA-002 places internal support tables in `app_private`, outside the browser CRUD
-- surface. Nothing here is granted to anon or authenticated: receipts are written and read
-- only by SECURITY DEFINER command RPCs running as the server, never directly by a client.
--
-- OPEN DECISION RESPECTED, NOT CLOSED:
--   OPEN-API-002  receipt retention is deliberately undefined. There is NO ttl, NO prune
--                 job and NO cleanup worker in this migration. Receipts persist until a
--                 retention decision exists; `retention_class` only labels a row for that
--                 future decision, it does not enforce one.

create table app_private.command_receipts (
  command_id uuid primary key,
  actor_id uuid references auth.users(id) on delete set null,
  command_type text not null,
  aggregate_id uuid not null,
  result jsonb not null,
  committed_at timestamptz not null default now(),
  retention_class text not null,
  constraint command_receipts_command_type_check check (btrim(command_type) <> ''),
  constraint command_receipts_retention_class_check check (btrim(retention_class) <> '')
);

create index command_receipts_actor_idx
  on app_private.command_receipts (actor_id);

-- Receipts are write-once: a retry must find the same terminal result it left behind, not
-- a result some other process quietly rewrote. The one exemption mirrors
-- `app_private.reject_roster_revision_mutation` -- an ON DELETE SET NULL from `auth.users`
-- must still be able to null `actor_id` when the actor is deleted.
create function app_private.reject_command_receipt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.actor_id is null
     and old.actor_id is not null
     and new.command_id = old.command_id
     and new.command_type = old.command_type
     and new.aggregate_id = old.aggregate_id
     and new.result = old.result
     and new.committed_at = old.committed_at
     and new.retention_class = old.retention_class then
    return new;
  end if;

  raise exception 'Command receipts are immutable' using errcode = '55000';
end;
$$;

revoke all on function app_private.reject_command_receipt_mutation()
  from public, anon, authenticated;

create trigger reject_command_receipt_mutation_trigger
before update or delete on app_private.command_receipts
for each row execute function app_private.reject_command_receipt_mutation();

-- ── record_command_receipt ──────────────────────────────────────────────────
-- Inserts exactly one receipt and hands back the result it just stored, so a caller can
-- treat "record" and "read what I just recorded" as the same call. A duplicate
-- `command_id` is a primary key violation (23505) and is not caught here -- the caller
-- must use `find_command_receipt` to distinguish a genuine retry from a collision.
create function app_private.record_command_receipt(
  p_command_id uuid,
  p_actor_id uuid,
  p_command_type text,
  p_aggregate_id uuid,
  p_result jsonb,
  p_retention_class text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.command_receipts (
    command_id, actor_id, command_type, aggregate_id, result, retention_class
  )
  values (
    p_command_id, p_actor_id, p_command_type, p_aggregate_id, p_result, p_retention_class
  );

  return p_result;
end;
$$;

revoke all on function app_private.record_command_receipt(uuid, uuid, text, uuid, jsonb, text)
  from public, anon, authenticated;

-- ── find_command_receipt ────────────────────────────────────────────────────
-- Looks a receipt up by `command_id` alone, then confirms `command_type` and
-- `aggregate_id` still match what the caller expects. A miss returns NULL. A match on
-- `command_id` whose type or aggregate differs is not a miss -- it is a `command_id`
-- collision between two different logical commands, and is raised as 23505 rather than
-- silently returning someone else's result.
create function app_private.find_command_receipt(
  p_command_id uuid,
  p_command_type text,
  p_aggregate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt app_private.command_receipts;
begin
  select * into v_receipt
    from app_private.command_receipts
   where command_id = p_command_id;

  if not found then
    return null;
  end if;

  if v_receipt.command_type is distinct from p_command_type
     or v_receipt.aggregate_id is distinct from p_aggregate_id then
    raise exception
      'command_id % already recorded under command_type %, not the requested command_type/aggregate_id',
      p_command_id, v_receipt.command_type
      using errcode = '23505';
  end if;

  return v_receipt.result;
end;
$$;

revoke all on function app_private.find_command_receipt(uuid, text, uuid)
  from public, anon, authenticated;

alter table app_private.command_receipts enable row level security;
revoke all on app_private.command_receipts from public, anon, authenticated;

comment on table app_private.command_receipts is
  'Durable command idempotency ledger (OPEN-API-002). Retention undefined by design: no '
  'ttl, no prune job, no cleanup worker.';
