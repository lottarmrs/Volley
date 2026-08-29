# XS-W3-06 Session Lifecycle and Readiness Design

## Context

`XS-W3-06` closes the target Session command surface. W3-01 through W3-05 built the aggregate
root, organizer assignments, courts, rules snapshots and roster revisions, but a target Session
still cannot be scheduled, published, started, finished or cancelled, and nothing computes whether
it is ready to start. Every remaining transition would otherwise be a generic `status` write,
which the slice exit gate forbids.

The slice also closes the last structural gap under those commands. `ADR-API-006` (ACCEPTED)
requires that a retried command reuse a stable `command_id` and that the server hold a receipt
sufficient to return the same logical result without repeating side effects. `app_private.command_receipts`
does not exist yet: C6.01 gated it, and `commandFoundation.dbtest.ts` pins its absence with a test
that fails the moment the table appears. Only retention remains open (`OPEN-API-002`), not
existence, so this slice builds the receipt substrate and replaces that pinned gap with real
receipt semantics.

**Architecture sources:** `docs/architecture/contexts/N2.04-sessions.md` N3.04.03, N3.04.05–07,
N3.04.13–16 and SES-INV-006/010/022/024/025/026/027/031;
`docs/architecture/platform/N2.15-api-application.md` N5.15.13;
`docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md` XS-W3-06;
`docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md`,
`C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`, `C5.03-CAPABILITY-SECURITY-PRIVACY-MATRIX.md`;
`docs/architecture/adr/ADR-CATALOG.md` ADR-API-003/006, ADR-DATA-002/008;
`docs/architecture/quality/N2.20-testing-qa.md` QA-INV-004/005/006/008/009/010/011/012.

## Goals

- Add `schedule`, `publish`, `start`, `finish` and `cancel` semantic commands for target Sessions.
- Add `assign` and `revoke` commands for Session organizer assignments.
- Add a `configure` command for existing Session courts.
- Add a derived `GetSessionReadiness` query whose blockers `StartSession` revalidates.
- Add `app_private.command_receipts` and route every new command through it.
- Preserve history on cancellation and refuse to silently finish a Session with active Matches.

## Non-goals

- Do not implement `UnpublishSession`. `OPEN-SES-002` gates unpublish policy once Registration
  entries exist.
- Do not implement `AdministrativeTakeoverSessionResponsibility`. `OPEN-COM-005` requires an
  explicit recovery capability and forbids silent inheritance.
- Do not implement `TransferSessionOperationalResponsibility`; `N6.04.06` marks the final names
  TBD and assign plus revoke covers the operational need.
- Do not implement post-start roster adjustment (`OPEN-SES-004`) or `SessionRosterAdjustment`.
- Do not add a domain outbox. `C5.02` profiles these commands `T2+T4`, but the outbox was
  deliberately removed on 2026-07-30 and the wave plan reintroduces it at W4/W7/W10. This slice
  implements the `T2` half; `N5.04.15.02` already places report and notification side effects
  after commit, where failure does not reopen the Session.
- Do not freeze the lifecycle enum. `C5.01` marks Session `READY_WITH_OPEN_PARAMETER` and
  `HYP-SES-001` remains a hypothesis; this slice inherits the enum W3-01 committed to rather than
  closing it.
- Do not resolve command receipt retention. `OPEN-API-002` stays open and is cited inline.

## Truth classes and ownership

`command_receipts` and `session_readiness_blockers` are `INFRA_OPERATIONAL`. Neither is a domain
artifact and neither is reachable by browser roles.

Session readiness is `DERIVED_PROJECTION`. `C5.01` classifies it as a query result recomputed from
blockers, and `N4.04.13.01` forbids persisting `isReady` as independent authority. No readiness
value is ever stored.

The cancellation columns added to `sessions` extend the existing `CURRENT_STATE` aggregate root.
They record who cancelled and why; they are not a separate historical artifact.

## Schema

### Session cancellation audit

`N4.04.16.01` names the fields; `SES-INV-026` requires that cancellation preserve history rather
than hard-delete. Added to `public.sessions`:

```text
cancelled_at timestamptz nullable
cancelled_by_user_id uuid nullable
cancel_reason text nullable
```

