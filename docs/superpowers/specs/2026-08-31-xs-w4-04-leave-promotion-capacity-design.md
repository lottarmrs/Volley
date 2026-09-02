# XS-W4-04 Leave, Promotion and Capacity Design

## Context

XS-W4-01 built the Registration schema and `app_private.allocate_registration_slot`, the private
allocator that serializes on the Window row and decides the last slot on the server. XS-W4-02 added
the lifecycle commands (`DRAFT → OPEN → CLOSED → LOCKED`). XS-W4-03 added the two ways in:
`join_registration`, where a member registers themselves and the server resolves their Player, and
`add_registration_entry`, where an assigned organizer registers a Player who may hold no account at
all.

Nothing yet takes anyone **out** of a Window, and nothing consumes the waitlist. A Window today is
one-directional: entries accumulate, `CONFIRMED` fills to capacity, and every later arrival queues
behind a `queue_sequence` that no code path ever redeems. This slice closes that loop.

The governing documents are `docs/architecture/contexts/N2.05-registration.md` (§9 Leave, §10
Promotion, §11 Capacity, §19 state machines, §20 commands catalog, §22 authorization, §25
transactions, §35 invariants) and `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`
(XS-W4-04). Three decisions this slice makes were open and are settled below: the scope, the
ineligible-waiter policy (`OPEN-REG-002`), and whether capacity change carries an
`expected_revision`.

## Goals

- `leave_registration` — a member withdraws their own effective entry, and a withdrawn `CONFIRMED`
  seat is refilled from the waitlist **in the same transaction** (`REG-INV-013`).
- `remove_registration_entry` — an assigned organizer removes another Player's entry, with the same
  atomic refill.
- `change_registration_capacity` — an assigned organizer changes capacity; an increase promotes in
  FIFO order within the same transaction (`REG-INV-016`), and a reduction below the live confirmed
  count is refused without choosing victims (`REG-INV-017`).
- One internal promoter, `app_private.promote_waitlist_to_capacity`, shared by all three triggers
  the context document names (§10: confirmed leave, confirmed removal, capacity increase).
- Promotion revalidates eligibility per candidate and skips the ineligible with an audited reason,
  never freezing the queue and never silently granting a later member (`REG-INV-014`).

## Non-goals

- **`RestoreRegistrationEntry`.** The commands catalog names it and this slice creates `REMOVED`
  entries that would be its input, but re-entry policy after removal is unsettled (§4 N5.05.03.05:
  "reentrada automática pode ser bloqueada até Restore"). Deferred with `OPEN-REG-002` fully
  resolved only for the promotion path.
- **`ReopenRegistration`.** Explicitly policy-TBD in the catalog and blocked on `OPEN-REG-006`.
- **`FinalizeSessionRoster`** — XS-W4-05.
- **Any read surface.** `registration_entries` keeps zero browser grants. This slice does not add a
  query, a view, or a returning column that would expose the queue's contents or a member's numeric
  position, so `OPEN-REG-003` stays open. See "Access model".
- **Notifications and realtime.** `RegistrationPromoted` (§10 N5.05.09.02) is a downstream concern;
  `REG-INV-028` forbids a provider failure from rolling back a Registration fact, which is exactly
  why no provider call belongs inside these transactions.
- **Closing the `next_queue_sequence` inference leak.** An active member can read
  `registration_windows` and derive their own queue position from `next_queue_sequence`. That grant
  predates this slice; closing it belongs to whichever slice resolves `OPEN-REG-003`.

## The three commands

```sql
public.leave_registration(
  p_command_id uuid,
  p_window_id uuid
) returns table (entry_status text, window_revision integer)

public.remove_registration_entry(
  p_command_id uuid,
  p_window_id uuid,
  p_player_id uuid,
  p_reason text
) returns table (entry_status text, window_revision integer)

public.change_registration_capacity(
  p_command_id uuid,
  p_window_id uuid,
  p_capacity integer
) returns table (window_capacity integer, window_revision integer)
```

All three are `security definer`, `set search_path = ''`, revoked from `public, anon` and granted
`execute` to `authenticated`.

`remove_registration_entry` addresses its target as `(window_id, player_id)` rather than by entry
id. That mirrors `add_registration_entry`, and more importantly it means no entry row is read
before the Window is locked — an entry-id signature would force a read-then-lock, where the row
identified before the lock may not be the row that exists after it.

