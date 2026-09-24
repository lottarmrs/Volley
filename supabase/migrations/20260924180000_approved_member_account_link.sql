-- Roadmap fatia 3 -- quem e aprovado na comunidade consegue entrar na lista.
--
-- Existem duas formas de dizer "esta conta e este atleta", e a aprovacao so
-- preenchia uma:
--
--   * `players.user_id` -- o que `build_registration_board` devolve como
--     `viewer_player_id`, ou seja, o que a TELA mostra;
--   * `player_account_links` com status ACTIVE -- o que
--     `current_user_active_player_id()` le, ou seja, o que `join_registration`
--     EXIGE.
--
-- Resultado: a pessoa aprovada via a propria ficha na tela e levava 42501 ao
-- tocar "Quero jogar", com uma mensagem sobre vinculo de conta que ela nao
-- tinha como resolver sozinha. Provado em `approvedMemberCanJoin.dbtest.ts`.
--
-- `enroll_approved_member` ja cria o atleta e o poe no elenco; passa a criar
-- tambem o vinculo, com provenance ORGANIZER_ASSIGNED -- que e o que de fato
-- aconteceu: quem administra aprovou a entrada.

create or replace function app_private.enroll_approved_member(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
  v_name text;
begin
  select coalesce(nullif(name, ''), split_part(email, '@', 1), 'Atleta') into v_name
    from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Conta do membro não encontrada.' using errcode = '23503';
  end if;

  select * into v_player from public.players where user_id = p_user_id for update;
  if found and v_player.deleted_at is not null then
    raise exception 'O perfil de atleta desta conta precisa ser recuperado antes da aprovação.'
      using errcode = '23514';
  end if;

  if v_player.id is null then
    insert into public.players (owner_id, user_id, name, has_account_identity_history)
    values (p_user_id, p_user_id, v_name, true)
    on conflict (user_id) where user_id is not null
    do update set updated_at = public.players.updated_at
    returning * into v_player;
  end if;

  if v_player.deleted_at is not null then
    raise exception 'O perfil de atleta desta conta precisa ser recuperado antes da aprovação.'
      using errcode = '23514';
  end if;

  insert into public.community_players as cp (
    owner_id, community_id, player_id, active, status
  )
  values (p_user_id, p_community_id, v_player.id, true, 'active')
  on conflict (community_id, player_id) do update
    set active = true, status = 'active', deleted_at = null, updated_at = now()
    where cp.status <> 'banned';

  if not found then
    raise exception 'Este atleta está banido do elenco. Resolva o banimento antes de aprovar a entrada.'
      using errcode = '23514';
  end if;

  -- O vinculo de conta, que faltava. Sem ele a pessoa aprovada aparece como
  -- atleta na tela (`build_registration_board` le `players.user_id`) e e
  -- recusada ao entrar na lista (`join_registration` exige
  -- `current_user_active_player_id()`, que le daqui).
  --
  -- Idempotente e respeitando as duas unicidades parciais: um ACTIVE por conta
  -- e um por atleta. Se a conta ja tem vinculo ativo, nada muda -- aprovar
  -- entrada numa comunidade nao e motivo para religar a conta a outra ficha.
  insert into public.player_account_links (
    player_id, user_id, status, provenance, activated_at
  )
  select v_player.id, p_user_id, 'ACTIVE', 'ORGANIZER_ASSIGNED', now()
   where not exists (
           select 1 from public.player_account_links
            where user_id = p_user_id and status = 'ACTIVE'
         )
     and not exists (
           select 1 from public.player_account_links
            where player_id = v_player.id and status = 'ACTIVE'
         );
end;
$$;

revoke all on function app_private.enroll_approved_member(uuid, uuid)
  from public, anon, authenticated;
