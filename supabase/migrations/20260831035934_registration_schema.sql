create table public.registration_windows (
  id uuid primary key,
  session_id uuid not null unique references public.sessions(id) on delete restrict,
  status text not null,
  capacity integer not null,
  closes_at timestamptz,
  revision integer not null default 1,
  next_queue_sequence bigint not null default 1,
  opened_at timestamptz,
  closed_at timestamptz,
  locked_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_windows_status_check
    check (status in ('DRAFT', 'OPEN', 'CLOSED', 'LOCKED')),
  constraint registration_windows_capacity_check check (capacity > 0)
);

create index registration_windows_created_by_user_id_idx
  on public.registration_windows (created_by_user_id);

create function app_private.assert_registration_window_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  -- A missing session_id is left to the foreign key constraint (23503): this trigger fires
  -- before that check, so raising here for "not found" would mask the FK violation with a
  -- misleading 23514. Only an existing, wrong-context Session is this trigger's concern.
  select * into v_session from public.sessions where id = new.session_id;
  if found
     and (v_session.authority_model <> 'target'
          or v_session.session_context is distinct from 'COMMUNITY') then
    raise exception 'Registration windows require a COMMUNITY target Session'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.assert_registration_window_session()
  from public, anon, authenticated;

create trigger assert_registration_window_session_trigger
before insert or update of session_id on public.registration_windows
for each row execute function app_private.assert_registration_window_session();

create table public.registration_entries (
  id uuid primary key,
  registration_window_id uuid not null references public.registration_windows(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  status text not null,
  queue_sequence bigint,
  source text not null,
  joined_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  removed_at timestamptz,
  removal_reason text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  constraint registration_entries_status_check
    check (status in ('CONFIRMED', 'WAITLISTED', 'WITHDRAWN', 'REMOVED')),
  constraint registration_entries_source_check
    check (source in ('SELF_JOIN', 'ORGANIZER_ADDED', 'MIGRATION', 'ADMIN_RESTORE')),
  -- One-directional by design: a CONFIRMED entry may carry a queue_sequence (promoted from
  -- the queue) or not (walked straight in). Only WAITLISTED requires one.
  constraint registration_entries_waitlisted_has_sequence_check
    check (status <> 'WAITLISTED' or queue_sequence is not null),
  constraint registration_entries_removal_reason_check
    check (removal_reason is null or btrim(removal_reason) <> '')
);

create unique index registration_entries_effective_key
  on public.registration_entries (registration_window_id, player_id)
  where status in ('CONFIRMED', 'WAITLISTED');

create unique index registration_entries_queue_key
  on public.registration_entries (registration_window_id, queue_sequence)
  where queue_sequence is not null;

create index registration_entries_waitlist_idx
  on public.registration_entries (registration_window_id, queue_sequence)
  where status = 'WAITLISTED';

create index registration_entries_registration_window_id_idx
  on public.registration_entries (registration_window_id);
create index registration_entries_player_id_idx
  on public.registration_entries (player_id);
create index registration_entries_created_by_user_id_idx
  on public.registration_entries (created_by_user_id);

alter table public.registration_windows enable row level security;
revoke all on public.registration_windows from public, anon, authenticated;
grant select on public.registration_windows to authenticated;

create policy "Target Session readers can read Registration Windows"
  on public.registration_windows
  for select to authenticated
  using (app_private.current_user_can_read_target_session(session_id));

alter table public.registration_entries enable row level security;
revoke all on public.registration_entries from public, anon, authenticated;

create function app_private.allocate_registration_slot(
  p_entry_id uuid,
  p_window_id uuid,
  p_player_id uuid,
  p_source text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.registration_windows;
  v_confirmed bigint;
  v_status text;
  v_queue_sequence bigint;
  v_next_queue_sequence bigint;
begin
  if p_entry_id is null or p_window_id is null or p_player_id is null or p_source is null then
    raise exception 'entry_id, window_id, player_id and source are required'
      using errcode = '23514';
  end if;

  select * into v_window
    from public.registration_windows
   where id = p_window_id
   for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
      from public.registration_entries
     where registration_window_id = p_window_id
       and player_id = p_player_id
       and status in ('CONFIRMED', 'WAITLISTED')
  ) then
    raise exception 'Player already holds an effective Registration entry for this Window'
      using errcode = '23514';
  end if;

  select pg_catalog.count(*) into v_confirmed
    from public.registration_entries
   where registration_window_id = p_window_id
     and status = 'CONFIRMED';

  if v_confirmed < v_window.capacity then
    v_status := 'CONFIRMED';
    v_queue_sequence := null;
    v_next_queue_sequence := v_window.next_queue_sequence;
  else
    v_status := 'WAITLISTED';
    v_queue_sequence := v_window.next_queue_sequence;
    v_next_queue_sequence := v_window.next_queue_sequence + 1;
  end if;

  insert into public.registration_entries (
    id, registration_window_id, player_id, status, queue_sequence, source, created_by_user_id
  ) values (
    p_entry_id, p_window_id, p_player_id, v_status, v_queue_sequence, p_source, p_actor_user_id
  );

  update public.registration_windows
     set revision = revision + 1,
         next_queue_sequence = v_next_queue_sequence,
         updated_at = pg_catalog.now()
   where id = p_window_id;

  return pg_catalog.jsonb_build_object(
    'entry_id', p_entry_id,
    'status', v_status,
    'queue_sequence', v_queue_sequence::text,
    'window_revision', v_window.revision + 1
  );
end;
$$;

revoke all on function app_private.allocate_registration_slot(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
