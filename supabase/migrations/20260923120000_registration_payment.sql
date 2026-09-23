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
  add column paid_marked_by_user_id uuid references auth.users(id) on delete set null,
  add column payment_lapsed_at timestamptz,
  add column reserve_rank bigint;

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