`cancelled_by_user_id` references `auth.users` with `ON DELETE SET NULL`, matching `SES-INV-032`
and the anonymise-never-cascade rule already pinned for Session-owned history. The document writes
`cancelled_by`; this repository consistently suffixes actor columns `_by_user_id`
(`assigned_by_user_id`, `revoked_by_user_id`, `created_by_user_id`) and that convention wins.

`cancel_reason` stays non-blank free text. `N4.04.16.01` says "code/text as policy", so the
vocabulary is deliberately open and is not closed into an enum here.

A target-only check requires that a target Session in `CANCELLED` permanently carry
`cancelled_at`. The cancel command derives and initially records `cancelled_by_user_id`, but that
actor reference may later become null through the approved `ON DELETE SET NULL` anonymization
path. Legacy Sessions, whose `lifecycle_status` is null, are unaffected.

`actual_started_at` and `actual_finished_at` already exist and are already constrained for
`IN_PROGRESS` and `COMPLETED`. Start and finish populate them. `SES-INV-027` keeps them distinct
from `planned_start_at` and `planned_end_at`; no command conflates the two.

### Command receipts

`N5.15.13` gives the shape directly:

```text
app_private.command_receipts
├── command_id uuid primary key
├── actor_id uuid
├── command_type text
├── aggregate_id uuid
├── result jsonb
├── committed_at timestamptz
└── retention_class text
```

`actor_id` is server-derived from `auth.uid()`, never taken from a payload (`ADR-API-003`).
`result` holds the exact row the command returned, so a retry reproduces it without recomputation.

`retention_class` records the command class a future retention policy will act on; every receipt
written by this slice carries `SESSION_LIFECYCLE`. **No TTL and no prune job are defined**, because
`OPEN-API-002` leaves "command receipt retention per command class" open, with the safe behavior
"finite retention; no claim of infinite idempotency". The migration states this inline, exactly as
the migration provenance substrate stated `OPEN-MIG-017`.

Receipts are write-once. A trigger rejects update and delete with SQLSTATE `55000`; a rewritten
receipt would silently break idempotency.

### Readiness blocker catalog

```text
app_private.session_readiness_blockers
├── code text primary key
├── evaluation_status text  -- EVALUATED | DEFERRED
├── owning_wave text
└── description text
```

Seeded with all nine `N3.04.13` blocker codes. The architecture does not require this table; it
exists so that a blocker which cannot yet be evaluated is labelled rather than silently absent. A
reader must not mistake a missing `NO_CONFIRMED_TEAM_DRAW` for "team draw is satisfied".

| Code | Status | Evaluated from |
|---|---|---|
| `REQUIRED_ORGANIZER_MISSING` | EVALUATED | effective non-revoked assignment: Quick requires a real actor and no Community Membership; Community requires the assignment's active Membership plus current non-revoked `ORGANIZER` responsibility |
| `NO_EFFECTIVE_ROSTER` | EVALUATED | latest `roster_revisions` carries at least one entry |
| `RULES_INVALID` | EVALUATED | a `session_rules_snapshots` row exists for the Session |
| `COURT_CONFIGURATION_INVALID` | EVALUATED | at least one `session_courts` row |
| `ROSTER_STALE` | DEFERRED | W6 |
| `NO_CONFIRMED_TEAM_DRAW` | DEFERRED | W6 |
| `TEAM_DRAW_STALE` | DEFERRED | W6 |
| `VOTING_STILL_OPEN` | DEFERRED | W5 |
| `COMPETITION_FIXTURE_NOT_READY` | DEFERRED | W8 |

## Readiness evaluation

```text
app_private.target_session_readiness(session_id uuid) → jsonb
{ "ready": boolean, "blockers": [...], "revisions": { ... } }
```

Each blocker carries its `code`, `evaluation_status` and `owning_wave`, joined from the catalog.
`revisions` reports the Session revision plus the exact roster revision and rules snapshot
identifiers the evaluation observed, satisfying `N5.04.13`'s "relevant revisions".

`GetSessionReadiness` returns this value and `StartSession` calls the same function inside its
locked transaction. That shared call is the structural guarantee behind `N5.04.13.02` and
`SES-INV-024`: the query is UX, the command revalidates, and the two cannot drift because there is
one evaluator.

## Commands

Nine public functions. All are `SECURITY DEFINER` with `set search_path = ''`, fully qualified,
revoked from `public` and `anon`, and executable only by `authenticated`.

