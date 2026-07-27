-- community_profile_summary (20260726170000) shipped with only `revoke all ... from
-- anon`. Supabase's default privileges already grant `authenticated` ALL on new
-- objects in public, so the accompanying `grant select ... to authenticated` was a
-- no-op and INSERT/UPDATE/DELETE stayed in place.
--
-- That mattered because the view is single-table with no aggregate/DISTINCT/LIMIT,
-- which makes it auto-updatable, and it runs with its owner's rights (postgres,
-- rolbypassrls). Writes through it therefore reached public.profiles with NO RLS
-- filter applied — and profiles has no DELETE or INSERT policy at all, so those
-- operations were otherwise unreachable for everyone. Any authenticated user could
-- DELETE /rest/v1/community_profile_summary?id=eq.<victim> for anyone sharing a
-- community with them, cascading through community_members_user_id_fkey and removing
-- the victim from every community; PATCH could overwrite profiles.name the same way.
-- (Role escalation was never reachable: `role` is not a column of the view.)
--
-- The view is meant to be read-only. Revoke writes from both roles, then re-grant
-- only select. Order matters: the revoke must come first.

revoke all on public.community_profile_summary from anon, authenticated;
grant select on public.community_profile_summary to authenticated;
