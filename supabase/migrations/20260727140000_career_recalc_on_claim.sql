-- Recalcula a carreira de um jogador. Usado no claim: reivindicar um jogador historico
-- regenera a carreira dele a partir do dado ja confirmado, em vez de copiar um cartao
-- congelado (spec base secao 9).

create or replace function public.recalculate_player_career(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid[];
begin
  -- Sessoes onde o jogador aparece em algum time. teams.player_ids guarda ids LOCAIS,
  -- resolvidos por (owner_id, local_id).
  select array_agg(distinct t.session_id) into affected
    from public.teams t
    join public.players p
      on p.owner_id = t.owner_id
     and coalesce(p.local_id, p.id::text) = any(t.player_ids)
   where p.id = p_player_id
     and t.deleted_at is null
     and t.session_id is not null;

  perform public.regenerate_career_events_for_sessions(affected);
end;
$$;

revoke execute on function public.recalculate_player_career(uuid) from public, anon;
grant execute on function public.recalculate_player_career(uuid) to authenticated;
