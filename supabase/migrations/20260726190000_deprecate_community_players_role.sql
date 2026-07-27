-- community_players.role is superseded by community_members.role (the actual RBAC
-- table). Confirmed unused by any RLS policy or application logic as of this
-- migration. Not removed — removal is a separate, future decision. See
-- docs/superpowers/plans/2026-07-26-roles-permissions-security-hardening.md.
comment on column public.community_players.role is
  'DEPRECATED (2026-07-26): unused by RLS or application logic; superseded by community_members.role. Do not build new features on this column.';
