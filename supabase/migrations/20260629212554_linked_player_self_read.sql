-- Allow an authenticated user to read the player row linked to their auth account.
-- This prevents fresh browsers from falsely showing the athlete-link prompt before
-- a full local sync has hydrated the player list.

drop policy if exists "Linked users can read their own player" on public.players;

create policy "Linked users can read their own player"
  on public.players
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and deleted_at is null
  );
