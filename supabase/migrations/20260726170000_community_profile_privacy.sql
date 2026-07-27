-- Hide profiles.email from ordinary community members; visible only to self, app
-- staff, or a viewer holding 'manage_members' in a community shared with the target.
-- See docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

drop policy if exists "Profiles are readable by self or shared communities" on public.profiles;

create policy "Profiles are readable by self, staff, or member managers"
  on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_app_staff()
    or exists (
      select 1
      from public.community_members viewer
      join public.community_members target
        on target.community_id = viewer.community_id
      where viewer.user_id = (select auth.uid())
        and viewer.status = 'active'
        and target.user_id = profiles.id
        and target.status = 'active'
        and public.community_has_capability(viewer.community_id, 'manage_members')
    )
  );

-- Column-limited view for ordinary members: never selects email, so it cannot leak
-- it regardless of the RLS bypass implied by view ownership. Authorization is
-- current_user_shares_profile(id), the same helper the old (too-broad) profiles
-- policy used. current_user_shares_profile is already `security definer` with
-- `search_path = public` (set in 20260610195250_harden_function_security.sql), so
-- this view can evaluate it regardless of the caller's now-narrower profiles RLS.
create or replace view public.community_profile_summary as
select p.id, p.name
from public.profiles p
where public.current_user_shares_profile(p.id);

grant select on public.community_profile_summary to authenticated;
revoke all on public.community_profile_summary from anon;
