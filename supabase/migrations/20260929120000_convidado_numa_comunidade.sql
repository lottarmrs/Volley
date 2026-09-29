-- Convidado numa comunidade so (spec 2026-09-29-convidado-numa-comunidade-design.md).
--
-- Convidado e o atleta sem conta, e pertence a uma comunidade: e ela que o cadastra, edita e
-- desativa. Em producao, em 2026-09-29, nenhum convidado estava em duas comunidades.
-- O nome zz_ faz o gatilho rodar depois de trigger_sync_community_player_active_status, que
-- normaliza active a partir de status.

create or replace function app_private.guard_guest_single_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null or new.active is not true then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.player_id::text, 0));

  if public.player_has_account(new.player_id) then
    return new;
  end if;

  if exists (
    select 1
      from public.community_players cp
     where cp.player_id = new.player_id
       and cp.community_id <> new.community_id
       and cp.deleted_at is null
       and cp.active
  ) then
    raise exception 'Guest athlete already belongs to another community' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_guest_single_community() from public, anon, authenticated;

drop trigger if exists zz_guard_guest_single_community on public.community_players;
create trigger zz_guard_guest_single_community
  before insert or update on public.community_players
  for each row execute function app_private.guard_guest_single_community();
