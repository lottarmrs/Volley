-- Migration: Optimize community_players for data history and offline sync.
-- Adds status, role, sync_version, and deleted_at columns to public.community_players.
-- Updates indexes, triggers, and RLS policies for improved performance.

-- 1. Add new columns to public.community_players if they do not exist
ALTER TABLE public.community_players 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'banned')),
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('owner', 'admin', 'player', 'guest')),
  ADD COLUMN IF NOT EXISTS sync_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Create trigger to keep 'active' and 'status' columns in sync
CREATE OR REPLACE FUNCTION public.sync_community_player_active_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT NULL AND (OLD.status IS NULL OR NEW.status <> OLD.status) THEN
    NEW.active := (NEW.status = 'active');
  ELSIF NEW.active IS NOT NULL AND (OLD.active IS NULL OR NEW.active <> OLD.active) THEN
    NEW.status := CASE WHEN NEW.active THEN 'active' ELSE 'inactive' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_community_player_active_status ON public.community_players;
CREATE TRIGGER trigger_sync_community_player_active_status
  BEFORE INSERT OR UPDATE ON public.community_players
  FOR EACH ROW EXECUTE FUNCTION public.sync_community_player_active_status();

-- 3. Create indices for optimized lookups
-- Index for finding active memberships in a community
CREATE INDEX IF NOT EXISTS idx_community_players_active_lookup 
ON public.community_players (community_id, player_id) 
WHERE status = 'active' AND deleted_at IS NULL;

-- Index for finding all communities of a player
CREATE INDEX IF NOT EXISTS idx_community_players_player_lookup
ON public.community_players (player_id);

-- Index for sync_version / updated_at / deleted_at
CREATE INDEX IF NOT EXISTS community_players_updated_at_idx ON public.community_players (updated_at);
CREATE INDEX IF NOT EXISTS community_players_deleted_at_idx ON public.community_players (deleted_at);

-- 4. Set up auto updated_at trigger (using existing public.set_updated_at function)
DROP TRIGGER IF EXISTS set_community_players_updated_at ON public.community_players;
CREATE TRIGGER set_community_players_updated_at
  BEFORE UPDATE ON public.community_players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Set up RLS policies optimized for performance
ALTER TABLE public.community_players ENABLE ROW LEVEL SECURITY;

-- Drop old policies to replace them
DROP POLICY IF EXISTS "Community members can read community players" ON public.community_players;
DROP POLICY IF EXISTS "Community organizers can insert community players" ON public.community_players;
DROP POLICY IF EXISTS "Community organizers can update community players" ON public.community_players;
DROP POLICY IF EXISTS "Community organizers can delete community players" ON public.community_players;
DROP POLICY IF EXISTS "Users can read own community players" ON public.community_players;
DROP POLICY IF EXISTS "Users can insert own community players" ON public.community_players;
DROP POLICY IF EXISTS "Users can update own community players" ON public.community_players;
DROP POLICY IF EXISTS "Users can delete own community players" ON public.community_players;

-- Recreate policies using current_user_has_community_role helper
CREATE POLICY "Community members can read community players" ON public.community_players
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid()) 
    OR public.current_user_has_community_role(community_id)
  );

CREATE POLICY "Community organizers can insert community players" ON public.community_players
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid()) 
    AND public.current_user_has_community_role(community_id, ARRAY['owner', 'admin', 'organizer'])
  );

CREATE POLICY "Community organizers can update community players" ON public.community_players
  FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT auth.uid()) 
    OR public.current_user_has_community_role(community_id, ARRAY['owner', 'admin', 'organizer'])
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid()) 
    OR public.current_user_has_community_role(community_id, ARRAY['owner', 'admin', 'organizer'])
  );

CREATE POLICY "Community organizers can delete community players" ON public.community_players
  FOR DELETE TO authenticated
  USING (
    owner_id = (SELECT auth.uid()) 
    OR public.current_user_has_community_role(community_id, ARRAY['owner', 'admin', 'organizer'])
  );
