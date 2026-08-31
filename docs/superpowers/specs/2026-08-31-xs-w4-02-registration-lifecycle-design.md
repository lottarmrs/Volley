# XS-W4-02 Registration Lifecycle Commands Design

## Context

`XS-W4-01` gave Registration its schema: a `RegistrationWindow` per Community Session carrying
capacity and a FIFO counter, `RegistrationEntry` rows, and a private allocator that decides the
last-slot race under a Window row lock. Nothing can yet create a Window or move it between states,
so the schema is inert.

`XS-W4-02` adds the four lifecycle commands that make it usable: create, open, close and lock. Their
exit gate is that no row update can bypass lifecycle policy — which W4-01 already makes structural,
since neither Registration table carries a browser `INSERT`, `UPDATE` or `DELETE` grant. This slice
supplies the only sanctioned path and pins that the bypass really is closed.

`JoinRegistration` is `XS-W4-03`; promotion and `ChangeRegistrationCapacity` are `XS-W4-04`;
`FinalizeSessionRoster` is `XS-W4-05`.

**Architecture sources:** `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`
XS-W4-02; `docs/architecture/contexts/N2.05-registration.md` N3.05.01–02, N3.05.10–11 and N3.05.16,
with REG-INV-003/018/019/030/031/032;
`docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md` Registration command matrix;
`docs/architecture/catalogs/OPEN-DECISIONS.md` OPEN-REG-001..006;
`docs/architecture/adr/ADR-CATALOG.md` ADR-API-003/006;
`docs/architecture/quality/N2.20-testing-qa.md` QA-INV-004/005/006/008/009/010/012.

## Goals

- Add `create_registration_window`, `open_registration`, `close_registration` and
  `lock_registration` as semantic commands.
- Hold the allowed lifecycle transitions in exactly one place.
- Route every command through the existing `app_private.command_receipts` substrate.
- Prove that no browser role can move a Window between states by updating a row.

## Non-goals

- Do not implement `ReopenRegistration`. The execution doc gates it on `OPEN-REG-006`, which is
  open, and `N4.05.11.03` requires an explicit stale-propagation workflow that does not exist yet.
- Do not implement `ChangeRegistrationCapacity`. `C5.02` couples it to auto-promotion on increase,
  `N5.05.10` wants the capacity change and its promotions in one transaction, and `REG-INV-014`
  requires promotion to revalidate eligibility — which `XS-W4-03` is what builds. Deferring the
  whole command to `XS-W4-04` keeps that invariant intact rather than shipping a promotion path
  that violates it.
- Do not implement `JoinRegistration`, `LeaveRegistration`, promotion, or `FinalizeSessionRoster`.
- Do not add a command that edits `closes_at`. No such command appears in the architecture's list.
- Do not add a status-change audit table. `N5.05.10.02` asks for auditability of capacity changes,
  which this slice does not ship; the command receipt already records actor and time per transition.
- Do not decide unlimited capacity, queue visibility, ineligible-promotion policy, reserved slots,
  payment, or reopen semantics. `OPEN-REG-001` through `OPEN-REG-006` all stay open.

## Command surface

```text
public.create_registration_window(
  p_command_id uuid, p_window_id uuid, p_session_id uuid,
  p_capacity integer, p_closes_at timestamptz
) → (window_id uuid, window_revision integer)

public.open_registration(p_command_id uuid, p_window_id uuid, p_expected_revision integer)
  → (window_revision integer)
public.close_registration(p_command_id uuid, p_window_id uuid, p_expected_revision integer)
  → (window_revision integer)
public.lock_registration(p_command_id uuid, p_window_id uuid, p_expected_revision integer)
  → (window_revision integer)
```

All four are `SECURITY DEFINER` with `set search_path = ''`, fully qualified, revoked from `public`
and `anon`, and granted to `authenticated`.

### The state machine

`app_private.assert_registration_lifecycle_transition(p_from text, p_to text)` holds the entire
allowed-pairs table and raises `23514` for anything else:

```text
DRAFT → OPEN
OPEN → CLOSED
CLOSED → LOCKED
```

Strictly sequential, exactly as `N4.05.02.01` draws it. Nothing leaves `LOCKED`. Locking requires
closing first, so there is one path in and every state is reachable one way. No command consults
the table for creation — create establishes `DRAFT` as an initial state rather than transitioning
into it.

Each transition stamps its own column: `opened_at`, `closed_at`, `locked_at`. W4-01 created those
columns and left them unused; this slice is their first writer.

### The Window is its own aggregate root

