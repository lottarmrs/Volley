# XS-W4-05 FinalizeSessionRoster Design

## Context

XS-W4-05 closes the Registration-to-Session boundary for target-owned Community Sessions. W4-01
introduced `registration_windows` and `registration_entries`; W4-02 implemented the Window
lifecycle; W4-03 implemented Join/Add; and W4-04 implemented Leave, removal, promotion and capacity
changes. W3-05 already provides immutable `roster_revisions`, `roster_revision_entries`,
`session_participants` and the private roster materializer.

The missing command is the explicit bridge from a frozen Registration snapshot to the effective
Session roster. Until it exists, a target Community Session cannot clear `NO_EFFECTIVE_ROSTER`
through supported commands and therefore cannot start.

Architecture sources:

- `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, XS-W4-05;
- `docs/architecture/contexts/N2.05-registration.md`, N3.05.13 and REG-INV-019..024;
- `docs/architecture/contexts/N2.04-sessions.md`, Session roster and readiness contracts;
- `docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`,
  `FinalizeSessionRoster`;
- `docs/architecture/adr/ADR-CATALOG.md`, ADR-REG-005..007;
- `HANDOFF.md`, W4-02..04 warnings carried into W4-05.

## Goals

- Add one public semantic command, `finalize_session_roster`, for an assigned Session Organizer.
- Materialize exactly the eligible `CONFIRMED` entries from one `LOCKED` Registration Window.
- Record the exact Registration revision as immutable roster provenance.
- Reject stale callers and invalid confirmed entries atomically.
- Make retries and distinct duplicate submissions converge without duplicate logical revisions.
- Preserve the established Session-before-Window lock order and the private Registration read
  boundary.
- Clear `NO_EFFECTIVE_ROSTER` for a valid target Community Session without bypassing any other
  readiness blocker.

## Non-goals

- No UI, TypeScript gateway, hook or application use case.
- No Registration Realtime or notification event.
- No `ReopenRegistration`; `OPEN-REG-006` remains open.
- No post-start `SessionRosterAdjustment`.
- No legacy Session Registration introduction; that is XS-W4-06.
- No Team Formation consumer; W6 will consume an exact `RosterRevision` rather than live
  Registration rows.
- No automatic/system actor contract. This slice exposes the authenticated Organizer path only.
- No new read surface for `registration_entries`, queue positions or aggregate counts.
- No changes to historical roster revisions when a Player, membership, roster relation or account
  link changes after a successful finalization.

## Decisions

### Finalization requires `LOCKED`

`finalize_session_roster` accepts only a Window already in `LOCKED`. `CLOSED` still permits Leave
and automatic promotion under ADR-REG-005, so it is not a frozen source. The command does not call
`lock_registration` implicitly: lifecycle transition and materialization remain separate semantic
commands with separate receipts.

Once `LOCKED`, every existing Registration mutation either rejects or is a no-op that does not bump
the Window revision. A caller can therefore capture the revision after Lock and use it as the
meaningful optimistic-concurrency token required by REG-INV-021.

### Confirmed eligibility is revalidated once

The first materialization of a Registration revision revalidates every `CONFIRMED` entry with
`app_private.registration_entry_still_eligible(entry_id)`. This preserves the source-aware W4-04
policy:

- `SELF_JOIN` still requires a live Player, active Community roster relation, active account link
  and active Community membership;
- `ORGANIZER_ADDED` still requires a live Player and active Community roster relation but does not
  invent an account requirement;
- migration/restore sources use the policy already encoded by the private predicate.

If any confirmed entry is no longer eligible, the entire command fails. It neither silently drops
the Player nor materializes an invalid participant. The Organizer must resolve the source data
through an explicit supported workflow before Lock/finalization policy can progress.

Revalidation applies to the first materialization. A receipt retry or a distinct command that
converges on an already materialized `(session_id, source_registration_revision)` returns the
immutable result without revalidating mutable Player or membership state. This is required by the
snapshot rule: later source changes do not rewrite or invalidate the historical roster implicitly.

### Empty final rosters are rejected

A Window with zero `CONFIRMED` entries cannot be finalized. Although the generic roster substrate
can represent an empty revision, a locked empty Community roster cannot clear
`NO_EFFECTIVE_ROSTER`, and reopening is intentionally unresolved. The command fails with `23514`
before writing participants, revisions, Session state or a receipt.

### One logical roster per Registration snapshot

Idempotency has two layers:

1. the same `command_id` returns its immutable command receipt;
2. a different `command_id` for the same Session and `source_registration_revision` returns the
   already materialized `RosterRevision` and records its own receipt without bumping the Session
   revision.

A partial unique index enforces the second property:

```sql
create unique index roster_revisions_registration_source_key
  on public.roster_revisions (session_id, source_registration_revision)
  where source_kind = 'REGISTRATION';
