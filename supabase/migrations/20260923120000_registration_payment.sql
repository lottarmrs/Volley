-- C6 — Pagamento na inscrição
--
-- Pagamento é um segundo eixo sobre a inscrição que a W4 já governa: `status` responde "está
-- dentro?", `queue_sequence` responde "chegou quando?", `paid_at` responde "quitou?". Nenhum
-- estado novo entra em registration_entries_status_check, então toda consulta que compara
-- status = 'CONFIRMED' continua correta -- incluindo finalize_session_roster e a cadeia do
-- sorteio da XS-W6-08c.
--
-- Reabre OPEN-REG-004 (FIFO estrito) e OPEN-REG-005 (pagamento fora do V1) por decisão de produto
-- de 2026-09-23. Estorno e cancelamento continuam fora.

alter table public.registration_windows
  add column payment_due_at timestamptz,
  add column payment_deadline_applied_at timestamptz;

comment on column public.registration_windows.payment_due_at is
  'Prazo para pagar. Nulo significa que nada é cortado.';
comment on column public.registration_windows.payment_deadline_applied_at is
  'Quando o corte rodou. Torna o corte idempotente para um dado payment_due_at.';

alter table public.registration_entries
  add column paid_at timestamptz,
  add column payment_lapsed_at timestamptz,
  add column reserve_rank bigint;

-- Quem marcou nao vira coluna: app_private.command_receipts ja guarda actor_id por comando, e
-- uma segunda referencia SET NULL a auth.users criaria a colisao que authCascadeSafety mede --
-- duas acoes de delete na mesma linha, uma podendo reescrever a pre-imagem da outra.
comment on column public.registration_entries.payment_lapsed_at is
  'Perdeu o prazo. Separa "ainda não pagou" de "perdeu a vaga por não ter pago".';
comment on column public.registration_entries.reserve_rank is
  'Ajuste manual do organizador. Nulo deixa a ordem derivada decidir.';

create index registration_entries_reserve_order_idx
  on public.registration_entries (registration_window_id, status, reserve_rank, paid_at, queue_sequence);

