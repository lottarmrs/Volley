-- Status handling for profile visibility was wrong on both sides after
-- 20260726170000. Two opposite defects, one migration.
--
-- 1. current_user_shares_profile (the gate behind community_profile_summary) never
--    filtered membership status on EITHER side. So someone whose join request was
--    still 'pending' — or had been 'rejected' — could read the name of every member
--    of a community they had merely asked to join. Now both sides must be 'active':
--    an ordinary active member sees other active members' names, nobody else does.
--
-- 2. The profiles SELECT policy required target.status = 'active', which is too
--    strict for the people whose job is reviewing joins. A holder of manage_members
--    could not read the profile of a 'pending' requester, so the "Pedidos para
--    entrar" panel fell back to the placeholder 'Solicitante' and admins could not
--    tell who was asking to join. The viewer must still be an active member with
--    manage_members; the target's status is now irrelevant, which is the point —
--    approving or rejecting a request requires seeing who it is from.
--
-- Net effect: pending/rejected requesters lose read access they should never have
-- had, and member managers regain read access they need to do the review.

create or replace function public.current_user_shares_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = (select auth.uid())
  or exists (
    select 1
    from public.community_members mine
    join public.community_members theirs on theirs.community_id = mine.community_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = target_user_id
      and theirs.status = 'active'
  );
$$;

drop policy if exists "Profiles are readable by self, staff, or member managers" on public.profiles;

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
        and public.community_has_capability(viewer.community_id, 'manage_members')
    )
  );
