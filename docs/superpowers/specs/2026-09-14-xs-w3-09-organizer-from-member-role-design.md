# XS-W3-09 — ORGANIZER from the Organizador role

Make `create_target_session` reachable for anyone promoted to Organizador in the members panel.
Inserted after XS-W3-08: it knocks down wall 3 of the
[reachability map](../../architecture/execution/C6-REACHABILITY-MAP.md) — creating a target Session
needs `ORGANIZER`, and the app never grants it.

## Why this slice exists

`set_community_organizer` (`20260910100000`) has no caller in `src/`, so only organizers seeded by the
one-time backfill of `20260827150000` hold `ORGANIZER`. Everyone else in an activated Community gets
`42501` from `create_target_session` on every sync (HANDOFF, known issue).

Wiring a caller is not enough, because the two membership tables have drifted apart since the split of
`20260827140000`, which was expand-only ("community_members remains authoritative until W2 cutover").

Writers, by newest definition:

- **`community_members` only** — `add_community_member_by_identifier`, `request_to_join_community`,
  `request_to_join_public`, `approve_join_request`, `reject_join_request`,
  `set_community_member_role`, `remove_community_member`, `leave_community`, the master-only
  `transfer_community_ownership`, and the trigger `ensure_community_owner_member`;
- **`community_memberships` only**, none of them called by the client —
  `create_community_with_owner`, `approve_community_join_request`, `transfer_community_ownership_v2`.

Every call the members panel makes goes to the first group. Everything C6 reads goes to the second:
`community_capabilities`, `set_community_organizer`, `set_community_evaluator` and
`create_target_session` all require an active row in `community_memberships`. Consequences today:

1. A member added or approved after 2026-08-27 has no membership row. `set_community_organizer` refuses
   them with `23514`, and even holding `ORGANIZER` they would get `42501` ("Active Community
   Membership is required") from `create_target_session`.
2. An owner or admin of a Community created after the split has no membership row, so no
   `community.members.manage`, so cannot grant anything through the C6 commands.
3. **A removed member keeps access.** `remove_community_member` and `leave_community` delete only the
   legacy row. A backfilled organizer removed since the split still has an active membership and an
   active `ORGANIZER`, and can still create target Sessions in that Community.
4. HANDOFF finding A6 (`name: null` for admins added through the normal path) has the same root.

## Decisions

### 1. ORGANIZER follows the Organizador role

Decided by the user on 2026-09-14, over an explicit per-member toggle. Setting the legacy role
`organizador` grants `ORGANIZER`; leaving that role revokes it. This is the mapping the backfill of
`20260827150000` already applied and the one N2.03 §29.1 fixes ("legacy organizador → MEMBER +
ORGANIZER"). No UI change: the existing Organizador option ("Pode criar sessões e tocar a pelada.")
starts doing what it says for target Sessions too.

Accepted consequence: owners and admins do not receive `ORGANIZER`, so an owner who creates a Session
in an activated Community still gets `42501` on every sync. N2.03 treats "OWNER without ORGANIZER" as
a valid state; this slice does not change it, and the HANDOFF known issue stays open for them.

### 2. Mirror by trigger on `community_members`, not by editing the RPCs

One `after insert or update or delete` row trigger on `public.community_members` projects every legacy
write into `community_memberships` and `community_responsibilities`.

Why a trigger rather than rewriting the ten writers above:

- it covers every writer, including the owner trigger and the master-only legacy transfer, and any
  writer added before the W2 cutover;
- the RPC bodies, their `require_aal2` ordering, grants and `search_path` stay untouched, so the
  `schema.sql` verbatim assertions and the MFA assertions in `schema.test.ts` keep holding;
- the projection rules live in one function instead of ten copies.

Against C6 master §10.4 (dual write): `community_members` is the canonical side for legacy Communities;
both writes are atomic in the same transaction; drift is measured by
`app_private.community_membership_drift()`; the removal gate is the W2 membership cutover, which drops
the trigger when writers move to `community_memberships`. The "one semantic command owns both writes"
item is met by a single trigger function owning the second write for every command — a deliberate
deviation from the letter, recorded here.

### 3. Projection rules

The trigger function is `app_private.mirror_community_member_to_target()`, `security definer`,
`set search_path = ''`, no grant to browser roles.

| Legacy change                                                    | Target effect                                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| row is `status = 'active'`                                       | upsert membership `(community_id, user_id)`, `status 'active'`, role mapped as below           |
| role mapping                                                     | `owner → owner`, `admin → admin`, `moderator`/`organizador`/`member → member`                  |
| row becomes non-active (`pending`, `invited`, `rejected`) or is deleted | delete the membership row; revoke every active responsibility of that user in that Community |
| becomes effective organizador (insert, role change or activation) | `ORGANIZER` inserted, or reactivated (`revoked_at = null`, `assigned_by = auth.uid()`)         |
| role leaves `organizador` while staying active                   | `ORGANIZER` revoked                                                                            |
| any other change                                                 | responsibilities untouched                                                                     |
| mirrored role is `owner` and another active owner membership exists | that membership is set to `admin` first                                                     |
| Community row no longer exists (deleted in the same transaction) | no-op; the cascades remove memberships and responsibilities                                   |
| Community has `authority_model = 'target'`                       | no-op                                                                                          |
| Community has no active legacy owner                             | no-op (reported by the drift function)                                                         |

Notes on the less obvious rows:

- **Moderator maps to member**, as the backfill did; OPEN-COM-003 stays open and the moderator's
  legacy capabilities keep being served by the legacy tables.
- **Deleting, not suspending.** `community_memberships.status` only allows `active | suspended`, and
  neither means "removed". The only FK into the table
  (`session_organizer_assignments.community_membership_id`) is `on delete set null deferrable
  initially deferred`, so deleting is safe; rejoining upserts a fresh row.
- **Losing the membership revokes all responsibilities**, `EVALUATOR` included. Their capabilities
  already require an active membership, so nothing visible changes today; without the revoke, rejoining
  would silently restore them.
- **Only the organizador transition touches `ORGANIZER`.** An `ORGANIZER` granted independently through
  `set_community_organizer` survives an unrelated change such as `member → admin`.
- **Owner promotion.** The legacy transfer promotes the new owner before demoting the old one.
  `community_memberships_one_active_owner` is an immediate partial unique index, so mirroring the
  promotion as-is raises `23505`. Demoting the current owner membership to `admin` first matches what
  the legacy transfer does in its next statement; the deferred exactly-one-owner trigger judges the
  final state.
- **Target Communities are skipped** because `create_community_with_owner` inserts the Community, the
  legacy owner trigger then inserts the owner into `community_members`, and the command writes the owner
  membership itself — mirroring would collide with it.
- **Ownerless legacy Communities are skipped** so a legacy write never fails at commit on the deferred
  owner invariant because of pre-existing bad data.

### 4. One-time reconciliation in the same migration

Legacy-authority Communities only, recorded in `app_private.migration_runs` /
`migration_entity_map` / `migration_anomalies` like the earlier backfills:

1. insert missing memberships for active legacy rows (owner rows included), and correct mapped roles;
2. delete memberships that have no active legacy row, revoking their responsibilities;
3. grant `ORGANIZER` to active `organizador` rows that lack it (promotions since the backfill);
4. skip Communities without exactly one active legacy owner, each recorded as an anomaly.

After it runs, `app_private.community_membership_drift()` returns no rows for legacy Communities that
were not skipped.

## Non-goals

- No UI. No caller for `set_community_organizer`; no ORGANIZER for owners or admins.
- No change to target-cohort Communities, to the W2 membership cutover, or to OPEN-COM-003.
- No change to reset or account deletion, and no fix to A6 beyond the data now being present.

## Verification

New suite `src/test/db/communityMembershipMirror.dbtest.ts`, against a real database:

1. **Written first, must fail today:** in a legacy Community, the owner adds a member with
   `add_community_member_by_identifier` and sets `organizador` with `set_community_member_role`; that
   member's `create_target_session` succeeds. Today it raises `42501`.
2. Changing the role back to `member` makes it raise `42501` again.
3. `remove_community_member` and `leave_community` delete the membership, revoke `ORGANIZER` and
   `EVALUATOR`, and `create_target_session` raises `42501`.
4. `request_to_join_community` creates no membership; `approve_join_request` creates it;
   `reject_join_request` leaves none.
5. `moderator` mirrors as `member`.
6. An `ORGANIZER` granted by `set_community_organizer` survives `member → admin`.
7. Legacy `transfer_community_ownership` leaves exactly one active owner membership.
8. `create_community_with_owner` still works, and a target Community is not mirrored.
9. Deleting a legacy Community cascades without error.
10. Reconciliation: rebuild up to the previous migration, create drift, apply this migration, and
    assert the drift function is empty and anomalies are recorded for an ownerless Community.
11. Neither the trigger function nor the drift function is executable by `anon` or `authenticated`.

Guards proven by mutation, as in earlier slices: skipping target Communities, the owner demotion, and
revoking only on the organizador transition. Then `npm run typecheck`, `npm test`, the full
`npm run test:db` and `npm run build`. README migration list, `schemaSecurityBaseline.ts` and
`currentStateLedger.ts` are updated if their tests require it; HANDOFF and the reachability map are
re-derived at the end.
