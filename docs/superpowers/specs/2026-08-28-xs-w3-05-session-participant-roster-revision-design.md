# XS-W3-05 SessionParticipant and RosterRevision Design

## Context

`XS-W3-05` replaces the target Session roster concept currently embedded in
`sessions.selected_player_ids[]` with normalized participant identities and immutable roster
revisions. It is an additive strangler step: legacy Sessions and their arrays continue to exist,
while target Quick Sessions gain a semantic roster command and an exact revision identity that
later Team Formation can consume.

The slice must preserve three distinctions established by the architecture:

- `SessionParticipant` is effective participation context, not registration intent;
- a linked Player and a Guest are different identity forms, and a Guest does not create a global
  Player;
- a roster composition is an immutable revision, not mutable Session metadata.

W4 will add Registration and materialize Community rosters from confirmed registrations. W6 will
make Team Formation consume a specific roster revision. This slice creates the shared substrate
without inventing either downstream model.

## Goals

- Add `session_participants`, `roster_revisions`, and `roster_revision_entries`.
- Represent linked Players and Guests with minimal contextual identity.
- Make every materialized roster an immutable, ordered revision.
- Add an idempotent semantic command for direct target Quick roster replacement.
- Provide an authorized exact-revision read surface independent of the legacy selected-player
  array.
- Import trustworthy terminal legacy rosters with explicit provenance and quarantine ambiguous
  sources.
- Leave a private materialization boundary that W4 can reuse for Community Registration.

## Non-goals

- Do not add RegistrationWindow, RegistrationEntry, queue, waitlist, or FIFO history.
- Do not let Community Sessions call the Quick roster command.
- Do not add Team CandidateSet, TeamDraw, rating snapshots, or solver integration.
- Do not convert active, paused, draft, upcoming, or otherwise non-terminal legacy Sessions.
- Do not switch a legacy Session to target authority.
- Do not remove `selected_player_ids[]` or update current application readers. Cohort cutover is
  `XS-W3-07`, and target Team Formation integration is W6.
- Do not define post-start roster correction policy; target roster replacement is pre-start only.
- Do not create a globally deduplicated identity for Guests.

## Truth classes and ownership

`session_participants` is `CURRENT_STATE`. It records the contextual identity known to a Session
and whether that identity is in the latest roster. Its display label may change through a later
roster command, while prior snapshots remain unchanged.

`roster_revisions` and `roster_revision_entries` are `IMMUTABLE_SNAPSHOT`. They accept inserts
only through trusted materialization paths. Database guards reject update and delete attempts,
including accidental privileged writes.

The latest roster is the greatest `revision_number` for a Session. There is no mutable
`current_roster_revision_id` pointer. Consumers that require reproducibility carry an exact
`roster_revision_id`.

## Schema

### Session participants

`public.session_participants` contains:

```text
id uuid primary key
session_id uuid not null
identity_kind PLAYER | GUEST
player_id uuid nullable
source_kind QUICK_DIRECT | LEGACY_SELECTED_ROSTER | REGISTRATION
display_name text not null
participation_status INCLUDED | REMOVED
created_by_user_id uuid nullable
created_at timestamptz not null
updated_at timestamptz not null
```

Constraints and behavior:

- `(id, session_id)` is unique so revision entries can enforce same-Session references with
  composite foreign keys.
- a `GUEST` must have `player_id is null`;
- a newly created `PLAYER` must resolve a live Player, but its foreign key uses `ON DELETE SET
  NULL` so future identity erasure does not destroy Session history;
- `identity_kind = PLAYER` remains after anonymization even if `player_id` becomes null;
- a non-null Player appears at most once per Session;
- participant UUIDs are never rebound to another identity kind or another Player;
- Guest names are not uniqueness keys, so two Guests may have identical display names;
- Session deletion is restricted because cancellation, not hard deletion, is the target lifecycle
  operation;
- actor deletion sets `created_by_user_id` to null.

