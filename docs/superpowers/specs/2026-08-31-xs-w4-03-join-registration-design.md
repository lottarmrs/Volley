# XS-W4-03 JoinRegistration Design

## Context

`XS-W4-01` built the Registration schema and `app_private.allocate_registration_slot`, which
serializes on the Window row and decides the last-slot race server-side. `XS-W4-02` added the
lifecycle commands that create a Window and move it through `DRAFT → OPEN → CLOSED → LOCKED`.
Nothing can yet put a person into a Window.

`XS-W4-03` adds that: a member joins themselves, and an organizer adds someone. Both are thin,
authorized, eligibility-checked wrappers over the allocator, which already owns capacity and FIFO
and was proven under a barrier-gated concurrent test. This slice adds the authorization and
eligibility the allocator deliberately refused to own, and nothing else about concurrency.

The identity rule is the slice's spine. `REG-INV-004` requires self-join to resolve actor and Player
server-side, and `REG-INV-005` forbids the client choosing another Player for a self-join. So
`join_registration` accepts no player id at all.

`LeaveRegistration`, promotion and `ChangeRegistrationCapacity` are `XS-W4-04`;
`FinalizeSessionRoster` is `XS-W4-05`.

**Architecture sources:** `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`
XS-W4-03; `docs/architecture/contexts/N2.05-registration.md` N3.05.03–07 and N3.05.16, with
REG-INV-001/002/004/005/006/007/008/009/010/018/019/027/030/031/032;
`docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md` `JoinRegistration`;
`docs/architecture/matrices/C5.03-CAPABILITY-SECURITY-PRIVACY-MATRIX.md` line 171;
`docs/architecture/catalogs/OPEN-DECISIONS.md` OPEN-REG-001..006;
`docs/architecture/adr/ADR-CATALOG.md` ADR-API-003/006;
`docs/architecture/quality/N2.20-testing-qa.md` QA-INV-004/005/006/008/009/010/012.

## Goals

- Add `join_registration` so an eligible member registers themselves, with the server resolving
  their Player.
- Add `add_registration_entry` so an assigned organizer registers a Player who may have no account.
- Return only the authoritative outcome and the Window revision.
- Prove the last-slot race and a 100-join burst preserve capacity and FIFO uniqueness.

## Non-goals

- Do not implement `LeaveRegistration`, promotion, `RemoveRegistrationEntry` or
  `RestoreRegistrationEntry`. Those are `XS-W4-04`.
- Do not implement `ChangeRegistrationCapacity` or `FinalizeSessionRoster`.
- Do not add a read surface for `registration_entries`. `OPEN-REG-003` stays open, and this slice
  keeps the table unreadable by browser roles — which is why the return shape carries no queue
  position.
- Do not return the caller's `queue_sequence`, a coarse position band, or capacity counts. Any of
  those would decide `OPEN-REG-003` by implication.
- Do not add offline queueing or retry replay. `REG-INV-027` forbids queueing Registration
  mutations for automatic offline replay, and the execution doc marks this path
  `ONLINE_AUTHORITATIVE` with no generic outbox replay.
- Do not decide unlimited capacity, ineligible-promotion policy, reserved slots, payment, or reopen
  semantics. `OPEN-REG-001` through `OPEN-REG-006` all stay open.

## The two commands

```text
public.join_registration(p_command_id uuid, p_entry_id uuid, p_window_id uuid)
  → (entry_status text, window_revision integer)

public.add_registration_entry(
  p_command_id uuid, p_entry_id uuid, p_window_id uuid, p_player_id uuid
) → (entry_status text, window_revision integer)
```

Both are `SECURITY DEFINER` with `set search_path = ''`, fully qualified, revoked from `public` and
`anon`, granted to `authenticated`.

`join_registration` accepts no player id, no source and no queue position. `REG-INV-005` forbids the
client naming a Player for a self-join, and `ADR-API-003` requires the actor to be server-derived.

`add_registration_entry` has no row in `C5.02`'s command matrix. Its authority comes from
`C5.03` line 171 — "remove/add participant administratively", granted to the Assigned Session
Organizer, with the note that an "organizer-add command may create participant under policy". The
command's shape is therefore inferred from the capability matrix and the `ORGANIZER_ADDED` source
value rather than specified, and this design states that rather than implying otherwise.

### Eligibility asymmetry

| | `join_registration` | `add_registration_entry` |
|---|---|---|
| Authorization | active `community_memberships` row in the Session's Community | assigned Session Organizer, via `public.assert_target_session_write_authorized` |
| Player | resolved from `public.current_user_active_player_id()` | supplied as `p_player_id` |
| Requires an ACTIVE account link | yes | **no** |
| Requires a live roster standing (relation **and** `players` row) | yes | yes |
| `source` recorded | `SELF_JOIN` | `ORGANIZER_ADDED` |

The account-link asymmetry is deliberate. A self-joiner must have claimed their Player, because the
command's entire identity resolution runs through that link — without it there is no Player to
register and no way to derive one without violating `REG-INV-005`. An organizer routinely adds
someone who has no account at all: a player who exists on the Community's sports roster and never
signed up. Requiring a link there would make the command useless for the case it exists to serve.

