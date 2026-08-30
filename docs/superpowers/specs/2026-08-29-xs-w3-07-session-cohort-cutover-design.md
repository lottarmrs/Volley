# XS-W3-07 — Session Cohort Cutover Design

**Status:** Approved design

**Date:** 2026-08-29

**Execution slice:** `XS-W3-07`

**Authority change:** `CUTS_OVER`, one eligible Session at a time

**Schema phase:** `EXPAND / CUTOVER`, no contract removal

## Purpose

Complete the W3 Session backbone by making its cohort rule executable:

```text
new target Session
→ target authority from creation

eligible legacy draft Session
→ explicit validated one-way cutover

legacy active Session
→ legacy until terminal

legacy terminal Session
→ historical evidence backfill without fabricated target semantics
```

The slice does not remove the legacy Session columns, generic sync service, legacy Team/Game
models, or compatibility readers. It establishes one effective Session-root authority and makes
the boundary observable and testable before W4 introduces Registration.

## Canonical inputs

This design follows:

- `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, XS-W3-07;
- `docs/architecture/execution/C6-EXECUTION-MASTER.md`, authority ledger and cohort strategy;
- `docs/architecture/migration/N2.22-migration-strangler.md`, one authority, explicit migration,
  cutover fencing, rollback and adversarial cases;
- `docs/architecture/contexts/N2.04-sessions.md`, Session migration anchor and lifecycle;
- `docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md` and
  `C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`;
- `ADR-MIG-001..009`, especially persisted cohort state and no implicit reverse migration.

## Current state and exact gap

W3-01 through W3-06 already provide:

- `sessions.authority_model = legacy | target`;
- `sessions.target_model_version = 1` for target rows;
- target Session semantic dimensions and revision;
- target organizer assignments, courts, rules snapshots, roster revisions and participants;
- target readiness and lifecycle commands;
- new target Sessions born through `create_target_session`;
- terminal legacy selected-roster backfill with provenance and anomaly quarantine;
- authenticated direct Session RLS policies limited to `authority_model = legacy`;
- legacy Session ownership RPCs rejecting target Sessions.

The remaining gaps are:

1. no supported command moves one eligible legacy Session to target authority;
2. no durable provenance row describes when and how a target Session entered the cohort;
3. no structural rule makes `target → legacy` authority reversal impossible;
4. no serialized fence proves that a final legacy write is either included before cutover or
   rejected after cutover;
5. the generic operational sync still fetches every Session into timestamp merge and emits an
   unqualified legacy-shaped Session upsert;
6. the exact conservative eligibility boundary is not executable.

## Alternatives considered

### A. Explicit per-Session cutover with persisted provenance — selected

A semantic command locks one legacy Session, validates a source fingerprint and eligibility,
materializes only exact target facts, writes the target selector and provenance atomically, and
returns an idempotent result. Generic sync becomes cohort-aware.

This is the smallest approach that satisfies the authority-transfer and race requirements.

### B. Treat the existing column and RLS as complete

Rejected. It protects already-target rows from authenticated generic CRUD, but provides no
supported transition, provenance, source checkpoint, or race proof.

### C. Automatic or deployment-wide conversion

Rejected. Status/date heuristics would silently interpret legacy `type`, `config`, arrays and
execution state, violating the non-invention rule and active-cohort protection.

## Authority model

### Effective selector

`public.sessions.authority_model` remains the effective write selector. No second table decides
truth.

```text
legacy
→ legacy Session root and generic operational sync may write