`p_reason` is optional (`null` allowed). The existing
`registration_entries_removal_reason_check` already rejects a present-but-blank string.

### `leave_registration` resolves the caller's own entry

The command takes no player id and no entry id, for the same reason `join_registration` takes none
(`REG-INV-004`, `REG-INV-005`): the client must not be able to name whose entry to withdraw. The
server resolves the Player through `public.current_user_active_player_id()` and then finds that
Player's effective entry in the Window.

An entry is resolved by Player, never by `source`. A member whose entry was created by an organizer
(`source = 'ORGANIZER_ADDED'`) can still leave it — it is their entry regardless of who made it.

## Authorization

| Command | Authorized by |
|---|---|
| `leave_registration` | an ACTIVE `player_account_links` row for the caller, **plus** an effective entry owned by that Player |
| `remove_registration_entry` | `public.assert_target_session_write_authorized(v_session)` — an assigned Session Organizer |
| `change_registration_capacity` | `public.assert_target_session_write_authorized(v_session)` |

That helper takes the already-locked `sessions` record, so it costs no extra read and cannot observe
a Session different from the one the command locked.

This matches the authorization matrix in §22: "Leave self" is available to every row of the matrix,
while "Add/remove outro Player" and "Change capacity" are Organizer-only.

### Leave does not require active membership — deliberately

Every other Registration command requires either an active `community_memberships` row or an
organizer assignment. `leave_registration` requires neither.

The reason is that withdrawing is the only Registration action that is strictly de-escalating: it
can affect exactly one entry, that entry belongs to the caller, and its effect is to give a seat
back. Requiring membership would mean a member who leaves the Community can no longer withdraw
their own entry, stranding it until an organizer notices — and the promoter would then have to
`REMOVE` it at promotion time anyway, converting a voluntary `WITHDRAWN` into an administrative
`REMOVED` and losing the distinction `REG-INV-012` exists to preserve.

The residual exposure has three parts, all a consequence of the prescribed step order (authorization
→ receipt → Session lifecycle → Window state → entry resolution), not defects:

- a caller holding an ACTIVE link can distinguish "this Window id does not exist" from "this Window
  exists but I have no entry in it" — both raise `P0002`, but only the first raises it immediately;
- the same caller, holding a Window UUID for a Community they have no relationship to, also learns
  **whether the Session is outside `DRAFT`/`SCHEDULED`** and **whether the Window is `LOCKED`**,
  because those raise `23514` with distinct messages before the entry is resolved;
- `leave_registration`'s receipt lookup is gated only on holding an ACTIVE link —
  `app_private.find_command_receipt` does not compare `actor_id` — making it the weakest receipt
  gate in the program, where every other command gates on membership or an organizer assignment.

All three require possession of an unguessable Window UUID, and the receipt leak additionally
requires a second unguessable `command_id`. Learning any of this about a UUID one already possesses
discloses nothing about the Community's or Session's identity, or anyone else's entry, and every
path that would reveal more is still gated. The ordering itself is deliberate, not an oversight:
moving the Window-state gate after entry resolution would give a legitimate member the wrong error
code when leaving a `LOCKED` Window.

**This asymmetry is the thing to attack in review.** If it is wrong, the fix is one added
membership check and one test.

## Promotion

### One promoter, three triggers

```sql
app_private.promote_waitlist_to_capacity(
  p_window_id uuid
) returns jsonb
```

Revoked from `public, anon, authenticated`; reachable only from the three commands above.

It takes no actor. A promotion is a consequence of someone else's command, not an act with an
author: `registration_entries` has no column recording who caused a status change, `created_by_user_id`
keeps naming whoever created the entry, and threading an actor through only to discard it would be a
parameter the body never reads.

It assumes its caller already holds the Window row lock, and it fills **every** free slot:

```text
loop
  confirmed := count(CONFIRMED in window)
  exit when confirmed >= capacity
  candidate := first WAITLISTED by queue_sequence
  exit when no candidate
  if eligible(candidate)
    candidate → CONFIRMED   (queue_sequence preserved)
  else
    candidate → REMOVED     (removal_reason = 'INELIGIBLE_AT_PROMOTION')
  end
end loop
```