What both require is a live roster relation: the `community_players` relation itself — `deleted_at
is null` and `active` — and the underlying `players` row — `deleted_at is null` and `active`. A
Player who is not on this Community's roster, or whose canonical Player row is no longer live,
cannot be registered by either path. This repository separates the two relations deliberately (W2
split membership from sports roster), so "member" and "player on the roster" are different facts
and this slice needs both for a self-join.

### The `closes_at` deadline

`join_registration` refuses once `pg_catalog.now() >= closes_at`, when `closes_at` is set.
`REG-INV-018` requires the deadline to be enforced by the server comparing its own clock at join
time, never by trusting a scheduler's punctuality.

`add_registration_entry` does not check it. W4-02 left `closes_at` inert with nothing auto-closing a
Window, so after the deadline the Window sits `OPEN` until an organizer closes it — and the
organizer is precisely who should still be able to add a late arrival during that interval.

Both commands require `status = 'OPEN'`. Neither can add to a `DRAFT`, `CLOSED` or `LOCKED` Window.

## Transaction and idempotency

### Order

Both commands execute in this order; only steps 4 and 8 differ.

1. reject a null argument with `23514`;
2. resolve the Session from the Window and lock it `FOR UPDATE`, raising `P0002` when absent;
3. lock the Window `FOR UPDATE`, raising `P0002` when absent;
4. authorize — `app_private.current_user_can_join_registration(p_window_id)` for self-join,
   `public.assert_target_session_write_authorized(v_session)` for organizer-add — raising `42501`;
5. look up the command receipt, once, after authorization; on a hit return the recorded result and
   stop;
6. Session lifecycle gate (`DRAFT`/`SCHEDULED`), raising `23514`;
7. Window `status = 'OPEN'`, raising `23514`;
8. self-join only: `closes_at is null or pg_catalog.now() < closes_at`, raising `23514`;
9. resolve and validate the Player, raising `42501` in every failing case. For self-join, resolve
   through `public.current_user_active_player_id()`; a null result means the caller has no ACTIVE
   account link and therefore no Player to register, which is an eligibility failure rather than a
   missing argument. For organizer-add, take `p_player_id`. Both then require a live
   `community_players` relation in the Session's Community and a live `players` row;
10. delegate to `app_private.allocate_registration_slot(p_entry_id, p_window_id, v_player_id,
    '<source>', (select auth.uid()))`;
11. record the receipt with `aggregate_id = p_window_id` and
    `retention_class = 'REGISTRATION_ENTRY'`;
12. return the allocator's status and the Window's new revision.

**Lock ordering is Session first, then Window**, matching W4-02 and keeping the uniform order
`XS-W4-05` depends on. This costs nothing between concurrent joins: there is exactly one Window per
Session, and the allocator already takes `registration_windows FOR UPDATE`, so joins to a Session
already serialize on the Window row. The Session lock only serializes joins against Session and
Registration lifecycle commands, which is the desired behavior. `REG-INV-030` requires these locks
to be database-authoritative rather than process-local.

**A single receipt lookup, placed after authorization**, as W4-02 established. A caller whose
membership or assignment was revoked cannot replay a receipt to read back the original result, and
an unauthorized caller receives `42501` rather than a `23505` that would confirm their `command_id`
exists.

### No `expected_revision`

Neither command takes one, and this is the one place the shape diverges from every command since
W3-06. `C5.02`'s `JoinRegistration` row lists its idempotency as "command receipt + unique active
entry + queue sequence" and names no expected revision.

It would also be actively harmful. The Window's `revision` increments on every join, so a member
holding a revision from page load would receive `40001` because of churn caused by other people
joining — a conflict about nothing they did. The command receipt (`REG-INV-031`) and the unique
active-entry constraint (`REG-INV-032`) carry idempotency here instead.

### A second join is an error, not a no-op

W4-02's commands treat a second distinct `command_id` against a Window already in the target state
as a no-op returning current state. This slice does the opposite: the allocator's
duplicate-effective-entry pre-check raises `23514`, because "you are already registered" is a real
failure rather than a repeated intention.

That is exactly `REG-INV-032` — distinct duplicate commands protected by a domain constraint rather
than by command identity — and `REG-INV-010`, at most one active effective entry per Window and
Player.

### `WAITLISTED` is a success

The command returns `WAITLISTED` as a normal committed result. `C5.02` states that `CONFIRMED` and
`WAITLISTED` are "both successful domain outcomes". A client treating `WAITLISTED` as a failure is
misreading the contract, and no error is raised on that path.

### Error codes

Eligibility failures raise `42501`, including on the organizer path. This follows W3-05's precedent,
where an ineligible Player raised `42501`. On `add_registration_entry` that means an authorized
organizer can still receive `42501` — not because the caller lacks authority, but because that
Player is not on the Community's roster. The code alone reads as if the caller were rejected, so the
message must name the Player rather than the caller.