target
→ target semantic Session commands are authoritative
```

`target_model_version` records the semantic contract version and remains `1` in this slice.

### Provenance ledger

Add an internal, narrow provenance table such as
`app_private.session_authority_cutovers`:

```text
session_id                  primary key, FK sessions ON DELETE RESTRICT
source_authority            NONE | LEGACY
target_model_version        1
cutover_kind                NEW_TARGET | LEGACY_EXPLICIT
command_id                  nullable only for pre-existing/new target creation compatibility
source_fingerprint          required for LEGACY_EXPLICIT
cutover_by_user_id          nullable actor reference, ON DELETE SET NULL
cutover_at
```

This table records provenance; it does not replace `sessions.authority_model` as authority.

All target rows present when the migration is applied receive deterministic `NEW_TARGET` ledger
rows. `create_target_session` is replaced additively so future target creation writes the Session,
its existing bootstrap artifacts and the ledger in one transaction.

The ledger is internal, RLS-enabled, unavailable to `public`, `anon` and `authenticated`, and
immutable except for account-deletion anonymization of the actor reference.

### Structural one-way rule

A Session authority trigger enforces:

- `target → legacy` is always rejected;
- `legacy → target` is accepted only inside the semantic cutover command;
- ordinary updates that leave a legacy row legacy continue unchanged;
- target creation remains valid because it is inserted directly as target and must satisfy the
  deferred ledger invariant before commit.

A deferred constraint trigger requires every target Session to have exactly one corresponding
ledger row by transaction end. This permits atomic Session-then-ledger creation without exposing a
moment of committed ambiguity.

## Conservative eligibility

The first explicit transition supports only the provably safe subset described by
`N10-MIG-083`.

A legacy Session is eligible only when all conditions hold under the locked row:

- `authority_model = legacy`;
- `status = draft` exactly;
- `deleted_at is null`;
- no `games` row references it, including soft-deleted historical evidence;
- `team_ids` is empty and no `teams` row references it;
- no target organizer/court/rules/roster artifact already exists unexpectedly;
- every non-empty `selected_player_ids` token resolves exactly once;
- distinct source tokens resolve to distinct Players;
- authorization and requested target dimensions are valid.

`players_selected`, `configured`, `teams_generated`, `active`, `paused`, `finished` and
`cancelled` are not eligible for this first interactive cutover. Widening the cohort requires
explicit policy/evidence and is not inferred here.

This strict boundary does not claim those Sessions can never migrate. It preserves the current
safe behavior for `OPEN-MIG-005..007`: ambiguous or richer upcoming Sessions remain legacy until a
specific import policy exists.

## Inspection and transition contracts

### Inspect legacy Session cutover

Provide a purpose-specific authenticated read command, conceptually:

```text
inspect_legacy_session_cutover(session_id)
→ eligible
→ blockers[]
→ source_fingerprint
→ source summary safe for the authorized actor
```

The read resolves the Session before authorization. It never trusts Community or actor context
from the client.

Blockers use a bounded vocabulary, including at least:

```text
NOT_LEGACY
NOT_DRAFT
SOFT_DELETED
HAS_GAME_EVIDENCE
HAS_TEAM_EVIDENCE
HAS_TARGET_ARTIFACTS
ROSTER_TOKEN_REPEATED
ROSTER_TOKEN_UNRESOLVED
ROSTER_TOKEN_AMBIGUOUS
ROSTER_PLAYERS_COLLIDE
```

Authorization denial remains an authorization error rather than a data-disclosure blocker.

### Explicit transition

Provide an authenticated semantic command, conceptually:

```text
transition_legacy_session_to_target(
  session_id,
  command_id,
  expected_source_fingerprint,
  session_context,
  play_mode
)
```

The client does not supply owner, Community, organizer membership, lifecycle, revision, authority
or target version.

The command:

1. resolves an existing command receipt before stale-source validation;
2. locks the Session row;
3. derives the actor from `auth.uid()`;
4. authorizes against the locked Session and current Membership/responsibility state;
5. recomputes and compares the full legacy source fingerprint;
6. validates every eligibility condition and the explicit target dimensions;
7. materializes an exact roster revision when the selected roster is non-empty;
8. creates the responsible organizer assignment for the authenticated actor;
9. sets target semantic root fields, target model version and revision;
10. inserts the authority ledger row;
11. records the command receipt and returns the target Session identity/revision.

All steps commit or roll back together.

### Source fingerprint

The fingerprint covers every legacy Session-root field whose change could alter the cutover
decision, including identity/context, status/type, selected/team arrays, config, schedule/date,
display fields, deletion/control fields and relevant legacy timestamps.

It is a concurrency checkpoint, not an authority source. A mismatch returns a stable stale-source
failure and requires reinspection.

### Target values after transition

The command does not infer target dimensions from legacy `type` or `config`.

- `session_context` and `play_mode` come from explicit validated command choices;
- lifecycle becomes `DRAFT` because only legacy `draft` is eligible;
- publication becomes `PRIVATE`;
- target version becomes `1`;
- compatibility `status/type` are derived from those target values;
- legacy arrays/config/local fields remain preserved as non-authoritative evidence;
- no Registration chronology, RulesSnapshot, Court, TeamDraw, vote or Match is fabricated.

The transitioned Session may therefore remain not ready. Existing readiness blockers lead the
Organizer through explicit target roster/rules/court preparation.

## Roster handling

The exact token-resolution rules match the existing terminal legacy roster importer:

- exact `players.id::text`; or
- owner-scoped `players.local_id`;
- exactly one distinct Player per token;
- no repeated token;
- no two tokens collapsing onto the same Player;
- whole-Session success or no roster materialization.

The resulting revision uses `source_kind = LEGACY_SELECTED_ROSTER`, snapshots display identity,
records the source hash and creates no Registration/FIFO semantics.

Resolution logic should be factored into an internal helper shared by the historical importer and
interactive cutover rather than duplicated with divergent rules.

## Authorization

For a Community-less legacy Session, only its current legacy owner may inspect/transition it as
`QUICK`.

For a Community Session, the caller must have the current `session.manage` capability and the
active Membership/responsibility required by target Session creation. The command records the
exact Membership in `SessionOrganizerAssignment`; legacy `owner_id` is not silently converted into
an Organizer assignment.

Knowledge of a Session UUID, a client-supplied Community ID or a legacy role string grants
nothing.

## Generic sync compatibility

W3-07 subtracts only Session-root authority from the global sync path.

The operational Session adapter becomes cohort-aware:

- generic download selects only `authority_model = legacy` Session roots;
- generic Session upload explicitly identifies its write as legacy;
- an attempted collision with a target Session is rejected and classified as a target-cohort
  semantic-command requirement;
- target Sessions never enter `mergeEntityLists` as timestamp-merge candidates;
- no generic payload gains target roster/rules/organizer/court fields.

Legacy Team/Game/PointEvent/report entities are not removed in W3-07. Their later authority
cutovers remain owned by W6, W7 and subsequent waves. This slice must not accidentally retire
their still-supported compatibility paths.

## Historical and active cohorts

### Active legacy

`active` and `paused` Sessions stay completely legacy. Enabling target creation or deploying this
migration does not change them.

### Terminal legacy

`finished` and `cancelled` roots remain legacy historical evidence in W3-07. The existing roster
backfill may materialize exact target historical roster evidence while leaving root authority and
legacy fields unchanged.

No terminal row is relabeled target merely because a roster revision exists.

### New target

New Sessions created through `create_target_session` remain target from birth and receive ledger
provenance atomically. A rollout stop may pause new target creation but cannot revert these rows.

## Concurrency and idempotency

- same `command_id` retry returns the original logical result, even after authority already moved;
- reuse of one command ID for another Session or command type is rejected;
- two distinct cutover command IDs for the same unchanged source create one authority transfer and
  one ledger row;
- a final legacy update racing cutover either commits before the locked fingerprint snapshot or is
  rejected/skipped after target authority; it never disappears between models;
- target authority cannot be changed back by SQL update, feature flag, sync retry or frontend
  rollback.

The existing command receipt substrate is reused. No second idempotency framework is introduced.

## Failure and rollback

Before cutover commit, any error rolls back all target artifacts and legacy remains authoritative.

After cutover commit:

- stop new cohort transitions if necessary;
- preserve target authority for already transitioned Sessions;
- use compatible target commands/readers or forward-fix;
- never copy stale legacy arrays/config back over target state;
- never delete the ledger to simulate rollback.

No destructive down migration or legacy contract removal belongs to this slice.

## Required executable evidence

### PostgreSQL integration

Tests against the active real PostgreSQL harness must prove:

1. every target Session has exactly one immutable ledger row;
2. legacy rows remain legacy until explicit transition;
3. `target → legacy` and unannounced `legacy → target` updates fail structurally;
4. a valid strict draft transition commits root, assignment, optional roster, ledger and receipt;
5. empty roster remains valid but readiness reports the existing blocker;
6. roster import preserves order/identity and invents no FIFO/Registration facts;
7. every eligibility blocker leaves the entire Session legacy with no partial target artifacts;
8. unauthorized cross-Community/UUID attempts fail without information leakage;
9. same-command retry and different-command concurrency produce one cutover;
10. stale fingerprint and final-legacy-write races are fenced;
11. active/paused and terminal historical cohorts are not relabeled;
12. generic authenticated Session upsert/update cannot mutate a target row;
13. migration from zero and migration over existing target rows both produce a valid ledger.

### TypeScript/unit architecture evidence

Tests must prove:

- operational Session fetch is filtered to legacy roots;
- generic Session upload is explicitly legacy and maps target-cohort rejection stably;
- target Session rows cannot enter timestamp merge through the operational download;
- the global payload does not acquire normalized target Session state;
- no new target Session command uses generic `.upsert()`.

### Full gates

Run in CI order plus database gates:

```text
typecheck
lint:eslint
format:check
test:unit
test:ui
test:db twice
fresh migration chain
build
architecture guards
```

Known unrelated global lint/format baseline findings remain separate; all changed paths must be
clean.

## Exit gate

XS-W3-07 is complete when:

- new target Sessions and explicitly transitioned strict legacy drafts have persisted, testable
  target authority;
- active legacy Sessions remain legacy;
- terminal historical backfill remains provenance-preserving and non-authoritative at the root;
- the cutover is idempotent, serialized and irreversible without an explicit future recovery
  protocol;
- legacy generic sync cannot download/merge/write a target Session root or write normalized target
  roster/rules/organizer/court state;
- W4 can select target Sessions solely from the persisted cohort selector/version.

## Legacy removal implications

This slice makes the following future retirement work measurable but does not perform it:

- `selected_player_ids[]` and `team_ids[]` removal waits for W4/W6 readers and old-client evidence;
- `operationalCloudService` Session removal waits for zero legacy Session cohorts;
- legacy `status/type/config/local_id/sync_version/deleted_at` contract waits for W14;
- Team/Game/PointEvent generic sync remains until its owning waves cut authority;
- the authority ledger remains migration/audit evidence under the future retention decision.