After a Leave or a Remove of a `CONFIRMED` entry there is exactly one free slot, so it promotes at
most one. After a capacity increase from 12 to 15 with eight waiting, there are three free slots, so
it promotes the first three eligible in FIFO order. That is `REG-INV-016` as a consequence of the
algorithm rather than as a second code path.

**Invariant: after every mutating command, either `confirmed = capacity`, or no `WAITLISTED` entry
exists.** It holds because a seat can only be free when the queue is empty: every command that frees
or adds a seat runs this promoter before returning, which does not stop until every seat is filled or
the queue is exhausted. It is also why "an increase promotes; a decrease never demotes" (below) is a
consequence, not a guard: a decrease is only reachable at `confirmed <= new capacity`, and reaching
that with waiters present would need `confirmed < capacity` with a non-empty queue — forbidden here.
The `CONFIRMED`-only guard in `leave_registration` and `remove_registration_entry` depends on it; a
later break of the invariant breaks those guards.

The loop terminates: every iteration either raises the confirmed count by one (bounded by capacity)
or removes a candidate from the `WAITLISTED` set (bounded by the queue's length).

**The promoter never touches `revision`.** Its caller bumps once. See "One bump per command".

### A promoted entry keeps its `queue_sequence`

The W4-01 schema anticipated this: `registration_entries_waitlisted_has_sequence_check` requires a
sequence only for `WAITLISTED`, and its comment records that a `CONFIRMED` entry may carry one
(promoted) or not (walked straight in). Preserving it keeps the evidence of where a confirmation
came from. A `REMOVED` or `WITHDRAWN` entry keeps its sequence for the same reason: a position is
never reissued, so history is never rewritten.

A consequence worth stating plainly, because a later reader will otherwise "fix" it: **once a
promotion has occurred, the set of live `WAITLISTED` sequences is no longer `1..N`.** Gaplessness is
a pre-promotion property. Any test asserting a contiguous range must assert it before the first
promotion, or assert strict increase and uniqueness instead. Renumbering to restore contiguity would
violate `REG-INV-007`.

### Eligibility is revalidated per candidate, against that entry's `source`

| `source` | revalidated against |
|---|---|
| `SELF_JOIN` | an active `community_memberships` row for the linked user, **and** an ACTIVE `player_account_links` row for the Player, **and** live roster standing |
| `ORGANIZER_ADDED`, `MIGRATION`, `ADMIN_RESTORE` | live roster standing only |

This is forced by W4-03, not chosen. That slice deliberately let an organizer register a Player who
holds no account at all — the case the command exists for. A uniform self-join rule at promotion
time would make every such entry permanently unpromotable, so an organizer-added Player could reach
the waitlist and never leave it.

"Live roster standing" means what XS-W4-03 settled it to mean: a `community_players` row in the
Session's Community with `deleted_at is null and active`, **and** the `players` row itself with
`deleted_at is null and active`.

The `SELF_JOIN` check is expressible player-first because
`player_account_links_one_active_per_player` is a partial unique index on `player_id where status =
'ACTIVE'` — at most one ACTIVE link can exist per Player, so there is no ambiguity about which user
to test membership for.

### `OPEN-REG-002` — the ineligible waiter

`OPEN-REG-002` asks what happens to a waitlisted entry that becomes temporarily ineligible. The
context document constrains both ends: the queue must not freeze behind them (§7 N5.05.06.04, "sem
bloquear todos atrás indefinidamente") and the entry must not vanish ("deve receber estado/audit
apropriado; não desaparecer", "com reason preservado para o anterior"). The execution document adds:
"Do not silently grant a later user while losing audit of why earlier candidate was skipped."

**Decision: skip and `REMOVE`, with an audited reason.** The candidate becomes `REMOVED` with
`removed_at = now()` and `removal_reason = 'INELIGIBLE_AT_PROMOTION'`, and the walk continues to the
next candidate.

This uses the columns W4-01 already carries for exactly this purpose, keeps `REMOVED` distinct from
`WITHDRAWN` as `REG-INV-012` requires, and terminates: a skipped entry stops being a candidate
rather than being re-evaluated on every future promotion forever.

The cost is real and accepted: a *transient* ineligibility permanently costs the position. Someone
whose membership was briefly deactivated and then restored must rejoin, and rejoining goes to the
end of the queue (`REG-INV-011`). The alternative — leaving them `WAITLISTED` and recording the skip
elsewhere — would need a new audit table to hold the reason, since a `WAITLISTED` entry has nowhere
to put it, and would re-evaluate the same broken entry on every subsequent promotion.
`RestoreRegistrationEntry` already exists in the commands catalog as the deliberate, audited way
back.

`removal_reason` stays free text for organizer removals. `'INELIGIBLE_AT_PROMOTION'` is a reserved
token within that column, not a new enum — introducing a constrained vocabulary would forbid the
free-text organizer reason the column was added for.

## Transaction and idempotency

### Order

Every command follows the prologue W3-06 established and W4-02/W4-03 repeated. The order is
load-bearing at three points, marked below.

```text
 1. null-check arguments                                   → 23514
 2. lock the Session FOR UPDATE (join through the Window)   → P0002   ← before the Window, always
 3. lock the Window FOR UPDATE                              → P0002
 4. authorize                                               → 42501
 5. look up the command receipt (exactly once, AFTER auth)  → return the recorded result
 6. Session lifecycle gate: DRAFT or SCHEDULED              → 23514
 7. Window gate: not LOCKED                                 → 23514
 8. resolve the target entry / read the current capacity    → P0002
 9. already-in-target-state no-op (capacity only)           → return current state, no bump
10. mutate; promote if a CONFIRMED seat was freed or added
11. bump revision once; set updated_at
12. record the receipt
13. return
```

**Step 2 before step 3.** Every command in this chain takes the Session row before the Window row.
Nothing in the schema enforces this, and no test can catch it in isolation, because a deadlock needs
two commands taking the two locks in opposite orders. Inverting it here would deadlock against
`close_registration`, `lock_registration`, `join_registration` and `add_registration_entry` on the
first concurrent pair. The promoter takes no locks of its own — it runs entirely inside the caller's
Window lock.

**Step 5 after step 4.** A receipt lookup that ran before authorization would let an unauthorized
caller learn a command's recorded result by replaying its `command_id`.

**Step 9 before step 10.** A no-op that fell through to the mutation would bump the revision for a
command that changed nothing, and every holder of an `expected_revision` downstream would be
invalidated by a command that did nothing. Step 9 exists only for
`change_registration_capacity`: a repeated Leave or Remove has no target left to act on and stops at
step 8 with `P0002`, so there is no state to recognize as already-reached.

Throughout, an **effective entry** means one whose status is `CONFIRMED` or `WAITLISTED` — the same
set the partial unique index `registration_entries_effective_key` constrains to at most one per
Window and Player (`REG-INV-010`). `WITHDRAWN` and `REMOVED` entries are history: they are never
resolved as a command's target and never block a rejoin.

### One bump per command, never one per promotion

A Leave that frees a seat and promotes a waiter is **one** logical mutation and produces **one**
revision bump. So does a capacity increase that promotes three people. `REG-INV-013` makes the leave
and its promotion atomic; making them two revisions would mean a downstream reader could hold a
revision naming a state — seat freed, nobody promoted — that the invariant says never exists.

This is why `promote_waitlist_to_capacity` does not touch `revision` and why the promotion path does
**not** reuse `app_private.allocate_registration_slot`, which bumps `revision` itself and inserts a
new row. Promotion updates an existing row; allocation creates one. They are different operations
that happen to both end in `CONFIRMED`.

### No `expected_revision`

None of the three commands takes one, for the reason XS-W4-03 refused it: the Window's `revision`
advances on every join, so a token captured when a screen loaded would be stale because of other
people's registrations rather than because of any conflicting edit. An organizer would be told
`40001` for a capacity change that conflicts with nothing.

Correctness does not rest on the token. It rests on the Window row lock plus the guards evaluated
under it against live data: capacity reduction is checked against the live confirmed count, and the
target entry is resolved after the lock is held. `FinalizeSessionRoster` (XS-W4-05) is where an
`expected_revision` genuinely belongs, because there the whole point is to reject a snapshot taken
before a change (`REG-INV-021`).

### Idempotency is doubled

Each command records a receipt keyed by `(command_id, command_type, window_id)` with retention class
`REGISTRATION_ENTRY`, so a retry of the same `command_id` returns the recorded result without a
second mutation (`REG-INV-031`).

That covers the retry. It does not cover a double-click that generates two distinct `command_id`s,
so each command is also idempotent in domain state (`REG-INV-032`): a second Leave finds no
effective entry, a second Remove finds none either, and a capacity change to the value already
stored is the step-9 no-op. The no-op returns the current state and does not bump the revision.

## Capacity

### Reduction below the confirmed count is refused

`change_registration_capacity` counts live `CONFIRMED` entries under the Window lock and raises
`23514` when the requested capacity is lower, choosing no victims (`REG-INV-017`, §11 N4.05.10.02).
The documented path for an organizer who genuinely wants a smaller Window is to remove entries
explicitly first — which is why `remove_registration_entry` is in this slice rather than a later
one.

Reducing to exactly the confirmed count is allowed: the invariant is `confirmed_count <= capacity`.

`p_capacity` must be greater than zero. The command checks this explicitly rather than letting
`registration_windows_capacity_check` fire, so the caller gets the command's message rather than a
constraint name.

### An increase promotes; a decrease never demotes

An increase computes the new free slots under the lock and calls the promoter. A decrease that
passes the guard promotes nobody and demotes nobody — no `CONFIRMED` entry is ever moved back to
`WAITLISTED` by any command in this slice.

## Window and Session gates

| | `DRAFT` | `OPEN` | `CLOSED` | `LOCKED` |
|---|---|---|---|---|
| `leave_registration` | n/a — no entries exist | yes | **yes** | no |
| `remove_registration_entry` | n/a | yes | **yes** | no |
| `change_registration_capacity` | yes | yes | yes | no |

Leave and Remove work in `CLOSED` because `REG-INV-013` scopes atomic leave-and-promotion to
"before LOCKED", and §9 says the same. Closing a Window stops new arrivals; it does not trap the
people already in it. A `DRAFT` Window cannot hold entries at all, because `join_registration` and
`add_registration_entry` both require `OPEN` — so the `DRAFT` cell is unreachable rather than
forbidden, and Leave in a `DRAFT` Window fails at step 8 with `P0002` (no effective entry) rather
than at a status gate.

`closes_at` is not consulted by any command in this slice. The deadline governs joining, not
leaving: someone who registered before the deadline may still withdraw after it, and an organizer
may still remove and still change capacity. This matches XS-W4-03, where `closes_at` gates
`join_registration` alone.

All three require the Session in `DRAFT` or `SCHEDULED`, as every W4-02 and W4-03 command does. A
Session that has started is outside Registration's authority: `REG-INV-024` requires post-start
roster changes to go through an explicit adjustment workflow rather than through mutation of a
historical Registration.

## Error codes

The convention this program has used since W3-06, applied here:

| Code | Meaning here |
|---|---|
| `23514` | null argument; Session not `DRAFT`/`SCHEDULED`; Window `LOCKED`; capacity not positive; capacity below the live confirmed count |
| `42501` | caller has no ACTIVE account link; caller is not an assigned organizer |
| `P0002` | Window not found; no effective entry for the resolved Player |
| `40001` | not raised by this slice — no command takes an `expected_revision` |

`23505` remains reserved for command-identity collisions and is not raised by domain rules here.

Removing or leaving an entry that is already `WITHDRAWN` or `REMOVED` raises `P0002`, not `23514`:
the command's target is an *effective* entry, and there is none. This makes the second of two
double-clicked commands indistinguishable from a command naming someone who was never registered,
which is correct — both are "nothing to act on" — and is why the receipt covers the retry case that
actually matters.

## Access model

`registration_entries` keeps zero grants to `public`, `anon` and `authenticated`, RLS enabled and no
policies. The three commands are the only way to write it, and none of them returns a
`queue_sequence`, a count, a player id, or any other row's contents.

`leave_registration` and `remove_registration_entry` return `entry_status` — which is always
`'WITHDRAWN'` or `'REMOVED'`, the status of the caller's own affected entry — and the new
`window_revision`. Neither reveals whether a promotion occurred or who was promoted. That is
deliberate: telling a departing member that someone was promoted leaks the existence and timing of
another member's queue state, which `REG-INV-029` and §10 N5.05.09.03 both restrict.

`change_registration_capacity` returns the new `window_capacity` and `window_revision`. Capacity is
already readable from `registration_windows`, so this discloses nothing new; it also does not report
how many people were promoted.

## Verification

Each item is a `.dbtest.ts` case in `src/test/db/registrationLeave.dbtest.ts`, run against a real
PostgreSQL instance (`QA-INV-003`, `QA-INV-004`).

**Leave**

1. a `WAITLISTED` member leaving becomes `WITHDRAWN`, promotes nobody, and bumps the revision once;
2. a `CONFIRMED` member leaving becomes `WITHDRAWN` and the first `WAITLISTED` becomes `CONFIRMED`
   in the same transaction, with its `queue_sequence` preserved and the revision bumped exactly
   once;
3. a member with no effective entry raises `P0002`; leaving twice raises `P0002` the second time;
4. a caller with no ACTIVE account link raises `42501`, and an anonymous caller raises `42501`;
5. leaving works while the Window is `CLOSED`, and raises `23514` while it is `LOCKED`;
6. leaving raises `23514` when the Session is `IN_PROGRESS`, `COMPLETED` or `CANCELLED`;
7. a retry with the same `command_id` returns the recorded result and does not withdraw a second
   entry or bump the revision again;
8. a member who left the Community can still withdraw their own entry — the documented asymmetry,
   pinned so that changing it is a deliberate act.

**Remove**

9. an organizer removing a `CONFIRMED` entry sets `REMOVED`, `removed_at`, the supplied
   `removal_reason`, and promotes the head of the queue;
10. an organizer removing a `WAITLISTED` entry promotes nobody;
11. a null `p_reason` is accepted; a blank-string reason is rejected by the existing check
    constraint;
12. a member who is not the assigned organizer raises `42501`, and so does an organizer of a
    different Community (`QA-INV-006`);
13. removing a Player with no effective entry raises `P0002`.

**Promotion**

14. the first waiter is ineligible (membership revoked) — they become `REMOVED` with
    `removal_reason = 'INELIGIBLE_AT_PROMOTION'`, the second eligible waiter is promoted, and both
    facts are visible in one transaction's result;
15. an `ORGANIZER_ADDED` waiter holding no account link at all **is** promoted — the asymmetry that
    a uniform rule would break;
16. a `SELF_JOIN` waiter whose account link was revoked is skipped and removed;
17. a waiter whose `players` row was soft-deleted is skipped and removed, and so is one whose
    `community_players` relation went inactive;
18. when every waiter is ineligible, all are removed, the seat stays free, and the command still
    succeeds with one revision bump.

**Capacity**

19. an increase from 12 to 15 with eight waiting promotes exactly the first three by
    `queue_sequence`, leaves five `WAITLISTED`, and bumps the revision once;
20. a reduction below the live confirmed count raises `23514` and changes nothing — no entry is
    demoted, no revision bump;
21. a reduction to exactly the confirmed count succeeds;
22. setting the capacity to its current value is a no-op: no revision bump, no promotion;
23. a capacity of zero or a negative capacity raises `23514`;
24. a retry with the same `command_id` returns the recorded result and does not promote a second
    time.

**Access**

25. `authenticated` holds no `select`, `insert`, `update` or `delete` on `registration_entries`, and
    `app_private.promote_waitlist_to_capacity` is not executable by `public`, `anon` or
    `authenticated`;
26. the returned column set is exactly `entry_status, window_revision` for Leave and Remove, and
    exactly `window_capacity, window_revision` for capacity — asserted on the sorted key list, so
    widening the shape fails the test.

## Exit gate

**A Leave concurrent with a Join must never let the joiner take the freed seat ahead of an eligible
waiter** (`REG-INV-015`).

The test uses the barrier-connection harness proven in XS-W4-01 and reused in XS-W4-03: a third
pooled connection takes the Window row lock and is awaited before either racer is dispatched, is
committed before `Promise.all`, and each racer commits inside its own promise chain. Setup is a full
Window with one `WAITLISTED` waiter; the racers are the `CONFIRMED` member leaving and a fresh
member joining.

Whichever order the two land in, the postcondition is the same and is asserted directly rather than
inferred from timing:

- the waiter is `CONFIRMED`;
- the fresh joiner is `WAITLISTED`, never `CONFIRMED`;
- the confirmed count equals capacity;
- the departing member is `WITHDRAWN`.

A second case covers the same race against `change_registration_capacity`: an increase of one seat
concurrent with a join must give the seat to the waiter, not the joiner.

The gate is structural, not probabilistic. Both commands take the Session row and then the Window
row `FOR UPDATE`, so the second racer cannot evaluate its capacity check until the first has
committed. If that ordering were broken, the assertions fail deterministically rather than
intermittently.