For a linked Player, the materialized display name is the trimmed non-empty nickname, falling back
to the trimmed name. For a Guest, it is the trimmed command value. Names are minimal historical
display evidence, not full Player copies.

### Roster revisions

`public.roster_revisions` contains:

```text
id uuid primary key
session_id uuid not null
revision_number integer not null
source_kind QUICK_DIRECT | LEGACY_SELECTED_ROSTER | REGISTRATION
source_session_revision integer nullable
source_registration_revision bigint nullable
source_payload_hash text nullable
created_by_user_id uuid nullable
created_at timestamptz not null
```

`(session_id, revision_number)` and `(id, session_id)` are unique. Revision numbering starts at
one and is allocated while holding the Session row lock. Only `REGISTRATION` revisions may carry
`source_registration_revision`. Only one `LEGACY_SELECTED_ROSTER` revision may exist per Session.

`source_session_revision` records the Session revision observed before a Quick roster change. The
same transaction increments `sessions.revision`; it does not rewrite the roster revision.
`source_payload_hash` records the legacy source array for import drift detection and is otherwise
nullable.

### Roster revision entries

`public.roster_revision_entries` contains:

```text
roster_revision_id uuid
session_id uuid
participant_id uuid
entry_order integer
identity_kind PLAYER | GUEST
player_id uuid nullable
display_name_at_time text not null
```

The primary or unique keys enforce one entry per participant per revision and one participant per
position. `entry_order` is zero-based and non-negative. Composite foreign keys prove that the
revision and participant both belong to `session_id`. Player deletion uses `ON DELETE SET NULL`;
the identity kind and display snapshot survive.

## Quick roster semantic command

The public command is:

```text
replace_target_quick_session_roster(
  p_roster_revision_id uuid,
  p_session_id uuid,
  p_expected_session_revision integer,
  p_participants jsonb
)
```

It returns the roster revision ID, roster revision number, and resulting Session revision.

The payload is an ordered JSON array. Each item is one of:

```json
{"participant_id":"uuid","identity_kind":"PLAYER","player_id":"uuid"}
{"participant_id":"uuid","identity_kind":"GUEST","display_name":"Ana"}
```

Validation rejects null command values, non-array payloads, unknown or extra identity forms,
invalid UUIDs, blank or oversized Guest names, duplicate participant IDs, duplicate linked
Players, and identity rebinding. An empty array is valid and creates an explicit empty revision;
readiness and Team Formation own minimum-size requirements.

The command accepts only authenticated writers authorized by the existing target Session
responsibility boundary, only `authority_model = target`, only `session_context = QUICK`, and only
pre-start lifecycle states `DRAFT` or `SCHEDULED`. Publication does not change this roster
contract; published Quick Sessions are already server-authoritative.

A linked Player is selectable when the caller is the Player's linked account, owns the legacy
Player row, or has an active target Community membership in a Community that relates to that
Player. This rule is implemented as a narrow private predicate and pinned by tests rather than by
reusing broad legacy role-based write authority.

The transaction:

1. authenticates and authorizes the caller;
2. locks the Session row with `FOR UPDATE`;
3. resolves an existing caller-supplied roster revision ID for idempotent retry;
4. validates `expected_session_revision` for a new revision;
5. validates and resolves the complete ordered payload before inserting anything;
6. allocates the next roster revision number;
7. inserts or reactivates contextual participants and marks omitted participants `REMOVED`;
8. inserts the immutable revision and ordered entries;
9. increments `sessions.revision` and commits atomically.

An existing `p_roster_revision_id` with the same Session, source, ordered identities, and Guest
labels returns the original result before stale-revision validation. The same ID with different
semantic content raises an idempotency collision. Two different IDs using the same expected
Session revision serialize on the Session lock; the loser receives SQLSTATE `40001` and leaves no
partial rows.

## Shared materialization boundary

The insert mechanics live in an `app_private` helper that is not executable by browser roles. The
Quick command supplies `QUICK_DIRECT`. W4 may later call the same internal boundary with
`REGISTRATION`, an exact registration revision, and participants derived exclusively from
confirmed Registration entries.

