-- Totais globais de carreira SEM atribuicao de comunidade. Resolve o conflito entre
-- "VUT e global" (spec base secao 9) e a privacidade por comunidade: o card de terceiros
-- fica global e correto sem revelar em quais comunidades a pessoa joga.
--
-- Por ser view com GROUP BY, e estruturalmente NAO auto-updatable â€" diferente de
-- community_profile_summary, que era de tabela unica e por isso virou vetor de escrita
-- (ver 20260726200000_lock_community_profile_summary_readonly.sql). Ainda assim os
-- grants sao fixados explicitamente.

create or replace view public.career_totals as
select
  ce.player_id,
  count(*) filter (where ce.type = 'session_played') as sessions_played,
  coalesce(sum((ce.payload->>'games_played')::int), 0) as games_played,
  coalesce(sum((ce.payload->>'games_won')::int), 0) as games_won,
  coalesce(sum((ce.payload->>'points')::int), 0) as total_points,
  coalesce(sum((ce.payload->>'errors')::int), 0) as total_errors,
  coalesce(sum((ce.payload->>'highlights')::int), 0) as total_highlights,
  max(ce.occurred_at) as last_played_at
from public.career_events ce
where ce.type = 'session_played'
group by ce.player_id;

revoke all on public.career_totals from anon, authenticated;
grant select on public.career_totals to authenticated;
