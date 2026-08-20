-- Handle belongs to whoever registers an account.
--
-- 20260610161256 backfilled players.username for every row, deriving it from the
-- athlete's name. Athletes created by a moderator never registered, so those
-- handles squat the global namespace and can block the real person from claiming
-- their own at sign-up. This releases them: username survives only where an
-- account owns the row (user_id is not null).
--
-- players.id stays the canonical identity and keeps addressing every athlete in
-- the UI, so nothing becomes unreachable.

update public.players
set username = null
where user_id is null
  and username is not null;
