-- Make (owner_id, local_id) usable as an ON CONFLICT arbiter for client upserts.
--
-- The previous migration created these as PARTIAL unique indexes
-- (`where local_id is not null`). PostgreSQL cannot infer a partial unique index
-- as an ON CONFLICT target unless the statement repeats the index predicate, and
-- PostgREST/supabase-js `onConflict` only accepts column names (no predicate).
-- As a result, `upsert(record, { onConflict: 'owner_id,local_id' })` would raise
-- 42P10 ("no unique or exclusion constraint matching the ON CONFLICT specification")
-- on every call.
--
-- `local_id` is always populated by the client mappers (`local_id: local.id`),
-- so dropping the partial predicate is safe: there are no NULL local_id rows, and
-- even if there were, NULLs never collide under a unique index. Re-creating the
-- indexes as non-partial lets the client reconcile re-uploaded records by their
-- local id instead of inserting duplicates that violate the unique index.

drop index if exists public.communities_owner_local_id_idx;
drop index if exists public.players_owner_local_id_idx;
drop index if exists public.whatsapp_templates_owner_local_id_idx;
drop index if exists public.sessions_owner_local_id_idx;
drop index if exists public.teams_owner_local_id_idx;
drop index if exists public.games_owner_local_id_idx;
drop index if exists public.point_events_owner_local_id_idx;
drop index if exists public.game_reports_owner_local_id_idx;
drop index if exists public.session_reports_owner_local_id_idx;
drop index if exists public.community_presence_owner_local_id_idx;
drop index if exists public.whatsapp_list_drafts_owner_local_id_idx;

create unique index if not exists communities_owner_local_id_idx on public.communities (owner_id, local_id);
create unique index if not exists players_owner_local_id_idx on public.players (owner_id, local_id);
create unique index if not exists whatsapp_templates_owner_local_id_idx on public.whatsapp_list_templates (owner_id, local_id);
create unique index if not exists sessions_owner_local_id_idx on public.sessions (owner_id, local_id);
create unique index if not exists teams_owner_local_id_idx on public.teams (owner_id, local_id);
create unique index if not exists games_owner_local_id_idx on public.games (owner_id, local_id);
create unique index if not exists point_events_owner_local_id_idx on public.point_events (owner_id, local_id);
create unique index if not exists game_reports_owner_local_id_idx on public.game_reports (owner_id, local_id);
create unique index if not exists session_reports_owner_local_id_idx on public.session_reports (owner_id, local_id);
create unique index if not exists community_presence_owner_local_id_idx on public.community_presence (owner_id, local_id);
create unique index if not exists whatsapp_list_drafts_owner_local_id_idx on public.whatsapp_list_drafts (owner_id, local_id);
