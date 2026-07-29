-- Outbox idempotente: uma linha por operação de domínio enfileirada pelo client.
-- Consumida pelo sync worker; em sucesso a entrada é DELETADA (nuvem autoritativa +
-- idempotency_key impede duplicação futura). Em falha recoverable volta para
-- pending_upload com attempts++. Em falha estrutural fica recoverable_error visível.

create table if not exists public.outbox_entries (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  operation text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  status text not null default 'pending_upload'
    check (status in ('pending_upload', 'syncing', 'cloud_confirmed',
                      'recoverable_error')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outbox_entries enable row level security;

create policy "outbox_entries_owned_by_user" on public.outbox_entries for all
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

create index outbox_entries_pending_idx on public.outbox_entries (auth_user_id, status) where status in ('pending_upload', 'syncing');

revoke all on table public.outbox_entries from public, anon, authenticated;
grant select, insert, update, delete on public.outbox_entries to authenticated;
