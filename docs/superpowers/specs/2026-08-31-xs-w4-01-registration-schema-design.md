# XS-W4-01 Registration Schema and Invariants Design

## Context

`XS-W4-01` opens wave W4 by adding the Registration aggregate: a `RegistrationWindow` per Community
Session and the `RegistrationEntry` rows that queue against it. W3 finished the Session backbone —
target authority, lifecycle commands, derived readiness, normalized rosters and an explicit cohort
cutover — but nothing yet models sign-up intent, capacity or a waitlist.

The slice is schema-first by design. Its exit gate is that the schema can decide the last-slot race
server-side, without any client counting confirmed entries. That is only demonstrable against a real
serialization point, so this slice also ships the private slot allocator the later commands build
on. `CreateRegistrationWindow`, `OpenRegistration`, `CloseRegistration` and `LockRegistration` belong
to `XS-W4-02`; `JoinRegistration` belongs to `XS-W4-03`.

Registration is intent, not participation. `REG-INV-001` and `REG-INV-002` state it directly: a
`RegistrationEntry` is not a `SessionParticipant`, and a waitlisted entry is not one either. A
`registration_entries` row therefore references a **Player**, and `FinalizeSessionRoster`
(`XS-W4-05`) is what later turns confirmed entries into `session_participants` and a roster
revision. Guests cannot self-register: they have no account to authenticate.

**Architecture sources:** `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`
XS-W4-01; `docs/architecture/contexts/N2.05-registration.md` N3.05.01–03, N3.05.05–06, N3.05.16 and
§28, plus REG-INV-001/002/006/007/008/009/010/011/012/015/018/019/020;
`docs/architecture/catalogs/OPEN-DECISIONS.md` OPEN-REG-001..006;
`docs/architecture/matrices/C5.01-ENTITY-DATA-STATE-MATRIX.md` and
`C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`;
`docs/architecture/quality/N2.20-testing-qa.md` QA-INV-004/005/006/008/012.

## Goals

- Add `registration_windows` and `registration_entries` with the constraints that carry the
  Registration invariants.
- Add a private slot allocator that serializes on the Window row and decides `CONFIRMED` versus
  `WAITLISTED` without client input.
- Allocate FIFO positions from an authoritative monotonic counter, never from a timestamp.
- Prove the last-slot race with concurrent transactions.
- Leave every open Registration decision open.

## Non-goals

- Do not implement `CreateRegistrationWindow`, `OpenRegistration`, `CloseRegistration` or
  `LockRegistration`. Those are `XS-W4-02`.
- Do not implement `JoinRegistration` or `LeaveRegistration`. Those are `XS-W4-03` and `XS-W4-04`.
- Do not implement promotion. `XS-W4-04` owns it, including the eligibility revalidation
  `REG-INV-014` requires.
- Do not implement `FinalizeSessionRoster`. That is `XS-W4-05`, and it is what writes
  `roster_revisions.source_registration_revision` per `REG-INV-020`.
- Do not add reserved or protected slot categories. `OPEN-REG-004` defers them explicitly and keeps
  strict FIFO as the V1 baseline.
- Do not add payment, refund or cancellation concepts. `OPEN-REG-005` defers them.
- Do not decide unlimited-capacity semantics. See the capacity field below; `OPEN-REG-001` stays
  open.
- Do not decide how much of the queue a member may see. `OPEN-REG-003` stays open, which is why
  entries receive no browser read grant here.
- Do not add a `PROMOTED` status. `N5.05.03` is explicit that promotion is a transition, not an
  enduring state.
- Do not add an entry status for the ineligible-at-promotion case. `OPEN-REG-002` is open, and
  `REMOVED` plus `removal_reason` already represents it without pre-deciding the policy.

## Truth classes and ownership

`registration_windows` and `registration_entries` are both `CURRENT_STATE`. They record present
intent and present queue position, and they are mutated in place by later commands.

Neither is an immutable snapshot. The immutable artifact downstream is the `RosterRevision` that
`FinalizeSessionRoster` materializes from a Window at an exact `revision`, which is why
`roster_revisions.source_registration_revision` already exists from W3-05 and stays null until W4-05
fills it.

