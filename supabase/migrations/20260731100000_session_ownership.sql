-- Posse da sessao, para impedir que duas pessoas produzam placares concorrentes.
--
-- A autoridade e o USUARIO, nao o aparelho. Bloquear por aparelho puniria o caso
-- legitimo de trocar de celular no meio da sessao, e transformaria o aviso num id
-- opaco com o qual ninguem consegue fazer nada. `control_device_id` e registrado
-- apenas para um aviso informativo e NUNCA bloqueia.
--
-- `controlled_by_user_id` e distinto de `sessions.owner_id`, que continua sendo quem
-- criou a sessao: um moderador pode assumir o controle sem virar dono.

alter table public.sessions
  add column if not exists controlled_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists control_claimed_at timestamptz,
  add column if not exists control_device_id text;

-- 30 minutos SEM PONTO NOVO liberam a sessao.
--
-- Medir desde a reivindicacao criaria o pior cenario: o celular de quem esta tocando
-- a sessao morre e ninguem mais marca ponto ate o prazo acabar. Medindo pela
-- atividade, a garantia vale enquanto alguem joga e a sessao volta sozinha quando o
-- aparelho some.
--
-- O coalesce cobre a sessao recem-criada, que ainda nao tem nenhum point_event:
-- control_claimed_at e preenchido junto com a posse, entao nunca e nulo.
create or replace function public.session_control_is_expired(p_session public.sessions)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select max(pe.occurred_at) from public.point_events pe
      where pe.session_id = p_session.id and pe.deleted_at is null),
    p_session.control_claimed_at
  ) < now() - interval '30 minutes';
$$;

revoke execute on function public.session_control_is_expired(public.sessions) from public, anon;
grant execute on function public.session_control_is_expired(public.sessions) to authenticated;

create or replace function public.claim_session_ownership(p_session_id uuid, p_device_id text)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  select * into v_session from public.sessions
   where id = p_session_id and deleted_at is null;

  if v_session.id is null then
    raise exception 'Sessão não encontrada' using errcode = '22023';
  end if;

  -- Mesmo direito de escrita que a RLS de sessions ja concede: dono da sessao, ou
  -- owner/admin/moderator da comunidade (default de current_user_has_community_role).
  if not (
    v_session.owner_id = v_uid
    or (v_session.community_id is not null
        and public.current_user_has_community_role(v_session.community_id))
  ) then
    raise exception 'Sem permissão para controlar esta sessão' using errcode = '42501';
  end if;

  if v_session.status = 'finished' then
    raise exception 'Sessão encerrada não tem placar a marcar' using errcode = '22023';
  end if;

  -- Assume se estiver livre, se ja for sua, ou se a posse tiver expirado.
  if v_session.controlled_by_user_id is not null
     and v_session.controlled_by_user_id <> v_uid
     and not public.session_control_is_expired(v_session) then
    raise exception 'Outra pessoa está com o controle desta sessão' using errcode = '42501';
  end if;

  update public.sessions
     set controlled_by_user_id = v_uid,
         control_claimed_at = now(),
         control_device_id = p_device_id,
         updated_at = now()
   where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.claim_session_ownership(uuid, text) from public, anon;
grant execute on function public.claim_session_ownership(uuid, text) to authenticated;

-- Tomada explicita: permitida a quem ja pode escrever a sessao, independente de
-- expiracao. E o botao "assumir controle", que sempre exige confirmacao na tela.
create or replace function public.transfer_session_ownership(p_session_id uuid, p_device_id text)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = '42501';
  end if;

  select * into v_session from public.sessions
   where id = p_session_id and deleted_at is null;

  if v_session.id is null then
    raise exception 'Sessão não encontrada' using errcode = '22023';
  end if;

  if not (
    v_session.owner_id = v_uid
    or (v_session.community_id is not null
        and public.current_user_has_community_role(v_session.community_id))
  ) then
    raise exception 'Sem permissão para controlar esta sessão' using errcode = '42501';
  end if;

  if v_session.status = 'finished' then
    raise exception 'Sessão encerrada não tem placar a marcar' using errcode = '22023';
  end if;

  update public.sessions
     set controlled_by_user_id = v_uid,
         control_claimed_at = now(),
         control_device_id = p_device_id,
         updated_at = now()
   where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.transfer_session_ownership(uuid, text) from public, anon;
grant execute on function public.transfer_session_ownership(uuid, text) to authenticated;
