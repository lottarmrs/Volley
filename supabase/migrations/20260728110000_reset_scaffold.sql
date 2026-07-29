-- Scaffold de reset de produção. Não é chamado por nenhuma aplicação neste plano;
-- existe para uso manual futuro (Plano 5). Requer AAL2 + capability reset_product_data.

insert into public.global_role_capabilities (role, capability)
values ('master', 'reset_product_data'), ('programmer', 'reset_product_data')
on conflict (role, capability) do nothing;

create or replace function public.reset_product_data(target_account_uuid text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_capability('reset_product_data') then
    raise exception 'Not authorized: missing reset_product_data capability';
  end if;
  perform public.require_aal2();

  -- Children-first referential order
  delete from public.point_events;
  delete from public.games;
  delete from public.teams;
  delete from public.sessions;
  delete from public.championship_rounds;
  delete from public.championship_teams;
  delete from public.championships;
  delete from public.player_achievements;
  delete from public.player_career_snapshots;
  delete from public.career_events;
  delete from public.player_evaluations;
  delete from public.self_evaluations;
  delete from public.community_players;
  delete from public.whatsapp_list_drafts;
  delete from public.community_presence;
  delete from public.game_reports;
  delete from public.session_reports;
  delete from public.outbox_entries;
  delete from public.players where cloud_owner_id = target_account_uuid::uuid;
  delete from public.communities where cloud_owner_id = target_account_uuid::uuid;
end;
$$;

revoke all on function public.reset_product_data(text) from public, anon, authenticated;
grant execute on function public.reset_product_data(text) to authenticated;