Registration is server-authoritative for Community Sessions (`REG-INV-003`, `N5.05.01.03`). No
browser role writes either table.

## Schema

### Registration windows

```text
public.registration_windows
├── id uuid primary key                  caller-supplied final UUID
├── session_id uuid not null unique      → sessions ON DELETE RESTRICT
├── status text not null                 DRAFT | OPEN | CLOSED | LOCKED
├── capacity integer not null            CHECK (capacity > 0)
├── closes_at timestamptz
├── revision integer not null            default 1
├── next_queue_sequence bigint not null  default 1
├── opened_at timestamptz
├── closed_at timestamptz
├── locked_at timestamptz
├── created_by_user_id uuid              → auth.users ON DELETE SET NULL
├── created_at timestamptz not null
└── updated_at timestamptz not null
```

`session_id` is unique because V1 is one primary Window per Session (`N4.05.01.01`). The document
also asks that the model not *prevent* future multiple Windows; a unique constraint is droppable in
a later migration without rewriting a single row, so nothing is foreclosed.

`capacity` is required and positive. `OPEN-REG-001` warns against inventing a magic infinite number,
and assigning "unlimited" to a null would decide that question by implication. Unlimited sign-up is
simply unsupported this wave, and the decision stays open with no semantics attached to any value.

`closes_at` is load-bearing rather than decorative. `N5.05.02.02` and `REG-INV-018` require the
deadline to be enforced by the server comparing its own clock at join time, so a late cron run can
never let a join through. No scheduled-open column is added: a Window opens through an explicit
`OpenRegistration` command, so `opens_at` would have no consumer.

`revision` is `integer`, matching `sessions.revision`. `roster_revisions.source_registration_revision`
is `bigint`, so W4-05 widens losslessly on write.

The lifecycle states are `DRAFT → OPEN → CLOSED → LOCKED` exactly as `N4.05.02.01` gives them. This
slice constrains the value set; `XS-W4-02` owns the transitions between them.

A trigger enforces that the referenced Session is `authority_model = 'target'` and
`session_context = 'COMMUNITY'`. It is a trigger rather than a CHECK because the condition reads
another table. `N5.05.01.02` pairs the two contexts deliberately: a Quick Session takes the direct
roster command W3-05 already shipped, and a Community Session takes registration followed by
finalization. Allowing both on one Session would leave two roster authorities with nothing
structural saying which wins.

### Registration entries

```text
public.registration_entries
├── id uuid primary key                       caller-supplied final UUID
├── registration_window_id uuid not null      → registration_windows ON DELETE RESTRICT
├── player_id uuid not null                   → players ON DELETE RESTRICT
├── status text not null                      CONFIRMED | WAITLISTED | WITHDRAWN | REMOVED
├── queue_sequence bigint
├── source text not null                      SELF_JOIN | ORGANIZER_ADDED | MIGRATION | ADMIN_RESTORE
├── joined_at timestamptz not null
├── status_changed_at timestamptz not null
├── withdrawn_at timestamptz
├── removed_at timestamptz
├── removal_reason text
└── created_by_user_id uuid                    → auth.users ON DELETE SET NULL
```

Four statuses, not five. `REG-INV-012` requires `REMOVED` and `WITHDRAWN` to stay semantically
distinct — one is administrative, the other is the member's own choice — so both exist, with their
own timestamps.

`created_by_user_id` records who caused the row, which `source` alone cannot: an `ORGANIZER_ADDED`
entry is only auditable if the organizer is identified. It is the actor the allocator receives, and
it is `SET NULL` rather than `RESTRICT` because an actor reference is anonymizable while the
registration itself must survive — the same split W3 applied to every `*_by_user_id` column.

The Window and Player references are `RESTRICT`, which differs from W3-05's roster entries on
purpose. A roster revision entry is an immutable snapshot that captured a display name and remains
meaningful after the Player is anonymized, so `SET NULL` costs nothing there. A registration entry is
current intent with no captured snapshot: a null Player would leave an unattributable row holding a
FIFO position.

### Constraints carrying the invariants

