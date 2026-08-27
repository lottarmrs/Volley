/**
 * XS-W0-04 — Schema security hardening baseline.
 *
 * ADR-SEC-003 / GINV-SEC-004: a SECURITY DEFINER function is a privileged endpoint. The
 * target contract is `SET search_path = ''` with every referenced object fully qualified,
 * so a caller-controlled schema cannot be resolved ahead of the intended one.
 *
 * The current schema pins `search_path = public` on 44 functions. That is NOT the target:
 * `public` is writable by the schema owner and resolvable ahead of `pg_catalog`, so it
 * narrows the attack rather than closing it.
 *
 * C6.01 is explicit that this must NOT become one huge rewrite migration: harden by touched
 * surface, and keep an explicit backlog. So this file freezes the known-legacy set and the
 * suite fails when a NEW function joins it. Nothing is rewritten here.
 */

/** Functions still carrying the legacy `search_path=public`. This list may only shrink. */
export const LEGACY_SEARCH_PATH_PUBLIC: readonly string[] = [
  'account_requires_aal2',
  'add_community_member_by_email',
  'add_community_member_by_identifier',
  'approve_join_request',
  'approve_player_avatar',
  'claim_session_ownership',
  'community_has_capability',
  'current_user_can_access_player',
  'current_user_has_community_role',
  'current_user_is_player_admin',
  'current_user_shares_profile',
  'disable_join_code',
  'ensure_account_ready',
  'ensure_community_owner_member',
  'find_community_by_code',
  'find_player_by_username',
  'generate_join_code',
  'generate_player_claim_code',
  'guard_active_player_reference',
  'guard_community_member_owner_role',
  'guard_player_account_identity_delete',
  'handle_new_user',
  'has_capability',
  'is_app_staff',
  'is_superadmin',
  'leave_community',
  'propose_player_avatar',
  'recalculate_player_career',
  'regenerate_career_events',
  'regenerate_career_events_for_sessions',
  'regenerate_player_milestones',
  'reject_join_request',
  'reject_player_avatar',
  'remove_community_member',
  'request_to_join_community',
  'request_to_join_public',
  'reset_product_data',
  'session_control_is_expired',
  'set_community_member_role',
  'set_community_visibility',
  'set_user_role',
  'transfer_community_ownership',
  'transfer_session_ownership',
  'unlink_player_user',
];

/**
 * W2 hardens identity, Community and authorization, so these come first.
 *
 * C6.01: "Audit existing definer functions and prioritize ones touched by W2 first."
 * Everything not listed here belongs to a later wave (career/statistics W9, avatars W11,
 * session/championship W3/W8) and stays in the backlog until that wave touches it.
 */
export const W2_HARDENING_PRIORITY: readonly string[] = [
  'add_community_member_by_email',
  'add_community_member_by_identifier',
  'approve_join_request',
  'community_has_capability',
  'current_user_can_access_player',
  'current_user_has_community_role',
  'current_user_is_player_admin',
  'current_user_shares_profile',
  'disable_join_code',
  'ensure_account_ready',
  'ensure_community_owner_member',
  'find_community_by_code',
  'generate_join_code',
  'guard_community_member_owner_role',
  'guard_player_account_identity_delete',
  'handle_new_user',
  'has_capability',
  'is_app_staff',
  'is_superadmin',
  'leave_community',
  'reject_join_request',
  'remove_community_member',
  'request_to_join_community',
  'request_to_join_public',
  'set_community_member_role',
  'set_community_visibility',
  'set_user_role',
  'transfer_community_ownership',
  'unlink_player_user',
];

/**
 * Non-`public` search_path settings that are already acceptable or deliberate.
 *
 * `rls_auto_enable` is an event trigger function pinned to `pg_catalog`; it is invoked by
 * the system, never by a caller. `unaccent`-dependent code needs `extensions` on the path.
 */
export const ACCEPTED_NON_PUBLIC_SEARCH_PATHS: Readonly<Record<string, string>> = {
  rls_auto_enable: 'search_path=pg_catalog',
};

/** Functions already meeting the ADR-SEC-003 target. This list may only grow. */
export const TARGET_EMPTY_SEARCH_PATH_COUNT = 1;
