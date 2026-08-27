-- C6 XS-W2-08 — Remove dangerous Auth cascade from sports history
--
-- GINV-ID-005 / ADR-SEC-011: account deletion is NOT sports-history deletion.
--
-- THE INVENTORY (step 1 of the slice sequence) found ON DELETE CASCADE from auth.users on
-- owner_id for essentially every sports-fact table:
--
--   sessions, teams, games, point_events, game_reports, session_reports,
--   community_players, players, communities, championships, community_presence,
--   community_rules, player_evaluations, whatsapp_list_drafts, whatsapp_list_templates
--
-- CLASSIFICATION (step 2). `owner_id` on these tables is an ACTOR REFERENCE -- it records
-- which account created or synced the row -- not ownership of the sports fact itself. The
-- distinction matters enormously: an organizer who registers twenty guest athletes and
-- records their matches is the actor on all of it, and cascading their account deletion
-- would erase twenty other people's history.
--
-- Deleting an account currently fails for other reasons, so the cascade is latent rather
-- than actively destroying data. Latent is not safe: it is one trigger change away from
-- being real, and the exit gate is that no W2 target fact DEPENDS on the cascade.
--
-- THE FIX (steps 3-6). owner_id becomes nullable and the FK becomes ON DELETE SET NULL, so
-- the fact survives and the actor is anonymised. That is the target semantics for an actor
-- reference: we lose who recorded it, we do not lose that it happened.
--
-- SCOPE. The sports-fact tables the slice's own test exercises, plus communities. Tables
-- owned by later waves (championships, evaluations, notifications, media) keep their
-- current FKs and are recorded by the accompanying suite so W9/W11/W14 inherit a measured
-- list rather than a rumour.

do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array[
    'sessions', 'teams', 'games', 'point_events', 'game_reports', 'session_reports',
    'community_players', 'players', 'communities'
  ]
  loop
    -- owner_id must be nullable before SET NULL is even legal.
    execute format('alter table public.%I alter column owner_id drop not null', v_table);

    select con.conname into v_constraint
      from pg_constraint con
      join unnest(con.conkey) k on true
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
     where con.contype = 'f'
       and con.conrelid = format('public.%I', v_table)::regclass
       and con.confrelid = 'auth.users'::regclass
       and att.attname = 'owner_id'
     limit 1;

    if v_constraint is not null then
      execute format('alter table public.%I drop constraint %I', v_table, v_constraint);
      execute format(
        'alter table public.%I add constraint %I foreign key (owner_id) references auth.users(id) on delete set null',
        v_table, v_constraint
      );
      v_constraint := null;
    end if;
  end loop;
end $$;

comment on column public.games.owner_id is
  'Actor reference: which account recorded this. Nullable and SET NULL on account deletion, so the sports fact survives (GINV-ID-005).';
comment on column public.players.owner_id is
  'Actor reference: which account registered this Player. An organizer deleting their account must not erase athletes they registered.';

-- ── Ownership is the membership relation, not this column ──────────────────
-- communities.owner_id is now a denormalised convenience. The authoritative owner for a
-- target community is the active OWNER membership, and the deferred invariant from
-- XS-W2-04 still guarantees exactly one.
--
-- A consequence worth stating rather than discovering later: deleting the account of a
-- target community's owner cascades away their membership row, which leaves the community
-- ownerless and the deferred check REFUSES the whole deletion. That is a deliberate,
-- conservative outcome -- ownership must be transferred first -- and it is refusal, not
-- silent data loss. Auto-reassigning an owner would be inventing succession policy that no
-- accepted decision provides.
comment on column public.communities.owner_id is
  'Denormalised convenience. The authoritative owner of a target community is its active OWNER membership (C6 XS-W2-04).';