| Function | Transition | Authority | Lifecycle window |
|---|---|---|---|
| `assign_target_session_organizer` | insert assignment | Community `session.manage`, or Quick owner | non-terminal |
| `revoke_target_session_organizer` | set `revoked_at` | Community `session.manage`, or Quick owner | non-terminal |
| `configure_target_session_court` | update label and order | assigned Organizer | `DRAFT`, `SCHEDULED`, `IN_PROGRESS` |
| `schedule_target_session` | `DRAFT → SCHEDULED` | assigned Organizer | requires `planned_start_at` |
| `publish_target_session` | `PRIVATE → PUBLISHED` | assigned Organizer | `DRAFT`, `SCHEDULED` |
| `read_target_session_readiness` | none | assigned Organizer | any |
| `start_target_session` | Quick `DRAFT`, or any `SCHEDULED → IN_PROGRESS` | assigned Organizer | sets `actual_started_at`; direct DRAFT Start is Quick-only |
| `finish_target_session` | `IN_PROGRESS → COMPLETED` | assigned Organizer | sets `actual_finished_at` |
| `cancel_target_session` | non-terminal `→ CANCELLED` | assigned Organizer | sets cancellation audit |

The two organizer commands deliberately do **not** authorize through
`assert_target_session_write_authorized`. That helper requires a valid assignment, so requiring it
to create the first assignment would be circular. They resolve Community `session.manage`
capability instead, or Quick Session ownership, and never trust a client-supplied `community_id`
(`N8.04.06`).

Every other command authorizes through `assert_target_session_write_authorized`, which W3-02
already narrowed to require a valid, non-revoked assignment. This satisfies `SES-INV-022` and
`C5.03`'s "assignment required" for an eligible but unassigned Community Organizer.

`schedule_target_session` is not named in the architecture command catalog. `N6.04.03` states the
guard "`DRAFT → SCHEDULED` requires valid shared schedule when applicable" but no catalogued
command performs it: `UpdateSessionDraft` edits name and schedule only, and publication is a
separate dimension. One command per transition is added rather than overloading publish, which
would couple two dimensions `SES-INV-010` separates.

`configure_target_session_court` remains available while `IN_PROGRESS` because `C5.01` describes
SessionCourt as "created/configured before/during Session under policy". `C5.02` bounds it with
"changes cannot rewrite already-started Match", which holds trivially while no target Match model
exists.

Publication never changes `lifecycle_status`. `SES-INV-010` and `C5.01` forbid encoding
publication, Registration, voting or Team Formation as lifecycle values.

### Command envelope and idempotency

Every state-changing command takes `p_command_id uuid` and `p_expected_revision integer`.
`N4.04.14.01` gives the shape `StartSession(session_id, command_id, expected_revision?)`.

`read_target_session_readiness` is a query, not a command. It takes neither argument, writes no
receipt, and mutates nothing.

The two organizer commands and the court command mutate aggregate members rather than the root,
but still take `p_expected_revision` and still increment `sessions.revision`, because the Session
root owns optimistic concurrency for its aggregate (`SES-INV-031`). This matches
`add_target_session_court`, which W3-03 already shipped with that shape.

"Non-terminal" throughout this document means a `lifecycle_status` other than `COMPLETED` or
`CANCELLED`.

Each state-changing command executes in this order:

1. reject a null command id, then load and lock the target Session `FOR UPDATE`;
2. authorize;
3. look up the receipt by `command_id`; on a hit with matching `command_type` and `aggregate_id`,
   return the recorded result;
4. on a hit whose type or aggregate differs, raise `23505`;
5. validate command-specific input needed to identify the desired state;
6. if the Session already holds that desired state, write this command's receipt and return the
   current result without consulting `expected_revision`;
7. validate `expected_revision`, raising `40001` when a genuine mutation is stale;
8. mutate, increment `sessions.revision`, write the receipt, and return.

Receipt lookup precedes stale-revision validation, the ordering `replace_target_quick_session_roster`
already proved: a client that lost the response retries with a now-stale revision and must still
receive the original result.

Steps 3 and 5 are both required and neither replaces the other. `ADR-API-006` and `N5.15.13.02`
state that two double-clicks can carry different command IDs, so domain-level idempotency must
survive independently of the receipt.

SQLSTATE usage follows the established target convention: `23514` for invalid semantic shape or
lifecycle, `42501` for authorization, `P0002` for a missing target Session, `23505` for an
idempotency collision, and `40001` for stale concurrency.

