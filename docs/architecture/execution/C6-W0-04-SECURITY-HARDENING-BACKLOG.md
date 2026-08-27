# C6 XS-W0-04 — Schema security hardening backlog

> Status: `TRANSITIONAL / C6-W0-04`
>
> Owner: `Security / Data`
>
> Parent: [`C6.01-W0-W2-FOUNDATIONS-COMMUNITY.md`](C6.01-W0-W2-FOUNDATIONS-COMMUNITY.md)
>
> Generated from `src/test/db/schemaSecurityBaseline.ts`. Do not edit by hand.

---

# 0. What this is

`ADR-SEC-003` and `GINV-SEC-004` treat every `SECURITY DEFINER` function as a privileged
endpoint. The target contract is:

```text
SECURITY DEFINER only when required
SET search_path = ''
fully qualified object references
explicit grants and revokes
actor derived server-side from auth.uid()
no user-editable metadata used for authorization
```

The current schema pins `search_path = public` on **44** functions.
That is not the target: `public` is writable by the schema owner and resolves ahead of
`pg_catalog`, so it narrows the attack surface without closing it.

C6.01 is explicit that this must **not** become one large rewrite migration. Hardening
happens by touched surface, wave by wave, against this backlog.

# 1. Enforcement today

`src/test/db/schemaSecurity.dbtest.ts` runs against a real PostgreSQL and holds the line:

```text
TARGET   no callable SECURITY DEFINER function is reachable by anon or PUBLIC
TARGET   anon holds no table privilege anywhere in public
TARGET   every SECURITY DEFINER function pins some search_path
BASELINE no NEW function may join the search_path=public list below
BASELINE hardened functions must be removed from the list, keeping it honest
```

The baseline list may only shrink. A new privileged function using `search_path=public`
fails the suite; the fix is the function, not the list.

# 2. W2 priority — harden first

W2 covers identity, Community and authorization, so these are hardened as W2 touches them.

| Function | Current | Wave |
| --- | --- | --- |
| `add_community_member_by_email` | `search_path=public` | W2 |
| `add_community_member_by_identifier` | `search_path=public` | W2 |
| `approve_join_request` | `search_path=public` | W2 |
| `community_has_capability` | `search_path=public` | W2 |
| `current_user_can_access_player` | `search_path=public` | W2 |
| `current_user_has_community_role` | `search_path=public` | W2 |
| `current_user_is_player_admin` | `search_path=public` | W2 |
| `current_user_shares_profile` | `search_path=public` | W2 |
| `disable_join_code` | `search_path=public` | W2 |
| `ensure_account_ready` | `search_path=public` | W2 |
| `ensure_community_owner_member` | `search_path=public` | W2 |
| `find_community_by_code` | `search_path=public` | W2 |
| `generate_join_code` | `search_path=public` | W2 |
| `guard_community_member_owner_role` | `search_path=public` | W2 |
| `guard_player_account_identity_delete` | `search_path=public` | W2 |
| `handle_new_user` | `search_path=public` | W2 |
| `has_capability` | `search_path=public` | W2 |
| `is_app_staff` | `search_path=public` | W2 |
| `is_superadmin` | `search_path=public` | W2 |
| `leave_community` | `search_path=public` | W2 |
| `reject_join_request` | `search_path=public` | W2 |
| `remove_community_member` | `search_path=public` | W2 |
| `request_to_join_community` | `search_path=public` | W2 |
| `request_to_join_public` | `search_path=public` | W2 |
| `set_community_member_role` | `search_path=public` | W2 |
| `set_community_visibility` | `search_path=public` | W2 |
| `set_user_role` | `search_path=public` | W2 |
| `transfer_community_ownership` | `search_path=public` | W2 |
| `unlink_player_user` | `search_path=public` | W2 |

# 3. Later waves

Not touched by W2. These stay pending until their owning wave rewrites them, so that no
unrelated function is rewritten just to clear a list.

| Function | Current | Wave |
| --- | --- | --- |
| `account_requires_aal2` | `search_path=public` | later |
| `approve_player_avatar` | `search_path=public` | later |
| `claim_session_ownership` | `search_path=public` | later |
| `find_player_by_username` | `search_path=public` | later |
| `generate_player_claim_code` | `search_path=public` | later |
| `guard_active_player_reference` | `search_path=public` | later |
| `propose_player_avatar` | `search_path=public` | later |
| `recalculate_player_career` | `search_path=public` | later |
| `regenerate_career_events` | `search_path=public` | later |
| `regenerate_career_events_for_sessions` | `search_path=public` | later |
| `regenerate_player_milestones` | `search_path=public` | later |
| `reject_player_avatar` | `search_path=public` | later |
| `reset_product_data` | `search_path=public` | later |
| `session_control_is_expired` | `search_path=public` | later |
| `transfer_session_ownership` | `search_path=public` | later |

# 4. Classified as acceptable

- `rls_auto_enable` (`search_path=pg_catalog`) — event trigger function, invoked by the system and not directly callable. Verified in the suite rather than assumed.

# 5. Definition of done

A function leaves this backlog when it sets `search_path = ''`, fully qualifies every
referenced object, carries explicit grants with `EXECUTE` revoked from `PUBLIC`, and derives
its actor from `auth.uid()` rather than any client-supplied argument.
