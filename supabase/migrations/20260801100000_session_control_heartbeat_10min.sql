-- Expiracao da posse cai de 30 para 10 minutos, agora que existe heartbeat.
--
-- O DEFEITO que motivou a mudanca: a funcao mede atividade lendo
-- `public.point_events`, que e a tabela da NUVEM. Mas o registro de ponto neste app
-- e puramente local e nao ha auto-sync periodico durante a sessao. Enquanto ninguem
-- sincroniza, a nuvem nao ve ponto nenhum, o `coalesce` cai em `control_claimed_at`,
-- e a posse expirava por cronometro mesmo com alguem marcando placar sem parar.
--
-- Com o ritmo real informado pelo operador — jogo de 10 a 15 minutos e o proximo
-- comecando em 1 a 2 minutos — uma sessao de tres jogos passa de 45 minutos. A posse
-- expirava no meio, toda vez.
--
-- A correcao nao esta so aqui: o cliente passa a chamar `claim_session_ownership` a
-- cada 2 minutos enquanto a sessao esta ativa e ele detem o controle. Como a RPC ja
-- atualiza `control_claimed_at`, isso vira sinal de vida REAL, independente de sync.
--
-- Com heartbeat de 2 minutos, 10 minutos equivalem a cinco batidas perdidas: margem
-- folgada para oscilacao de rede, e um aparelho que morreu devolve a quadra em menos
-- de um jogo em vez de meia hora.
--
-- O maior intervalo normal entre pontos e de 2 a 3 minutos, entao 10 minutos continua
-- sendo mais de 3x a folga necessaria mesmo se o heartbeat falhar por completo.

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
  ) < now() - interval '10 minutes';
$$;

revoke execute on function public.session_control_is_expired(public.sessions) from public, anon;
grant execute on function public.session_control_is_expired(public.sessions) to authenticated;