### Finish and cancel blockers

`SES-INV-025` states that `FinishSession` cannot silently finish active Matches, and `C5.02`
rejects the transition while active Matches or critical reconciliation remain. Target Matches
arrive in `XS-W7-01`, so this slice evaluates the only Match-like evidence that exists: non-terminal
rows in the legacy `games` table pointing at the Session. Cancel applies the same guard, because
`N5.04.16.02` requires that cancelling an `IN_PROGRESS` Session resolve live Matches explicitly.

The guard also protects `XS-W3-07`, where legacy Sessions carrying `games` rows become
target-authoritative.

## Access model

`command_receipts` and `session_readiness_blockers` live in `app_private`, which is not granted to
`anon` or `authenticated`. Both enable RLS as defence in depth, matching the migration provenance
substrate and `ADR-DATA-002`.

No new table is exposed through the Data API. Blocker metadata reaches the client only as the
`GetSessionReadiness` result. The new `sessions` columns inherit the existing Session policies.

## Verification

Database tests follow red-green-refactor in `src/test/db/sessionLifecycleCommands.dbtest.ts`
against real PostgreSQL (`QA-INV-004`), and prove:

1. the lifecycle machine accepts `DRAFT → SCHEDULED → IN_PROGRESS → COMPLETED`, the Quick-only
   `DRAFT → IN_PROGRESS` path, and `→ CANCELLED` from every non-terminal state, rejecting all
   other transitions except desired-state finish/cancel no-ops;
2. readiness returns all nine blocker codes with correct `evaluation_status`, and the four
   evaluated blockers appear and clear as organizer, roster, rules and courts change;
3. readiness reported ready, then invalidated in another transaction, is revalidated and rejected
   by `StartSession` (`SES-INV-024`, `N5.04.13.02`);
4. a retried `command_id` returns the recorded result after a lost response (`QA-INV-009`), and
   produces exactly one logical `actual_started_at` (`QA-INV-010`);
5. two different command IDs carrying the same original revision each write a receipt but still
   produce one effect across all eight state-changing commands (`QA-INV-011`);
6. a `command_id` reused against a different Session or command type raises `23505`;
7. two concurrent `StartSession` transactions serialize on the Session lock; both return the same
   resulting revision while only one logical Start occurs (`QA-INV-008`);
8. finish and cancel are rejected while a non-terminal `games` row references the Session
   (`SES-INV-025`);
9. cancellation initially records `cancelled_at`, `cancelled_by_user_id` and `cancel_reason`; later
   actor anonymization preserves the timestamp, reason and every roster, rules, court and assignment
   row (`SES-INV-026`, `SES-INV-032`);
10. planned and actual timestamps remain independent (`SES-INV-027`);
11. every command rejects anonymous callers, outsiders and eligible-but-unassigned organizers, and
    a valid Session UUID from another Community grants nothing (`QA-INV-005`, `QA-INV-006`);
12. a rejected command leaves no receipt, no revision increment and no partial state
    (`QA-INV-012`);
13. authenticated browser roles cannot reach `command_receipts` or `session_readiness_blockers`,
    and receipt update or delete raises `55000`.

`commandFoundation.dbtest.ts` is updated in this slice: its `KNOWN GAP` test asserts that
`command_receipts` does not exist and instructs its own replacement with real receipt semantics
once `OPEN-API-002` is addressed. It is replaced, not deleted.

`sessionRosterRevisions.dbtest.ts` is updated where it forces `lifecycle_status = 'CANCELLED'` by
direct UPDATE without the audit columns, which the new check constraint rejects. The fixture
changes; the invariant is not weakened.

Completion runs the database suite twice from a from-zero migration replay, plus the repository
gates in CI order: `typecheck`, `lint:eslint`, `format:check`, `test`, `build`,
`check:architecture`, `test:db`. Pre-existing global lint and formatting findings are reported
separately and never silently rewritten.

## Exit gate

`XS-W3-06` is complete when a target Session can be scheduled, published, started, finished and
cancelled only through semantic commands; when readiness is derived, never persisted, and
revalidated inside `StartSession`; when a retried `command_id` returns the recorded result without
repeating an effect; and when no lifecycle change is reachable through a generic row update.

Authority change: target Session lifecycle authority moves to server semantic commands, and
command idempotency gains a durable receipt substrate. Legacy Session authority does not change.
Schema phase: EXPAND.