Registration commands never touch `sessions.revision`. `C5.01` lists `RegistrationWindow` with its
own `revision`, and `REG-INV-019` calls that revision monotonic authoritative versioning. This
differs deliberately from W3-06, where courts and organizer assignments bumped the Session root —
those are Session-aggregate members, and a Window is not.

`create_registration_window` still locks the Session row, to evaluate its lifecycle against a stable
snapshot and to serialize concurrent creates, but it leaves the Session's revision untouched.

### Session gate

All four commands require the Session in `DRAFT` or `SCHEDULED` with `authority_model = 'target'`,
raising `23514` otherwise. `N10.05.01` requires a command to respect the real Session lifecycle, and
Registration must reach `LOCKED` before start because `FinalizeSessionRoster` consumes a locked
Window to produce the roster the Session plays with.

`session_context = 'COMMUNITY'` needs no check on open, close or lock: W4-01's trigger refuses a
Window on any other context, so once a Window exists its Session is necessarily a Community one.
`create_registration_window` inherits that trigger directly.

**Accepted consequence, stated rather than discovered:** W3-06's readiness blockers do not include
"registration still open", so a Session can start with an `OPEN` Window that can then never be
closed, because closing requires a pre-start Session. The Session is not stranded — `XS-W4-05` will
require a `LOCKED` Window to finalize, so the omission surfaces before start rather than after — but
a later slice should either add a readiness blocker for an unlocked Window or widen the gate for
close and lock. This slice does neither, because both choices belong to the slice that owns
readiness or finalization.

### Capacity and deadline are immutable here

`p_capacity` and `p_closes_at` are set at creation and cannot be changed by any command in this
slice. `ChangeRegistrationCapacity` went to `XS-W4-04`, and nothing in the architecture edits
`closes_at`. An Organizer who mistypes a deadline has no correction path until a later slice adds
one. `closes_at` is recorded here but enforced in `XS-W4-03`, where `REG-INV-018` requires the
server to compare its own clock at join time rather than trusting a scheduler.

## Concurrency and idempotency

### Lock ordering: Session before Window

W3-06's Session commands lock `public.sessions FOR UPDATE`, and `XS-W4-05` will need both a Session
and a Window in one transaction. If this slice locked Window-then-Session while a later slice locks
Session-then-Window, the two would deadlock on their first concurrent pair. The order is fixed here:
**Session first, then Window.** `create_registration_window` locks only the Session, since no Window
exists yet.

`REG-INV-030` requires these locks to be database-authoritative rather than process-local, which
`SELECT ... FOR UPDATE` satisfies.

### The prologue

`open_registration`, `close_registration` and `lock_registration` execute in this order:

1. reject a null `p_command_id` or `p_window_id` with `23514`;
2. resolve the Window's Session and lock it `FOR UPDATE`, raising `P0002` when absent;
3. lock the Window `FOR UPDATE`, raising `P0002` when absent;
4. `public.assert_target_session_write_authorized(v_session)`, raising `42501`;
5. look up the command receipt; on a hit, return the recorded result and stop;
6. Session lifecycle gate, raising `23514`;
7. when the Window already holds the target status, return current state without a second revision
   bump — this check comes **before** the transition guard, because `LOCKED → LOCKED` is an
   idempotent no-op while `LOCKED → OPEN` is a rejected transition, and a guard consulted first
   would reject both;
8. `app_private.assert_registration_lifecycle_transition(v_window.status, '<target>')`, raising
   `23514` for any pair outside the table;
9. `expected_revision` mismatch raises `40001`;
10. mutate status and its timestamp, increment `revision`, touch `updated_at`;
11. record the receipt and return.

`create_registration_window` diverges: it locks the Session, authorizes, looks up the receipt,
checks the Session gate, then inserts with `status = 'DRAFT'`, `revision = 1`,
`next_queue_sequence = 1` and `created_by_user_id` from `auth.uid()` (`ADR-API-003` — the actor is
server-derived, never taken from a payload). It has no transition guard and no `expected_revision`,
because nothing exists yet to be stale against.

### A single receipt lookup, after authorization

This is a deliberate simplification of the shape W3-07 arrived at. That slice ended with two
lookups — an early one for collision detection and a later one for the authorized return — because
its first version returned a saved result before authorizing, letting a caller whose capability had
since been revoked replay a receipt and read back the original result.

One lookup placed after authorization achieves the same guarantee with less machinery, and adds a
second property: an unauthorized caller receives `42501` rather than a `23505` that would confirm
their `command_id` exists. Receipts carry `retention_class = 'REGISTRATION_LIFECYCLE'` and
`aggregate_id = window_id`.

