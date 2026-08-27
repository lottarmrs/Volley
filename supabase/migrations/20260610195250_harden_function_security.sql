-- Address Supabase security advisors on the helper functions.
--
-- 1. Pin a stable search_path on the two functions that lacked one
--    (function_search_path_mutable).
-- 2. Revoke the default PUBLIC/anon EXECUTE on the SECURITY DEFINER helpers so
--    they are only callable by signed-in users (anon_security_definer_function_
--    executable). `authenticated` keeps EXECUTE because the RLS policies call
--    these helpers when evaluating access for signed-in users.

alter function public.set_updated_at() set search_path = public;
alter function public.prevent_last_community_owner_change() set search_path = public;

revoke execute on function public.current_user_has_community_role(uuid, text[]) from public, anon;
revoke execute on function public.current_user_can_access_player(uuid) from public, anon;
revoke execute on function public.current_user_shares_profile(uuid) from public, anon;
revoke execute on function public.add_community_member_by_email(uuid, text, text) from public, anon;