The private helper does not decide public authorization or Registration eligibility. Those remain
the responsibility of the semantic command that calls it.

## Read and access model

All three tables have RLS enabled. `authenticated` receives `SELECT` only; `public` and `anon`
receive no access, and authenticated browser roles receive no direct insert, update, or delete
grant or policy.

Read policies delegate to `app_private.current_user_can_read_target_session(session_id)`, preserving
the audience already fixed by W3-04. An exact-revision reader returns revision metadata and an
ordered JSON array containing only participant ID, identity kind, nullable Player ID, and
`display_name_at_time`. It authorizes through the Session and never reads
`sessions.selected_player_ids[]`.

Public semantic functions use `SECURITY DEFINER`, `set search_path = ''`, fully qualified names,
and explicit revokes from `public` and `anon`. Private helpers have no browser schema usage or
execution surface. New table grants are explicit because Data API exposure and RLS are separate
controls.

## Legacy terminal import

An owner-only internal import job records a `migration_run` and considers only legacy Sessions
whose legacy status is `finished` or `cancelled` and whose `selected_player_ids[]` is non-empty.
Active, paused, draft, selected, configured, and team-generated Sessions remain untouched for the
W3-07 cohort decision.

Each source token is resolved against the union of:

- exact `players.id::text` match;
- `players.local_id` match scoped by `sessions.owner_id`.

Exactly one distinct Player must resolve for every source token, and distinct source tokens must
not collapse onto the same Player. The importer evaluates the entire Session before inserting.
Missing, ambiguous, duplicate, null-owner-dependent, or otherwise inconsistent sources produce a
structured `migration_anomaly`; no partial participant or revision rows are created.

A valid import creates revision one with source `LEGACY_SELECTED_ROSTER`, snapshots display names,
records the source-array hash, and adds exact source-to-target mappings. It does not create
Registration rows, timestamps, queue positions, or inferred attendance.

Re-running the job with the same source hash reuses the existing immutable revision and records no
duplicate target data. If the legacy source changed after import, the existing revision remains
untouched and the new run records a source-drift anomaly.

## Verification

Database tests follow red-green-refactor and prove:

1. schema checks, same-Session composite foreign keys, ordering, and uniqueness;
2. Player and Guest identity rules, duplicate Guest names, and prohibited participant rebinding;
3. revision and entry update/delete guards;
4. linked Player and Guest Quick materialization, explicit empty roster, replacement, removal, and
   reactivation;
5. Player and Guest display changes do not rewrite prior revision entries;
6. anonymous, outsider, Community Session, post-start, inaccessible Player, and direct Data API
   write rejection;
7. authorized Session readers can read an exact revision while outsiders cannot;
8. same-ID retry, conflicting-ID retry, stale `40001`, serialized writers, and transaction rollback;
9. terminal UUID/local-ID import, provenance mappings, idempotent rerun, source drift, and
   whole-Session quarantine for missing, duplicate, or ambiguous references;
10. no import of active, paused, draft, upcoming, or empty legacy rosters and no invented
    Registration chronology;
11. target command and reader definitions do not reference `selected_player_ids`; only the legacy
    importer may read it.

Completion verification runs the database suite twice, including from-zero migration replay, and
the repository gates:

```text
npm run typecheck
npm run lint:eslint
npm run format:check
npm test
npm run build
npm run check:architecture
npm run test:db
```

Existing unrelated lint or formatting debt is reported separately and is not silently rewritten.

## Exit gate

`XS-W3-05` is complete when a target Quick Session can produce and read an exact immutable roster
revision containing linked Players and Guests without consulting `Session.selectedPlayerIds[]`,
and terminal legacy imports preserve provenance without fabricating Registration history.

Authority change: target Quick roster writes move to a server semantic command; Community and
legacy Session roster authority do not change. Schema phase: EXPAND.