### Both idempotency mechanisms

Step 5 covers a retry of the same `command_id` (`REG-INV-031`). Step 7 independently covers two
*different* command IDs double-clicking (`REG-INV-032`). `ADR-API-006` and `N5.15.13.02` require
both, because two double-clicks carry different IDs and a receipt cannot see them as related.

### `23514`, not `23505`, for a second Window

A Session already holding a Window would trip W4-01's unique `session_id` and surface a raw
`23505`, which this codebase reserves for idempotency collisions. `create_registration_window`
pre-checks and raises `23514`. This is the third slice to meet that trap, so it is stated here as a
standing rule: a domain-uniqueness violation is `23514`; `23505` belongs to command identity alone.

## Access model

No new tables, therefore no new grants or policies. W4-01 settled the surface: `registration_windows`
grants `SELECT` to `authenticated` under a policy delegating to
`app_private.current_user_can_read_target_session(session_id)`, `registration_entries` grants
nothing, and neither table carries a browser `INSERT`, `UPDATE` or `DELETE` grant or policy.

That absence is this slice's exit gate. "No UI row update can bypass lifecycle policy" holds
structurally rather than by convention, and the verification below pins it instead of assuming it.

`app_private.assert_registration_lifecycle_transition` is revoked from `public`, `anon` and
`authenticated`.

## Verification

Database tests follow red-green-refactor in `src/test/db/registrationLifecycle.dbtest.ts` against
real PostgreSQL (`QA-INV-004`), and prove:

1. `create_registration_window` yields `DRAFT`, `revision` 1, `next_queue_sequence` 1, the supplied
   capacity and `closes_at`, and a server-derived actor;
2. the three transitions succeed in order, each incrementing `revision` exactly once and stamping
   only its own timestamp;
3. every disallowed pair raises `23514`, named individually: `DRAFT → CLOSED`, `DRAFT → LOCKED`,
   `OPEN → LOCKED`, `CLOSED → OPEN`, and every transition from `LOCKED` to a *different* state.
   `LOCKED → LOCKED` is excluded from this list on purpose: it is the idempotent no-op item 4
   covers, and a test asserting `23514` for it would contradict the prologue's ordering;
4. a second, different `command_id` against a Window already in the target status returns the
   current state with no second revision bump (`REG-INV-032`);
5. the same `command_id` retried returns the recorded result even when `expected_revision` has gone
   stale (`REG-INV-031`, `QA-INV-009`);
6. a `command_id` reused against another Window or another command type raises `23505`
   (`QA-INV-010`);
7. an unauthorized caller replaying a real `command_id` receives `42501` and never `23505`;
8. a stale `expected_revision` raises `40001`, and two concurrent `open_registration` transactions
   on one Window serialize so that exactly one performs the transition (`QA-INV-008`);
9. all four commands are rejected with `23514` on `IN_PROGRESS`, `COMPLETED` and `CANCELLED`
   Sessions;
10. a second Window for one Session raises `23514`, not `23505`;
11. anonymous callers, outsiders and eligible-but-unassigned Community organizers each receive
    `42501`, while the assigned organizer succeeds; a Window UUID belonging to another Community
    grants nothing (`QA-INV-005`, `QA-INV-006`);
12. **the exit gate:** an authenticated role cannot change `registration_windows.status` by direct
    `UPDATE`, receiving `42501`;
13. a rejected command leaves no receipt, no revision increment and no timestamp (`QA-INV-012`);
14. each command writes a receipt carrying its own `command_type`, `aggregate_id = window_id`,
    the server-derived actor and `retention_class = 'REGISTRATION_LIFECYCLE'`.

Completion runs the database suite twice from a from-zero migration replay, plus the repository
gates in CI order: `typecheck`, `lint:eslint`, `format:check`, `test`, `build`,
`check:architecture`, `test:db`. Pre-existing repository-wide lint and formatting findings are
reported separately and never silently rewritten.

## Exit gate

`XS-W4-02` is complete when a Registration Window can only be created and moved through
`DRAFT → OPEN → CLOSED → LOCKED` by semantic command; when no browser role can reach the same effect
with a row update; when a retried `command_id` returns its recorded result and two distinct command
IDs still produce one logical transition; and when every open Registration decision remains open.

Authority change: Registration lifecycle authority moves to server semantic commands. Session
authority is unchanged. Schema phase: EXPAND, with no new tables.