```sql
-- REG-INV-010: at most one active effective entry per Window/Player
create unique index registration_entries_effective_key
  on public.registration_entries (registration_window_id, player_id)
  where status in ('CONFIRMED', 'WAITLISTED');

-- an authoritative queue position is never shared
create unique index registration_entries_queue_key
  on public.registration_entries (registration_window_id, queue_sequence)
  where queue_sequence is not null;

-- the first eligible waitlisted entry, which XS-W4-04 promotes from
create index registration_entries_waitlist_idx
  on public.registration_entries (registration_window_id, queue_sequence)
  where status = 'WAITLISTED';
```

Plus a CHECK: `status = 'WAITLISTED'` implies `queue_sequence is not null`. The converse is
deliberately not required. A promoted entry keeps the sequence it queued with, so `CONFIRMED` rows
divide into those that walked straight in, carrying no sequence, and those promoted from the queue,
carrying theirs. That asymmetry is the provenance `N5.05.03` refers to when it says promotion is a
transition with an audit trail rather than a status.

No CHECK enforces capacity. `XS-W4-01` states that the capacity invariant is enforced by the
serialized command transaction, and a row-level CHECK cannot observe sibling rows regardless.

Every foreign key receives a complete leading-column btree index.

## Slot allocation

```text
app_private.allocate_registration_slot(
  p_entry_id uuid,
  p_window_id uuid,
  p_player_id uuid,
  p_source text,
  p_actor_user_id uuid
) → jsonb  { entry_id, status, queue_sequence, window_revision }
```

`SECURITY DEFINER`, `set search_path = ''`, fully qualified, revoked from `public`, `anon` and
`authenticated`.

Under the Window lock, in order:

1. `select * from public.registration_windows where id = p_window_id for update`, raising `P0002`
   when absent. This is the serialization point `N4.05.16.01` prescribes.
2. Reject a Player who already holds a `CONFIRMED` or `WAITLISTED` entry in this Window.
3. Count `CONFIRMED` entries. The count runs after the lock, so under READ COMMITTED it observes a
   competing transaction's committed insert rather than a stale snapshot.
4. Below capacity, the entry is `CONFIRMED` with a null `queue_sequence`. At or above capacity it is
   `WAITLISTED`, taking `next_queue_sequence` and incrementing the Window's counter.
5. Insert the entry, increment the Window's `revision`, touch `updated_at`, and return the result.

Steps 3 and 4 together are `REG-INV-006` — the confirmed count never exceeds capacity — and they
hold only because step 1 serialized the Window. Step 4 is `REG-INV-007`, `REG-INV-008` and
`REG-INV-009`: FIFO order comes from an authoritative monotonic counter, never from a client
timestamp and never from `updated_at`.

The counter lives on the Window rather than being derived as `max(queue_sequence) + 1`. Deriving it
would be correct today, because entries are never hard-deleted and withdrawn rows keep their
sequence, but the monotonic guarantee would then depend on which rows happen to survive; any future
archival would silently reintroduce sequence reuse. `N5.05.06` names the Window counter first for
that reason.

**What the allocator does not decide:** caller authorization, Community eligibility, Window
lifecycle, or the `closes_at` deadline. Those belong to the public commands in `XS-W4-02` and
`XS-W4-03`, the same division `app_private.materialize_target_session_roster` established in W3-05.
This is not only tidiness: `XS-W4-06` imports legacy registrations into a Window that is not `OPEN`,
and a lifecycle check inside the allocator would block that slice.

**Rejoin creates a new row.** `REG-INV-011` sends a rejoining Player to the end of the queue, and
the partial unique index permits the insert because it excludes `WITHDRAWN` and `REMOVED`. The
abandoned entry keeps its old position as history.

**A duplicate effective entry raises `23514`, not `23505`.** Left alone, step 2's condition would
trip the partial unique index and surface a raw `23505`. This codebase now reserves `23505` for
idempotency collisions — it is what `app_private.find_command_receipt` raises, and a client seeing it
concludes its `command_id` was reused. The allocator therefore pre-checks and raises `23514`, leaving
the unique index as a backstop rather than the messenger.

**Idempotency belongs to `XS-W4-03`.** The allocator takes a caller-supplied final `p_entry_id`, so
row identity is the caller's to control, and `JoinRegistration` will wrap it in the existing
`app_private.command_receipts` substrate rather than introducing a second mechanism.