-- A ordem da reserva vive aqui e em nenhum outro lugar: a promoção e a leitura do quadro consomem
-- esta função. Duas implementações da mesma regra divergiriam no primeiro ajuste.
--
-- Quatro faixas: fixado pelo organizador, pago, ainda não pago, perdeu o prazo. Dentro de cada
-- uma, o desempate é o que aquela faixa significa -- rank, hora do pagamento, ordem de chegada.
create function app_private.registration_reserve_order(p_window_id uuid)
returns table (entry_id uuid, player_id uuid, posicao bigint, tier integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id,
         o.player_id,
         pg_catalog.row_number() over (
           order by o.tier, o.reserve_rank nulls last, o.paid_at nulls last, o.queue_sequence
         ),
         o.tier
    from (
      select e.id,
             e.player_id,
             e.reserve_rank,
             e.paid_at,
             e.queue_sequence,
             case
               when e.reserve_rank is not null then 1
               when e.paid_at is not null then 2
               when e.payment_lapsed_at is null then 3
               else 4
             end as tier
        from public.registration_entries e
       where e.registration_window_id = p_window_id
         and e.status = 'WAITLISTED'
    ) o;
$$;

revoke all on function app_private.registration_reserve_order(uuid)
  from public, anon, authenticated;

-- Substitui a de 20260902115932_leave_promotion_capacity.sql. Duas mudanças: o candidato sai da
-- ordem da reserva em vez de queue_sequence direto, e passado o prazo só sobe quem pagou.
--
-- O portão é um filtro, não um "pular e remover": quem não pagou continua na fila, esperando o
-- organizador marcar. Remover seria confundir "não pagou ainda" com "não pode mais jogar".
--
-- Continua sem tocar `revision`: promover é parte da mutação de quem a chamou (REG-INV-013).
create or replace function app_private.promote_waitlist_to_capacity(p_window_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.registration_windows;
  v_confirmed bigint;
  v_candidate public.registration_entries;
  v_promoted integer := 0;
  v_skipped integer := 0;
  v_payment_gate boolean;
begin
  select * into v_window from public.registration_windows where id = p_window_id;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  v_payment_gate := v_window.payment_due_at is not null
                    and pg_catalog.now() >= v_window.payment_due_at;

  select pg_catalog.count(*) into v_confirmed
    from public.registration_entries
   where registration_window_id = p_window_id
     and status = 'CONFIRMED';

  loop
    exit when v_confirmed >= v_window.capacity;

    select e.* into v_candidate
      from app_private.registration_reserve_order(p_window_id) o
      join public.registration_entries e on e.id = o.entry_id
     where not v_payment_gate or e.paid_at is not null
     order by o.posicao
     limit 1;
    exit when not found;

    if app_private.registration_entry_still_eligible(v_candidate.id) then
      update public.registration_entries
         set status = 'CONFIRMED',
             status_changed_at = pg_catalog.now()
       where id = v_candidate.id;
      v_confirmed := v_confirmed + 1;
      v_promoted := v_promoted + 1;
    else
      -- OPEN-REG-002: pular, mas nunca em silêncio. A entrada guarda o queue_sequence para o
      -- histórico continuar legível, e deixa de ser candidata em vez de ser reavaliada a cada
      -- promoção. RestoreRegistrationEntry é o caminho auditado de volta.
      update public.registration_entries
         set status = 'REMOVED',
             status_changed_at = pg_catalog.now(),
             removed_at = pg_catalog.now(),
             removal_reason = 'INELIGIBLE_AT_PROMOTION'
       where id = v_candidate.id;
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('promoted', v_promoted, 'skipped', v_skipped);
end;
$$;

revoke all on function app_private.promote_waitlist_to_capacity(uuid)
  from public, anon, authenticated;

-- O corte do prazo.
--
-- Só age com a janela OPEN: depois de fechada ou travada, quem cura a lista é o organizador, e o
-- prazo já fez o que tinha para fazer.
--
-- Não toca `revision` -- quem chama bumpa uma vez, porque corte e ação são uma mutação lógica só
-- (REG-INV-013). Devolve se cortou, para o comando saber se precisa bumpar.
--
-- A idempotência compara com o prazo corrente, não com um booleano: mover o prazo para frente
-- autoriza um corte novo sem precisar limpar nada.
create function app_private.apply_payment_deadline(p_window_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window public.registration_windows;
  v_sem_ordem bigint;
begin
  select * into v_window from public.registration_windows where id = p_window_id;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  if v_window.status <> 'OPEN'
     or v_window.payment_due_at is null
     or pg_catalog.now() < v_window.payment_due_at
     or (v_window.payment_deadline_applied_at is not null
         and v_window.payment_deadline_applied_at >= v_window.payment_due_at) then
    return false;
  end if;

  -- registration_entries_waitlisted_has_sequence_check: quem entrou direto na vaga tem
  -- queue_sequence nulo, e a reserva exige um. Cada rebaixado ganha o proximo da janela, na
  -- ordem em que chegou -- e quem ja tinha o seu guarda o que tinha, porque queue_sequence e o
  -- fato de quando a pessoa chegou e nao se reescreve.
  select pg_catalog.count(*) into v_sem_ordem
    from public.registration_entries e
   where e.registration_window_id = p_window_id
     and e.status = 'CONFIRMED'
     and e.paid_at is null
     and e.queue_sequence is null;

  with alvos as (
    select e.id,
           pg_catalog.row_number() over (order by e.joined_at, e.id) as ordem
      from public.registration_entries e
     where e.registration_window_id = p_window_id
       and e.status = 'CONFIRMED'
       and e.paid_at is null
       and e.queue_sequence is null
  )
  update public.registration_entries e
     set queue_sequence = v_window.next_queue_sequence + a.ordem - 1
    from alvos a
   where e.id = a.id;

  update public.registration_entries
     set status = 'WAITLISTED',
         status_changed_at = pg_catalog.now(),
         payment_lapsed_at = pg_catalog.now()
   where registration_window_id = p_window_id
     and status = 'CONFIRMED'
     and paid_at is null;

  update public.registration_windows
     set payment_deadline_applied_at = pg_catalog.now(),
         next_queue_sequence = next_queue_sequence + v_sem_ordem,
         updated_at = pg_catalog.now()
   where id = p_window_id;

  -- Depois do rebaixamento: a promoção lê capacidade e confirmados do estado já cortado, e o
  -- portão de pagamento dela garante que só quem pagou ocupe as vagas que acabaram de abrir.
  perform app_private.promote_waitlist_to_capacity(p_window_id);
  return true;
end;
$$;

revoke all on function app_private.apply_payment_deadline(uuid)
  from public, anon, authenticated;

-- Marcar pagamento é a única operação de pagamento permitida com a janela CLOSED ou LOCKED:
-- reconciliar quem pagou é trabalho que vai até o último minuto, e travar a lista não deveria
-- obrigar o organizador a reabrir só para corrigir um "pago".
create function public.mark_registration_payment(
  p_command_id uuid,
  p_window_id uuid,
  p_player_id uuid,
  p_paid boolean
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_entry public.registration_entries;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null or p_player_id is null or p_paid is null then
    raise exception 'command_id, window_id, player_id and paid are required'
      using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'mark_registration_payment', p_window_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to mark Registration payment'
      using errcode = '23514';
  end if;

  select * into v_entry
    from public.registration_entries
   where registration_window_id = p_window_id
     and player_id = p_player_id
     and status in ('CONFIRMED', 'WAITLISTED');
  if not found then
    raise exception 'Registration entry not found for this Player' using errcode = 'P0002';
  end if;

  perform app_private.apply_payment_deadline(p_window_id);

  if p_paid then
    -- Limpar o atraso devolve a entrada à faixa dos pagos: quem foi rebaixado por engano não
    -- deve ficar atrás de quem nunca pagou.
    update public.registration_entries
       set paid_at = pg_catalog.now(),
           payment_lapsed_at = null
     where id = v_entry.id;
  else
    update public.registration_entries
       set paid_at = null
     where id = v_entry.id;
  end if;

  -- Marcar pode ter acabado de tornar a entrada promovível, e o corte pode ter aberto vagas.
  perform app_private.promote_waitlist_to_capacity(p_window_id);

  update public.registration_windows
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'mark_registration_payment', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.mark_registration_payment(uuid, uuid, uuid, boolean)
  from public, anon;
grant execute on function public.mark_registration_payment(uuid, uuid, uuid, boolean)
  to authenticated;

-- Definir ou limpar o prazo. Nulo limpa; um instante no passado é recusado, porque um prazo que
-- já venceu ao ser criado cortaria a lista no comando seguinte sem ninguém ter tido chance.
create function public.set_registration_payment_due(
  p_command_id uuid,
  p_window_id uuid,
  p_due_at timestamptz
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null then
    raise exception 'command_id and window_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'set_registration_payment_due', p_window_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_window.status = 'LOCKED' then
    raise exception 'Registration Window is LOCKED' using errcode = '23514';
  end if;

  if p_due_at is not null and p_due_at <= pg_catalog.now() then
    -- Um hint estavel e o que deixa o cliente distinguir esta recusa da de janela fechada, que
    -- tambem e 23514. Sem ele, as duas cairiam na mesma frase.
    raise exception 'Payment due date must be in the future'
      using errcode = '23514', hint = 'PAYMENT_DUE_PAST';
  end if;

  update public.registration_windows
     set payment_due_at = p_due_at,
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'set_registration_payment_due', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.set_registration_payment_due(uuid, uuid, timestamptz)
  from public, anon;
grant execute on function public.set_registration_payment_due(uuid, uuid, timestamptz)
  to authenticated;

-- Subir ao topo da reserva. Uma ação, não uma reordenação: grava um rank menor que todos os
-- outros em vez de renumerar a fila, então nenhuma outra entrada muda de lugar relativo.
create function public.boost_registration_reserve_entry(
  p_command_id uuid,
  p_window_id uuid,
  p_player_id uuid
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_entry public.registration_entries;
  v_min bigint;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null or p_player_id is null then
    raise exception 'command_id, window_id and player_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'boost_registration_reserve_entry', p_window_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_window.status = 'LOCKED' then
    raise exception 'Registration Window is LOCKED' using errcode = '23514';
  end if;

  select * into v_entry
    from public.registration_entries
   where registration_window_id = p_window_id
     and player_id = p_player_id
     and status = 'WAITLISTED';
  if not found then
    raise exception 'Waitlisted Registration entry not found for this Player'
      using errcode = 'P0002';
  end if;

  select pg_catalog.min(reserve_rank) into v_min
    from public.registration_entries
   where registration_window_id = p_window_id;

  update public.registration_entries
     set reserve_rank = coalesce(v_min, 1) - 1
   where id = v_entry.id;

  update public.registration_windows
     set revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'boost_registration_reserve_entry', p_window_id,
    v_result, 'REGISTRATION_ENTRY'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.boost_registration_reserve_entry(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.boost_registration_reserve_entry(uuid, uuid, uuid)
  to authenticated;

-- O botão "aplicar agora". Quando não havia o que cortar, devolve a revisão de sempre sem bumpar:
-- um comando que não mudou nada não deveria invalidar o quadro de quem está olhando.
create function public.apply_registration_payment_deadline(
  p_command_id uuid,
  p_window_id uuid
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_cortou boolean;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null then
    raise exception 'command_id and window_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'apply_registration_payment_deadline', p_window_id
  );
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  v_cortou := app_private.apply_payment_deadline(p_window_id);

  if v_cortou then
    update public.registration_windows
       set revision = revision + 1,
           updated_at = pg_catalog.now()
     where id = p_window_id
    returning revision into v_new_revision;
  else
    v_new_revision := v_window.revision;
  end if;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'apply_registration_payment_deadline', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.apply_registration_payment_deadline(uuid, uuid) from public, anon;
grant execute on function public.apply_registration_payment_deadline(uuid, uuid) to authenticated;

-- Substitui a de 20260831132100_registration_lifecycle_commands.sql.
--
-- Fechar é o último instante em que a janela ainda está OPEN, e o corte do prazo só age enquanto
-- ela está aberta -- então é aqui que ele roda, não em lock. A transição permitida é
-- OPEN -> CLOSED -> LOCKED: com o corte em lock, ele nunca dispararia, porque a janela já teria
-- sido fechada no comando anterior.
--
-- O corte não toca `revision`, então o p_expected_revision de quem chamou continua válido.
create or replace function public.close_registration(
  p_command_id uuid,
  p_window_id uuid,
  p_expected_revision integer
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
begin
  if p_command_id is null or p_window_id is null then
    raise exception 'command_id and window_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(p_command_id, 'close_registration', p_window_id);
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to change Registration state'
      using errcode = '23514';
  end if;

  if v_window.status = 'CLOSED' then
    v_result := pg_catalog.jsonb_build_object('window_revision', v_window.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'close_registration', p_window_id,
      v_result, 'REGISTRATION_LIFECYCLE'
    );
    return query select v_window.revision;
    return;
  end if;

  perform app_private.assert_registration_lifecycle_transition(v_window.status, 'CLOSED');

  -- O corte, enquanto a janela ainda está aberta.
  perform app_private.apply_payment_deadline(p_window_id);

  if v_window.revision is distinct from p_expected_revision then
    raise exception 'Stale Registration Window revision' using errcode = '40001';
  end if;

  update public.registration_windows
     set status = 'CLOSED',
         closed_at = pg_catalog.now(),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'close_registration', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.close_registration(uuid, uuid, integer) from public, anon;
grant execute on function public.close_registration(uuid, uuid, integer) to authenticated;

-- Substitui a de 20260831132100_registration_lifecycle_commands.sql.
--
-- Travar é o momento em que a lista para de receber gente, então é onde a regra "a lista só fecha
-- para o sorteio com o pagamento em dia" pertence. finalize_session_roster já exige LOCKED, então
-- a regra alcança o sorteio sem reescrever aquela função de 204 linhas.
--
-- A guarda só vale quando a janela usa pagamento -- prazo definido ou alguém já marcado como pago.
-- Sem isso, toda comunidade que nunca cobrou nada pararia de travar a inscrição, e a cadeia do
-- sorteio da XS-W6-08c quebraria inteira.
create or replace function public.lock_registration(
  p_command_id uuid,
  p_window_id uuid,
  p_expected_revision integer
)
returns table (window_revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_window public.registration_windows;
  v_receipt jsonb;
  v_result jsonb;
  v_new_revision integer;
  v_payment_in_use boolean;
  v_unpaid bigint;
begin
  if p_command_id is null or p_window_id is null then
    raise exception 'command_id and window_id are required' using errcode = '23514';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.registration_windows w on w.session_id = s.id
   where w.id = p_window_id
   for update of s;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  select * into v_window from public.registration_windows where id = p_window_id for update;
  if not found then
    raise exception 'Registration Window not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(p_command_id, 'lock_registration', p_window_id);
  if v_receipt is not null then
    return query select (v_receipt ->> 'window_revision')::integer;
    return;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to change Registration state'
      using errcode = '23514';
  end if;

  if v_window.status = 'LOCKED' then
    v_result := pg_catalog.jsonb_build_object('window_revision', v_window.revision);
    perform app_private.record_command_receipt(
      p_command_id, (select auth.uid()), 'lock_registration', p_window_id,
      v_result, 'REGISTRATION_LIFECYCLE'
    );
    return query select v_window.revision;
    return;
  end if;

  perform app_private.assert_registration_lifecycle_transition(v_window.status, 'LOCKED');

  v_payment_in_use := v_window.payment_due_at is not null
    or exists (
      select 1
        from public.registration_entries e
       where e.registration_window_id = p_window_id
         and e.paid_at is not null
    );

  if v_payment_in_use then
    select pg_catalog.count(*) into v_unpaid
      from public.registration_entries e
     where e.registration_window_id = p_window_id
       and e.status = 'CONFIRMED'
       and e.paid_at is null;

    if v_unpaid > 0 then
      raise exception 'Registration has % confirmed entries without payment', v_unpaid
        using errcode = '23514', hint = 'REGISTRATION_UNPAID';
    end if;
  end if;

  if v_window.revision is distinct from p_expected_revision then
    raise exception 'Stale Registration Window revision' using errcode = '40001';
  end if;

  update public.registration_windows
     set status = 'LOCKED',
         locked_at = pg_catalog.now(),
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where id = p_window_id
  returning revision into v_new_revision;

  v_result := pg_catalog.jsonb_build_object('window_revision', v_new_revision);
  perform app_private.record_command_receipt(
    p_command_id, (select auth.uid()), 'lock_registration', p_window_id,
    v_result, 'REGISTRATION_LIFECYCLE'
  );

  return query select v_new_revision;
end;
$$;

revoke all on function public.lock_registration(uuid, uuid, integer) from public, anon;
grant execute on function public.lock_registration(uuid, uuid, integer) to authenticated;

-- Substitui a de 20260922120000_registration_board.sql. Três mudanças: a posição na reserva passa
-- a vir de app_private.registration_reserve_order em vez de um row_number próprio -- a regra vive
-- em um lugar só --, cada entrada carrega pagamento e atraso, e o quadro anuncia o corte pendente.
--
-- Anunciar sem aplicar é o ponto todo: a função é `stable` e não escreve. A tela mostra quem sai e
-- quem entra, e o banco só muda no próximo comando.
create or replace function app_private.build_registration_board(
  p_window public.registration_windows
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_player_id uuid;
  v_entries jsonb;
  v_viewer jsonb;
  v_cut jsonb := null;
  v_demoted uuid[];
  v_livres integer;
begin
  select p.id into v_player_id
    from public.players p
   where p.user_id = v_uid
     and p.deleted_at is null
   limit 1;

  with reserva as (
    select * from app_private.registration_reserve_order(p_window.id)
  ),
  ordenadas as (
    select e.id,
           e.player_id,
           e.status,
           e.source,
           e.joined_at,
           e.paid_at,
           e.payment_lapsed_at,
           r.posicao as queue_position,
           case when e.status = 'CONFIRMED' then 0 else 1 end as ordem_grupo,
           e.queue_sequence
      from public.registration_entries e
      left join reserva r on r.entry_id = e.id
     where e.registration_window_id = p_window.id
       and e.status in ('CONFIRMED', 'WAITLISTED')
  )
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'entry_id', o.id,
               'player_id', o.player_id,
               'status', o.status,
               'queue_position', o.queue_position,
               'source', o.source,
               'joined_at', o.joined_at,
               'paid_at', o.paid_at,
               'payment_lapsed_at', o.payment_lapsed_at
             )
             order by o.ordem_grupo, coalesce(o.queue_position, 0), o.queue_sequence, o.joined_at
           ),
           '[]'::jsonb
         )
    into v_entries
    from ordenadas o;

  select pg_catalog.jsonb_build_object(
           'viewer_entry_status', (
             select e.status
               from public.registration_entries e
              where e.registration_window_id = p_window.id
                and e.player_id = v_player_id
                and e.status in ('CONFIRMED', 'WAITLISTED')
              limit 1
           ),
           'viewer_paid_at', (
             select e.paid_at
               from public.registration_entries e
              where e.registration_window_id = p_window.id
                and e.player_id = v_player_id
                and e.status in ('CONFIRMED', 'WAITLISTED')
              limit 1
           ),
           'viewer_queue_position', (
             select entry ->> 'queue_position'
               from pg_catalog.jsonb_array_elements(v_entries) as entry
              where (entry ->> 'player_id')::uuid = v_player_id
                and entry ->> 'status' = 'WAITLISTED'
              limit 1
           )
         )
    into v_viewer;

  if p_window.status = 'OPEN'
     and p_window.payment_due_at is not null
     and pg_catalog.now() >= p_window.payment_due_at
     and (p_window.payment_deadline_applied_at is null
          or p_window.payment_deadline_applied_at < p_window.payment_due_at) then
    select pg_catalog.array_agg(e.player_id order by e.queue_sequence) into v_demoted
      from public.registration_entries e
     where e.registration_window_id = p_window.id
       and e.status = 'CONFIRMED'
       and e.paid_at is null;

    select p_window.capacity - pg_catalog.count(*) into v_livres
      from public.registration_entries e
     where e.registration_window_id = p_window.id
       and e.status = 'CONFIRMED'
       and e.paid_at is not null;

    v_cut := pg_catalog.jsonb_build_object(
      'demoted', coalesce(pg_catalog.to_jsonb(v_demoted), '[]'::jsonb),
      'promoted', coalesce(
        (
          select pg_catalog.jsonb_agg(sobem.player_id order by sobem.posicao)
            from (
              select r.player_id, r.posicao
                from app_private.registration_reserve_order(p_window.id) r
                join public.registration_entries e on e.id = r.entry_id
               where e.paid_at is not null
               order by r.posicao
               -- greatest e construcao da linguagem, nao funcao: nao aceita qualificacao.
               limit greatest(v_livres, 0)
            ) sobem
        ),
        '[]'::jsonb
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'window_id', p_window.id,
    'session_id', p_window.session_id,
    'status', p_window.status,
    'revision', p_window.revision,
    'capacity', p_window.capacity,
    'opened_at', p_window.opened_at,
    'closed_at', p_window.closed_at,
    'locked_at', p_window.locked_at,
    'payment_due_at', p_window.payment_due_at,
    'confirmed_count', (
      select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(v_entries) as entry
       where entry ->> 'status' = 'CONFIRMED'
    ),
    'waitlisted_count', (
      select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(v_entries) as entry
       where entry ->> 'status' = 'WAITLISTED'
    ),
    'paid_count', (
      select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(v_entries) as entry
       where entry ->> 'status' = 'CONFIRMED'
         and entry ->> 'paid_at' is not null
    ),
    'viewer_can_manage',
      app_private.current_user_has_valid_target_session_organizer_assignment(p_window.session_id),
    'viewer_player_id', v_player_id,
    'viewer_entry_status', v_viewer ->> 'viewer_entry_status',
    'viewer_paid_at', v_viewer ->> 'viewer_paid_at',
    'viewer_queue_position', (v_viewer ->> 'viewer_queue_position')::integer,
    'pending_deadline_cut', v_cut,
    'entries', v_entries
  );
end;
$$;

revoke all on function app_private.build_registration_board(public.registration_windows)
  from public, anon, authenticated;