Otherwise: `23514` invalid shape, Window state, Session lifecycle, expired deadline, or duplicate
effective entry; `P0002` missing Window or Session; `23505` idempotency collision; `40001` is not
raised by either command, since neither takes an expected revision.

## Access model

No new tables and no grant changes. The two commands are granted to `authenticated`;
`app_private.current_user_can_join_registration(uuid)` is `STABLE SECURITY DEFINER` with
`set search_path = ''` and revoked from `public`, `anon` and `authenticated`.

`registration_entries` continues to carry no browser grant of any kind. A member who has just joined
still cannot read their own entry back. That gap is unchanged and deliberate: `OPEN-REG-003` leaves
open how much of the queue a member may see, and this slice's return shape — status and revision
only — is what keeps that decision open for the slice that designs the read surface.

## Verification

Database tests follow red-green-refactor in `src/test/db/registrationJoin.dbtest.ts` against real
PostgreSQL (`QA-INV-004`), and prove:

1. an eligible member's self-join returns `CONFIRMED`, and the entry records `SELF_JOIN`, the
   caller's resolved Player and the caller as actor;
2. a self-join on a full Window returns `WAITLISTED` as a successful result, with a `queue_sequence`
   present in the row;
3. the returned row exposes exactly `entry_status` and `window_revision` — no `queue_sequence`, no
   counts, no player id;
4. self-join is rejected `42501` for each broken link in the chain: no membership; membership
   without an ACTIVE account link; linked Player with no `community_players` relation; a
   soft-deleted relation; an inactive relation; and a live relation whose `players` row is
   soft-deleted;
5. `add_registration_entry` succeeds for a Player who has a live roster relation and **no account
   link at all** — the case the command exists for;
6. `add_registration_entry` is rejected `42501` for a Player off the roster, for a Player whose
   `players` row is soft-deleted despite a live relation, for a Player live on a *different*
   Community's roster, and for a caller who is a member but not the assigned organizer;
7. self-join is rejected `23514` once `now() >= closes_at`, and succeeds when `closes_at` is null or
   in the future; `add_registration_entry` succeeds after that deadline while the Window is `OPEN`;
8. both commands are rejected `23514` on `DRAFT`, `CLOSED` and `LOCKED` Windows, and on
   `IN_PROGRESS`, `COMPLETED` and `CANCELLED` Sessions;
9. the same Player joining twice under **different** command ids raises `23514`;
10. the same `command_id` retried returns the recorded result; reused against another Window or
    another command type it raises `23505`;
11. a caller whose membership was revoked, replaying a real `command_id`, receives `42501` and never
    the recorded result;
12. **the exit gate:** two simultaneous joins for the last slot yield exactly one `CONFIRMED` and one
    `WAITLISTED`, using a barrier connection so the contention is structural rather than timed
    (`QA-INV-008`);
13. **the burst:** 100 joins against a smaller capacity leave the confirmed count exactly equal to
    capacity, and the waitlisted `queue_sequence` values are precisely `1..N` with no duplicate and
    no gap (`REG-INV-006`, `REG-INV-007`);
14. a rejected join leaves no entry row, no receipt and no revision increment (`QA-INV-012`);
15. `anon` and `authenticated` still hold no privilege on `registration_entries`, and neither can
    execute `app_private.current_user_can_join_registration`;
16. each command writes a receipt carrying its own `command_type`, `aggregate_id = window_id`, the
    server-derived actor and `retention_class = 'REGISTRATION_ENTRY'`.

Two notes on item 13, both chosen to keep the test honest and affordable.

The harness connection pool caps at eight, so it runs its hundred joins in concurrent batches rather
than a hundred genuinely simultaneous transactions. That proves what the execution doc asks —
capacity preserved and sequences unique and gapless under contention — while item 12 is what proves
the last-slot race itself. The test's name should not imply more isolation than the pool allows.

It should also drive the burst through `add_registration_entry` rather than `join_registration`.
Both reach the identical allocator, but a hundred self-joins would need a hundred auth users, a
hundred ACTIVE account links and a hundred memberships on top of the roster relations, which is
minutes of fixture setup proving nothing item 4 does not already prove. Organizer-add needs only a
Player and a live `community_players` relation per participant. The eligibility chain is verified
once, precisely, in items 4 through 6; the burst exists to stress capacity and FIFO.

Completion runs the database suite twice from a from-zero migration replay, plus the repository
gates in CI order: `typecheck`, `lint:eslint`, `format:check`, `test`, `build`,
`check:architecture`, `test:db`. Pre-existing repository-wide lint and formatting findings are
reported separately and never silently rewritten.

## Exit gate

`XS-W4-03` is complete when an eligible member can register themselves without naming a Player, when
an organizer can register a Player who has no account, when two simultaneous joins for one remaining
slot produce exactly one `CONFIRMED` and one `WAITLISTED`, when a hundred joins preserve capacity and
a gapless FIFO sequence, when a retried `command_id` returns its recorded result and a revoked caller
cannot replay one, and when every open Registration decision remains open.

Authority change: Registration entry creation moves to server semantic commands. Session and
Registration lifecycle authority are unchanged. Schema phase: EXPAND, with no new tables.
