-- The community capability layer (20260726100000) added
-- "Community capability holders can update communities" and tried to drop the old
-- policy by its original name, "Users can update own communities". That name had
-- already been replaced back in 20260610161203 by "Community owners and admins can
-- update communities", so the drop was a no-op and BOTH policies stayed live.
--
-- Postgres ORs permissive policies together, so the surviving legacy policy grants
-- UPDATE to any owner/admin regardless of capabilities — which silently bypasses a
-- community_role_capability_overrides row with granted = false. Dropping it makes
-- community_has_capability the single gate, as the design intended.
--
-- See docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.

drop policy if exists "Community owners and admins can update communities" on public.communities;
