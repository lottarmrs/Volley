# XS-W6-08a — Mandatory evaluation model

Make the versioned evaluation model mandatory for every Community, and give the organizing roles the
`ORGANIZER` responsibility the target Session commands require. First of three slices that make the
real team draw consume the authorized snapshot:

1. **XS-W6-08a** (this slice) — every Community activated; `ORGANIZER` by role.
2. **XS-W6-08b** — import each player's current attributes as an initial evaluation.
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
2. **`ORGANIZER` for owner, admin, moderator and organizador.** Moderator is included so the server
   matches `canCreateSession`, which already allows moderators; leaving them out would remove a
   permission they have today.
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

Communities with `authority_model = 'target'` are not mirrored, so a role change there grants
nothing. None exists in production.

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
- the owner holds an effective `ORGANIZER` right after `create_community_with_owner`;
- promoting a member to admin, to moderator and to organizador grants `ORGANIZER`; demoting to member
  revokes it; an ownership transfer keeps both parties' `ORGANIZER`;
- the backfill grants `ORGANIZER` to an admin who existed before the migration;
- the owner can `create_target_session` for the Community; a plain member gets `42501`.

Suites that assert behavior of a Community that is **not** activated get a fixture helper that
deletes the Community's row from `app_private.community_evaluation_cutovers` with the superuser
client before the assertion: `communityEvaluationEditor`, `balanceInputSnapshots`,
`playerEvaluationContributions`, `playerAccountLink`, `sessionRosterRevisions`,
`targetSessionCurrentRosterRevision`. Suites asserting that an owner or admin lacks
`session.manage` are updated to the new rule: `playerEvaluationContributions` (owner holds
`session.manage` now), `governanceCapabilities` (per-role capability lists gain `session.manage` for
owner, admin and moderator) and `sessionTargetRoot` (an owner without an explicit grant can now create
a COMMUNITY target Session; the refusal case moves to a plain member). Suites that grant `ORGANIZER`
explicitly keep working, since the grant is `on conflict do update`. The full suite run identifies any
other expectation the new rule changes.

### UI

- `SessionWizardRoute`: a member with resolved members sees the blocked view and no draft is
  created; an owner bootstraps the draft; unresolved members neither block nor bootstrap.
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
- **Target-model Communities** do not get `ORGANIZER` from role changes.
- Applying the migration to Panelinha waits for explicit user approval.
