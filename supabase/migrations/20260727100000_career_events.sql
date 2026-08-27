-- Livro-razao de carreira CONFIRMADA. Gerado exclusivamente pelo servidor a partir de
-- linhas que ja estao no Postgres, entao "confirmado" e verdade por construcao: nao
-- existe evento para dado que nunca chegou na nuvem (spec base secao 9).
-- Ver docs/superpowers/specs/2026-07-27-career-events-vut-design.md.

create table public.career_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  type text not null check (type in ('session_played', 'milestone')),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  -- Chave deterministica: 'player:{uuid}|session:{uuid}|session_played' ou
  -- 'player:{uuid}|milestone:{slug}'. E o que torna regeneracao e retry idempotentes
  -- (spec base secao 6: retry nao duplica evento nem conquista).
  source_key text not null unique,
  contract_version integer not null,
  created_at timestamptz not null default now()
);

create index career_events_player_idx on public.career_events (player_id, occurred_at desc);
create index career_events_session_idx on public.career_events (session_id);

alter table public.career_events enable row level security;

-- Ninguem escreve pelo cliente: as linhas nascem do trigger (security definer).
-- revoke ANTES do grant e dos DOIS papeis — Supabase concede ALL por padrao em
-- objetos novos do schema public, entao revogar so de anon nao faz nada.
revoke all on table public.career_events from anon, authenticated;
grant select on table public.career_events to authenticated;

create policy "Career events readable by owner or shared community"
  on public.career_events
  for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = career_events.player_id
        and p.user_id = (select auth.uid())
    )
    or public.is_app_staff()
    or (
      community_id is not null
      and public.current_user_has_community_role(community_id)
    )
  );