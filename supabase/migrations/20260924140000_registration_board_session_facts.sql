-- Roadmap fatia 4 -- o quadro da inscricao conta a verdade sobre a SESSAO.
--
-- Dois defeitos levantados na auditoria de fluxo de 2026-09-24 vinham do mesmo
-- buraco: `read_session_registration` devolvia so a janela.
--
--   * quem abre a inscricao por um link compartilhado nao tem a pelada no
--     armazenamento local -- e, sendo target, nunca vai ter, porque o download
--     em lote filtra `sessions` por `authority_model = 'legacy'`. O cabecalho
--     ficava sem nome e sem data.
--   * uma sessao IN_PROGRESS recusa quem tenta entrar (`join_registration`
--     exige DRAFT ou SCHEDULED), mas a janela continua em OPEN. Quem lia so o
--     status da janela anunciava uma lista aberta que o servidor ja recusava.
--
-- A janela continua sendo o agregado dela mesma: nada aqui escreve em sessions
-- nem muda o ciclo de vida. So o que a leitura devolve muda, e de forma
-- aditiva -- os campos anteriores continuam todos no lugar.

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
  v_session public.sessions;
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

  select s.* into v_session
    from public.sessions s
   where s.id = p_window.session_id;

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
    -- Quem abre a inscricao por um link nao tem a pelada no aparelho: sem
    -- estes tres o cabecalho fica vazio e a janela anuncia OPEN numa sessao
    -- que ja comecou.
    'session_name', v_session.name,
    'session_date', v_session.date,
    'session_lifecycle_status', v_session.lifecycle_status,
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
