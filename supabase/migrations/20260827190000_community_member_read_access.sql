-- C6 XS-W2-07 — Community RLS / BOLA cutover: member read access
--
-- THE DEFECT, first surfaced by the XS-W0-03 harness and confirmed again by the W2-07
-- matrix: a plain `member` cannot read their own Community.
--
-- The legacy read policy is
--   owner_id = auth.uid() OR current_user_has_community_role(id)
-- and that helper defaults allowed_roles to {owner, admin, moderator}. The CHECK constraint
-- on community_members also permits 'member' and 'organizador', so the policy named
-- "Community members can read communities" denies the very role it is named after. The same
-- helper gates community_players, so an ordinary member cannot see the athletes either.
--
-- WHY THIS IS ADDITIVE RATHER THAN A REWRITE. PostgreSQL combines permissive policies with
-- OR, so a new policy GRANTS without removing anything. Editing the helper's default would
-- silently widen every policy that calls it -- 44 functions and a dozen policies deep --
-- which is a much larger blast radius than this slice should take. The legacy policy keeps
-- its exact meaning; target-relation membership becomes an additional way to qualify.
--
-- Scoped to the target relation on purpose: the grant follows community_memberships, which
-- W2 owns, not community_members, which the legacy path still owns.

-- Members of a Community may read that Community.
create policy "Active target members can read their community"
  on public.communities
  for select
  using (public.current_user_is_active_community_member(id));

-- And may see the athletes in it. Reading the roster is the baseline reason to be a member;
-- managing it remains a separate capability.
create policy "Active target members can read community players"
  on public.community_players
  for select
  using (public.current_user_is_active_community_member(community_id));

comment on policy "Active target members can read their community" on public.communities is
  'C6 XS-W2-07. Additive: repairs member read access without altering the legacy policy or the shared role helper.';
