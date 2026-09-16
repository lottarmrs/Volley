# XS-W6-08a — Mandatory evaluation model

Make the versioned evaluation model mandatory for every Community, and give the organizing roles the
`ORGANIZER` responsibility the target Session commands require. First of three slices that make the
real team draw consume the authorized snapshot:

1. **XS-W6-08a** (this slice) — every Community activated; `ORGANIZER` by role.
2. **XS-W6-08b** — import each player's current attributes as an initial evaluation. **Cancelled on
   2026-09-16:** production attributes are bulk creation defaults (3 or 5 in every dimension), not
   evaluations.
3. **XS-W6-08c** — the wizard draws from the authorized snapshot
   ([draft spec](2026-09-15-xs-w6-08-authorized-team-formation-design.md), rewritten when its turn
   comes).

## Why

The user's direction on 2026-09-15: the project is in development, so what C6 builds is mandatory; a
Community does not choose between the legacy and the new model.

Today the choice exists and nobody has made it. Production (Panelinha, exact counts on 2026-09-15):

- 6 Communities, all `authority_model = 'legacy'`, all mirrored by XS-W3-09, none in
  `app_private.community_evaluation_cutovers`;
- 0 rows in `player_evaluations` and in `player_evaluation_contributions` — no evaluation data in
  either model, so activating loses nothing;
- 0 `ORGANIZER` responsibilities. Roles: 6 owners, 1 admin, 2 members, no moderator or organizador.

Without activation, `capture_balance_input_snapshot`, the evaluation editor and target Session
creation all refuse. Without `ORGANIZER`, `create_target_session` and every W4 command refuse even
the Community's owner.

## Decisions taken with the user

1. **Activate every Community** — the existing ones through the migration, new ones through a
   trigger. The server checks stay as they are and always pass. Removing the activation concept is
   out of scope.
2. **`ORGANIZER` for owner, admin, moderator and organizador** in legacy Communities. Those are
   exactly the legacy roles `community_role_capabilities` grants `manage_sessions`, and the roles
   `canCreateSession` already allows, so the mirror translates a permission the legacy role already
   carries instead of inventing one. Target-model Communities keep `GINV-CAP-002` — a governance
   rank never confers an operational capability there — and no Community in production or created
   by the app is target-model.
3. **Only those roles create Community Sessions.** The app says so before creating the draft,
   instead of letting a member's Session loop on `42501` in every sync.

## Part 1 — Migration `20260915180000_mandatory_evaluation_model.sql`

Numbered after `20260915155701_approved_members_join_roster.sql`.

### Activation

```sql
insert into app_private.community_evaluation_cutovers (community_id, activated_by)
select c.id, null from public.communities c
on conflict (community_id) do nothing;
```

`app_private.activate_evaluation_model_for_new_community()` — `returns trigger`, `security definer`,
`search_path = ''`, revoked from `public, anon, authenticated` — inserts the new Community's id with
`activated_by = (select auth.uid())`, `on conflict do nothing`. Trigger
`activate_evaluation_model_on_community_insert`, `after insert on public.communities for each row`.
It covers `create_community_with_owner` and the legacy upsert alike.

`activate_community_evaluation_model` is unchanged; it already ignores the conflict.

### `ORGANIZER` by role

`app_private.mirror_community_member_to_target()` is redefined (last definition wins; the previous
one is in `20260914120000`). Only the organizing predicate changes:

```sql
v_was_organizer := old.role in ('owner', 'admin', 'moderator', 'organizador') and old.status = 'active';
v_is_organizer  := new.role in ('owner', 'admin', 'moderator', 'organizador') and new.status = 'active';
```

Everything else stays: the projection call, the `legacy_membership_mirrored` guard, the grant on
entering the set, the revocation on leaving it while still active, and the full revocation inside
`project_legacy_community_membership` when the membership ends. An ownership transfer moves the old
owner to admin, which stays inside the set, so nothing is revoked.

The role list is the default `manage_sessions` set of `community_role_capabilities`.
`community_role_capability_overrides` can remove a capability per Community; production has no
override rows, and honoring them is out of scope.

`app_private.community_membership_drift()` is redefined so `MISSING_ORGANIZER` covers the same four
roles instead of `organizador` alone; every other branch is unchanged.

### Backfill

```sql
insert into public.community_responsibilities (community_id, user_id, responsibility)
select m.community_id, m.user_id, 'ORGANIZER'
  from public.community_members m
 where m.role in ('owner', 'admin', 'moderator', 'organizador')
   and m.status = 'active'
   and app_private.legacy_membership_mirrored(m.community_id)
on conflict (community_id, user_id, responsibility) do update
  set revoked_at = null, assigned_at = pg_catalog.now()
  where public.community_responsibilities.revoked_at is not null;
```

In production this grants 7 responsibilities (6 owners, 1 admin).

### Out of scope

Communities with `authority_model = 'target'` — created only by `create_community_with_owner`, which
the app does not call — are not mirrored and gain no `ORGANIZER` from rank. That is `GINV-CAP-002`
working as designed, not a gap; `governanceCapabilities.dbtest.ts` pins it on a target Community.

## Part 2 — App

### Session creation guard

`useCommunityPermissions` returns `membersResolved: boolean` beside the permissions: `true` once the
members fetch has produced a list, or immediately when the fetch is disabled (no Supabase, no user,
local Community). `CommunityPermissions` itself does not change shape; the hook returns
`CommunityPermissions & { membersResolved: boolean }`.