```

The Session and Window locks serialize concurrent callers before the convergence check. The index
remains the database-level backstop against a future caller that fails to follow the locking
contract.

## Public contract

The migration adds:

```sql
public.finalize_session_roster(
  p_command_id uuid,
  p_window_id uuid,
  p_expected_registration_revision integer
)
returns table (
  roster_revision_id uuid,
  roster_revision_number integer,
  source_registration_revision bigint,
  session_revision integer
)
```

The caller supplies command identity, Window identity and the exact Window revision observed after
Lock. Roster revision and new participant UUIDs are generated by the database; no client-chosen
Player, Session, participant or roster-revision identity crosses this boundary.

The result exposes only the materialized revision identities/provenance and the resulting Session
revision. It does not expose entry identity, queue sequence, participant names, status counts or
capacity.

## Transaction flow

The function executes this order inside one transaction:

1. Reject null input identifiers/revision with `23514`.
2. Read `registration_windows.session_id` without a row lock so the governing Session can be found.
3. Lock the target Community Session `FOR UPDATE`; reject an absent/non-target Session with
   `P0002`.
4. Lock the Registration Window `FOR UPDATE`, then verify that it still belongs to the locked
   Session. Session-before-Window is invariant across W4 commands.
5. Call the existing Session write-authorization assertion. Authorization precedes receipt lookup
   so a leaked `command_id` never becomes a read capability.
6. Find a receipt for `(command_id, 'finalize_session_roster', window_id)`. Return it immediately on
   a match; preserve `23505` for a command identity collision.
7. Require Session lifecycle `DRAFT` or `SCHEDULED` and Window status `LOCKED`.
8. Require `registration_windows.revision = p_expected_registration_revision`; otherwise raise
   `40001`.
9. Find an existing `REGISTRATION` roster revision for the Session and exact source Registration
   revision. If present, record a receipt for this command and return that roster revision without
   any Session bump.
10. Load all `CONFIRMED` entries ordered by `joined_at, id`. Reject an empty set and reject if any
    entry fails `registration_entry_still_eligible`.
11. Build the materializer payload. Each entry is `PLAYER` identity. Reuse the existing
    `session_participants.id` for the same `(session_id, player_id)` when present; otherwise generate
    a server-side UUID. Resolve `display_name` as current non-blank nickname, falling back to name.
12. Call `app_private.materialize_target_session_roster` with `source_kind = 'REGISTRATION'`, the
    exact Window revision, the authenticated actor and the ordered payload.
13. Increment `sessions.revision` once and update `sessions.updated_at`.
14. Record the command receipt and return the new logical result.

`WAITLISTED`, `WITHDRAWN` and `REMOVED` entries are not part of the query used to build the payload.
They cannot enter the revision even if they share a Player or carry a queue sequence.

`source_session_revision` remains null for a Registration-sourced revision: its exact source token
is `source_registration_revision`. `source_payload_hash` also remains null because W3-05 reserves it
for detecting drift in the legacy selected-player array.

## Snapshot identity and ordering

Registration entries contain only Player identities, so every materialized revision entry has:

```text
identity_kind = PLAYER
player_id = registration_entries.player_id
display_name_at_time = nickname when non-blank, otherwise name
entry_order = zero-based order by joined_at, registration_entry.id
```

`joined_at` expresses registration chronology for both immediately confirmed and later promoted
entries. The UUID tie-break makes the snapshot deterministic when timestamps are equal. A promoted
entry may retain its historical `queue_sequence`, but queue position is not roster order and is not
exposed by finalization.

Reusing a SessionParticipant preserves stable Session-scoped Player identity across roster
revisions. A newly created participant uses `source_kind = 'REGISTRATION'`. An existing participant
keeps the source that originally established that identity; the new `RosterRevision` remains the
authoritative provenance for its current inclusion.

## Session and downstream behavior

The first materialization increments `sessions.revision` because the effective Session roster has
changed. Readiness already selects the greatest roster `revision_number`, so a non-empty finalized
revision clears only `NO_EFFECTIVE_ROSTER`. Courts, rules, organizer assignment and future W5/W6
blockers remain independently evaluated.

A duplicate submission that converges on an existing Registration revision is a no-op and does not
advance Session revision. A retry using the original `command_id` returns the exact receipt payload,
including the Session revision observed when that command committed.

Future Registration changes after a finalized snapshot require an explicit reopen policy and a new
Window revision. A later successful finalization will create a new immutable roster revision; it
will never update the previous revision or its entries in place.

## Security model

`public.finalize_session_roster` is `SECURITY DEFINER` because it must read private
`registration_entries` and write protected Session roster tables. It must:

- use `set search_path = ''`;
- schema-qualify every function, table, type and built-in reference;
- explicitly require a non-null authenticated actor through the existing Session authorization
  assertion;
- revoke `EXECUTE` from `PUBLIC` and `anon`;
- grant `EXECUTE` only to `authenticated`;
- keep every new helper in `app_private` with all privileges revoked from browser roles;
- preserve zero browser grants on `registration_entries` and zero direct mutation grants on roster
  tables.

The public function is intentionally an exposed semantic endpoint, not a general privileged data
reader. Its result is bounded and every path authorizes against the locked Session before consulting
a receipt or reading private entry contents.

No authorization decision uses JWT `user_metadata`. No `service_role` credential or automatic
system identity is introduced.

## Errors and atomicity

The SQLSTATE contract is:

| SQLSTATE | Meaning |
| --- | --- |
| `P0002` | Registration Window or governing target Session not found |
| `42501` | caller unauthenticated, assignment ineffective or outside Session scope |
| `23514` | null input, unsupported Session lifecycle, Window not `LOCKED`, empty confirmed set or ineligible confirmed entry |
| `40001` | stale expected Registration revision |
| `23505` | `command_id` already belongs to another command/aggregate or a uniqueness contract is violated |

Every failure rolls back the whole command. In particular, a fault after participant/revision
materialization but before receipt insertion leaves no participant status change, roster revision,
revision entry, Session revision bump or receipt.

## Migration shape

The project uses imperative, chronological migrations. The implementation creates one migration
through `supabase migration new finalize_session_roster`, then hand-edits and tests that generated
file. It contains:

- the partial unique index for Registration-source convergence;
- `public.finalize_session_roster`;
- explicit revoke/grant statements.

No existing migration is edited. `schema.sql` remains a baseline snapshot rather than the only
deployment source; the new migration is added to the chronological migration documentation.

## Test strategy

Create `src/test/db/registrationFinalize.dbtest.ts` and follow the existing real-Postgres harness.
The suite proves:

1. a locked Window materializes only confirmed Players, in deterministic order, with frozen names,
   exact `source_registration_revision`, actor provenance and one Session revision bump;
2. `WAITLISTED`, `WITHDRAWN` and `REMOVED` entries never appear;
3. zero confirmed entries raise `23514` without side effects;
4. source-aware revalidation accepts a live accountless `ORGANIZER_ADDED` Player and rejects a
   soft-deleted/inactive Player, inactive Community roster relation, revoked self-join link and
   inactive self-join membership;
5. `DRAFT`, `OPEN` and `CLOSED` Windows, an `IN_PROGRESS`/terminal Session and a stale expected
   Registration revision reject with the documented SQLSTATE;
6. same-command retry returns the identical result and creates one receipt/revision;
7. distinct command IDs for the same source revision return one roster revision, create two
   receipts and do not bump the Session twice;
8. a reused command ID for a different type or Window raises `23505`;
9. anonymous, unassigned, revoked, cross-Community and cross-Session callers cannot finalize;
10. browser roles retain no direct read access to `registration_entries` and no direct mutation
    access to roster tables;
11. barrier-controlled concurrent finalizations serialize without deadlock and leave one logical
    roster revision;
12. failure injection after materialization rolls back every roster, participant, Session and
    receipt effect;
13. the valid finalization clears `NO_EFFECTIVE_ROSTER` while preserving unrelated readiness
    blockers;
14. function metadata, `search_path`, grants, index predicate/uniqueness and relevant foreign-key
    indexes match the contract.

The focused suite runs with:

```powershell
$env:VOLLEY_TEST_DATABASE_URL='<test database url>'
npm run test:db -- registrationFinalize.dbtest.ts
```

The exit gate also runs the full database suite, typecheck, ESLint/format checks for touched files,
the unit/UI suites and the production build.

## Deployment and rollback

The migration is additive: one index and one function. Deployment follows chronological migration
order after W4-04. The command is not called by existing UI code, so applying the migration does not
change current user flows.

Rollback before any consumer uses the endpoint is `DROP FUNCTION` followed by `DROP INDEX`. Once
Registration-sourced roster revisions exist, their immutable history must be preserved; rollback
then disables the function/index only and never deletes roster or participant data.

## Exit gate

XS-W4-05 is complete when a supported Organizer command converts one exact, locked Registration
revision into one immutable, non-empty, Registration-sourced `RosterRevision`; stale, ineligible,
unauthorized and concurrent attempts preserve atomicity; and Session readiness observes that exact
materialization without reading live Registration rows.