SQLSTATE usage follows the established target convention: `23514` invalid shape or duplicate
effective entry, `42501` authorization, `P0002` missing Window, `23505` idempotency collision,
`40001` stale revision.

## Access model

`registration_windows` enables RLS, revokes everything from `public`, `anon` and `authenticated`,
then grants `SELECT` to `authenticated` under a policy delegating to
`app_private.current_user_can_read_target_session(session_id)`. Capacity and status are what a member
needs in order to decide whether to sign up.

`registration_entries` enables RLS and receives **no browser grant at all** in this slice.
`OPEN-REG-003` leaves open whether a member sees an exact numeric waitlist position or something
coarser, and `N2.05` §28 requires returning the minimum necessary and never exposing full queue
identities. A blanket `SELECT` policy would hand every Session reader the entire queue with player
identities, closing that decision in its least reversible direction. Purpose-specific query commands
in `XS-W4-02` and `XS-W4-03` will expose only what a caller is entitled to.

The cost is explicit: until those commands land, a member cannot read their own entry, not even
through a narrow self-only policy. That surface deserves to be designed by the slice that owns
reads rather than approximated here.

Neither table receives a browser `INSERT`, `UPDATE` or `DELETE` grant or policy. Writes are
semantic-command-only, as with every target table since W3-01.

## Verification

Database tests follow red-green-refactor in `src/test/db/registrationSchema.dbtest.ts` against real
PostgreSQL (`QA-INV-004`), and prove:

1. both tables expose the approved literal columns, types and nullability;
2. the lifecycle and status value sets reject anything outside them with `23514`;
3. `capacity` rejects zero and negative values;
4. a Window on a QUICK Session, on a legacy Session, and on a missing Session are each rejected;
5. `session_id` is unique per Window;
6. the effective-entry partial unique rejects a second `CONFIRMED` or `WAITLISTED` row for one
   Player, while permitting one after the first is `WITHDRAWN` (`REG-INV-010`, `REG-INV-011`);
7. the queue-position partial unique rejects a shared `queue_sequence`;
8. a `WAITLISTED` row without a `queue_sequence` is rejected;
9. the Window's `session_id` and the entry's `registration_window_id` and `player_id` use
   `RESTRICT`, both `created_by_user_id` columns use `SET NULL`, and every foreign key has a
   complete leading-column btree index;
10. **the exit gate:** with capacity 12 and 11 confirmed, two concurrent transactions allocating
    simultaneously produce exactly one `CONFIRMED` and one `WAITLISTED`, using two real connections
    (`QA-INV-008`, `REG-INV-006`, `REG-INV-015`);
11. sequences strictly increase, and a withdraw-then-rejoin receives a higher sequence than it held
    (`REG-INV-007`, `REG-INV-011`);
12. `next_queue_sequence` never regresses after withdrawals, so a position is never reissued;
13. a Player holding an effective entry is rejected with `23514`, never `23505`;
14. a failed allocation leaves no entry, no consumed sequence and no revision bump (`QA-INV-012`);
15. `authenticated` cannot insert, update or delete either table, cannot select
    `registration_entries` at all, and selects `registration_windows` only when it can read the
    Session — with both allow and deny identities (`QA-INV-005`);
16. a Window UUID belonging to another Community grants nothing (`QA-INV-006`);
17. the allocator is unreachable by `anon` and `authenticated`.

Completion runs the database suite twice from a from-zero migration replay, plus the repository
gates in CI order: `typecheck`, `lint:eslint`, `format:check`, `test`, `build`,
`check:architecture`, `test:db`. Pre-existing repository-wide lint and formatting findings are
reported separately and never silently rewritten.

## Exit gate

`XS-W4-01` is complete when the schema decides the last-slot race server-side under concurrent
transactions with no client-side counting; when FIFO order derives from an authoritative monotonic
counter rather than any timestamp; when one Player cannot hold two effective entries in one Window;
and when every open Registration decision — capacity semantics, queue visibility, ineligible
promotion policy, reserved slots, payment, reopen — remains open.

Authority change: none. Registration write authority arrives with the commands in `XS-W4-02` and
`XS-W4-03`. Schema phase: EXPAND.