`SessionWizardRoute`, before bootstrapping a `create` or `adopt` resolution:

- members not resolved: render nothing and do not bootstrap yet, as the route already renders
  nothing before bootstrap;
- `membersResolved && !permissions.canCreateSession`: do not create or adopt the draft; render a
  small blocked view with the message "Só dono, admin, moderador ou Organizador criam sessões nesta
  comunidade." and a "Voltar à comunidade" button to `paths.comunidade(community.id)`. The app has
  no cross-page notice mechanism, so the message lives on the route itself;
- otherwise: bootstrap as today.

The Dashboard's "Nova sessão" lands on this route and is covered by it. When the members fetch
fails, `membersResolved` stays false and the route keeps waiting instead of blocking an owner on a
network error; the server still refuses a member's Session.

### Evaluation editor

`CommunityEvaluationEditor` loses the `authority_model === 'legacy'` management block: the
"Confirmo que novas avaliações usarão o modelo experimental." checkbox, the "Ativar novo modelo"
button, `managerAcknowledged` and the `activateCommunityEvaluation` import. The legacy read-only
branch stays, because a Community whose migration has not been applied yet still reports `legacy`.
`activateCommunityEvaluation` stays in `communityEvaluationUseCases.ts` unused by screens; removing it
is W14.

### No change

- Sync: `community_evaluation_target_ids` now returns every Community, so new Community Sessions
  upload through `create_target_session` — by design.
- `canCreateSession` already allows owner, admin, moderator and organizador.

## Part 3 — Tests

### Database

`src/test/db/mandatoryEvaluationModel.dbtest.ts`:

- a Community created with `create_community_with_owner` is activated;
- a Community inserted directly into `public.communities` is activated;
- a Community that existed before the migration is activated — asserted by rebuilding with the
  migration excluded, creating a Community, then applying the migration file;
- in a legacy Community (row in `public.communities` plus an active `owner` row in
  `community_members`), the owner holds an effective `ORGANIZER` as soon as the owner row exists;
- promoting a member to admin, to moderator and to organizador grants `ORGANIZER`; demoting to member
  revokes it; an ownership transfer keeps both parties' `ORGANIZER`;
- `community_membership_drift()` reports `MISSING_ORGANIZER` for an admin whose responsibility was
  revoked by hand, and nothing after the backfill;
- the backfill grants `ORGANIZER` to an admin who existed before the migration;
- the legacy owner can `create_target_session` for the Community; a plain member gets `42501`;
- a target Community from `create_community_with_owner` stays without rank-derived `ORGANIZER`.

Existing suites that change:

- `communityEvaluationEditor.dbtest.ts` and `balanceInputSnapshots.dbtest.ts` create Communities
  and rely on them starting **not** activated; every test that needs activation already activates
  explicitly. Their Community fixture (`context()` and `newCommunity()`) deletes the new row from
  `app_private.community_evaluation_cutovers` right after creating the Community, restoring the
  starting state those tests were written against.
- `communityMembershipMirror.dbtest.ts`, test "a moderator mirrors as member, never above it": the
  moderator's governance projection is still `member`, but the responsibilities now equal
  `['ORGANIZER']`.

Found by the first full `npm run test:db` run (700/702), corrected during execution:

- `globalSkillProfile.dbtest.ts` writes a legacy evaluation into a Community it creates with
  `create_community_with_owner`, so it also relied on starting unactivated; its `community()`
  fixture deletes the activation like the editor and snapshot fixtures.
- `governanceCapabilities.dbtest.ts` proved `GINV-CAP-002` on a Community inserted straight into
  `public.communities`, which is a **legacy** Community whose owner the mirror now gives
  `ORGANIZER`. By user decision its `newCommunity()` fixture creates the Community with
  `authority_model = 'target'`, the model where the invariant holds; every assertion is unchanged.

`playerEvaluationContributions` and `sessionTargetRoot` build target Communities and stay unchanged.

### UI

- Session creation guard: the decision lives in a pure `resolveSessionCreationAccess` (`pending`
  while members are unresolved, `blocked` without `canCreateSession`, `allowed` otherwise) with a
  unit test, and the blocked view is a small `SessionCreationBlocked` component with its own spec.
  `SessionWizardRoute` only wires them, because rendering the route needs the whole shell.
- `CommunityEvaluationEditor.spec.tsx`: the activation test is replaced by one asserting the
  management block no longer offers activation.
- `useCommunityPermissions`: `membersResolved` false while loading, true after the list arrives and
  when the fetch is disabled.

### Gates

`npm run typecheck`, ESLint and Prettier on tracked files, `npm test`, `npm run build`,
`npm run check:architecture`, the full `npm run test:db`.

## Documentation

- `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`: XS-W6-08a note.
- `docs/architecture/execution/C6-REACHABILITY-MAP.md`: the activation wall is gone for every
  Community; `ORGANIZER` reaches owner, admin and moderator.
- `HANDOFF.md`: the slice and its limits.

## Known limitations

- **Activation is irreversible** on the server. After the migration runs in production, legacy
  evaluation writes are refused for every Community.
- **Target-model Communities** do not get `ORGANIZER` from rank (`GINV-CAP-002`).
- **Capability overrides** that remove `manage_sessions` from a role in one Community are not
  honored by the mirror.
- Applying the migration to Panelinha waits for explicit user approval.
