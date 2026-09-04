# XS-W4-06 Legacy Session Registration Introduction Design

## Context

XS-W4-06 is the last slice of wave W4. W4-01 introduced `registration_windows` and
`registration_entries` with the server-side slot allocator; W4-02 implemented the Window lifecycle;
W4-03 implemented Join/Add; W4-04 implemented Leave, removal, promotion and capacity change; W4-05
implemented `finalize_session_roster`. Every one of those commands assumes a Registration Window
that was created empty and filled through the target path.

A Community Session that already existed before the target model has no such Window. W3-07 gives it
a target Session root and one immutable `roster_revisions` row with
`source_kind = 'LEGACY_SELECTED_ROSTER'`, resolved from `sessions.selected_player_ids`. What is
missing is the explicit, audited transition that lets such a Session opt into target Registration
without inventing queue history it never had.

Architecture sources:

- `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, XS-W4-06;
- `docs/architecture/contexts/N2.05-registration.md`, section 33 (Migration Plan Anchor),
  section 34 (Current to Target Mapping) and REG-INV-033..035;
- `docs/architecture/adr/ADR-CATALOG.md`, ADR-MIG-002 (migration cuts cohorts and persists
  authority state), ADR-MIG-004 (ambiguous source data is never guessed silently) and ADR-MIG-006
  (legacy artifacts never receive invented target semantics);
- `docs/architecture/catalogs/OPEN-DECISIONS.md`, OPEN-REG-003 and OPEN-REG-006;
- `HANDOFF.md`, the W4-01..05 warnings carried into W4-06.

## Goals

- Add one public semantic command, `introduce_registration_from_legacy_roster`, for an assigned
  Session Organizer of an upcoming target Community Session.
- Derive the starting confirmed set from exactly one immutable source: the Session's
  `LEGACY_SELECTED_ROSTER` roster revision.
- Persist durable provenance for the introduction: source revision, fingerprint, capacity, initial
  Window status, initial Window revision and the explicit statement that legacy queue chronology is
  unknown.
- Leave the target FIFO queue untouched, so the first genuine target join takes queue sequence 1.
- Add one read-only command, `inspect_registration_introduction`, that reports blockers without
  writing.
- Preserve the established Session-before-Window lock order, the one-revision-per-command rule and
  the private Registration read boundary.

## Non-goals

- No UI, TypeScript gateway, hook or application use case.
- No Registration Realtime or notification event.
- No reopen semantics; `OPEN-REG-006` stays open and no transition pair is added to the Window state
  machine.
- No change to the waitlist read surface; `OPEN-REG-003` stays open.
- No migration of `CommunityPresence`, WhatsApp slot drafts or any other communication artifact.
- No backfill job: one Session at a time, on explicit Organizer command.
- No reverse transition. A Session that has a Registration Window does not go back.
- No production deployment or cohort rollout.

## Decisions

### The source is the cutover roster revision, not `selected_player_ids`

The command reads `roster_revisions` with `source_kind = 'LEGACY_SELECTED_ROSTER'` and its
`roster_revision_entries`, never the legacy array. W3-07 already resolved that array through
`app_private.resolve_legacy_session_roster`, which refuses ambiguous tokens, repeated tokens,
colliding players and unresolvable tokens. Re-reading the array here would reopen the same
resolution with a second implementation and create two answers for one question. It would also
contradict REG-INV-035: after cutover, `selectedPlayerIds` is no longer authoritative.

A consequence worth stating: the introduction can only run on a Session that already went through
W3-07. A still-legacy Session cannot be introduced at all, and the next decision explains why it is
not even reported as its own blocker.

### Authorization precedes every blocker

Both functions authorize through `public.assert_target_session_write_authorized`, which requires a
valid target Session organizer assignment (W3-02) — the same rule `create_registration_window` and
every other W4 command already use.

That has a consequence worth naming rather than discovering: organizer assignments exist only for
target Sessions, and `transition_legacy_session_to_target` creates one for the acting user. A
still-legacy Session therefore has no assignment, so it answers `42501`, indistinguishable from an
unauthorized caller. This slice does not add a second authorization branch to tell those two apart.
Refusing to distinguish is the conservative behavior, and the question "can this legacy Session be
cut over?" already has an owner: `public.inspect_legacy_session_cutover` from W3-07.

It follows that an Organizer holding no assignment on a Session cut over by a colleague also gets
`42501`. That is the target assignment model working as designed, inherited from W3-02, not a rule
this slice invents.

### The Window is born `DRAFT`

The introduction writes `status = 'DRAFT'` and nothing else. Opening for new registrations stays
`open_registration`.

The alternative, writing `OPEN` directly, would give the same state two producers and would expose a
migrated roster before the Organizer had any chance to inspect it. Keeping `DRAFT` also means the
strictly sequential `DRAFT -> OPEN -> CLOSED -> LOCKED` table gains no new pair, which matters
because the transition table is indexed by `(from, to)` alone: any pair added there is available to
every command that consults it.

### Migrated entries hold no queue position

Each migrated entry is inserted `CONFIRMED` with `queue_sequence = null` and `source = 'MIGRATION'`,
and `next_queue_sequence` stays at 1.

The W4-01 schema already allows this: only `WAITLISTED` requires a sequence, and a confirmed walk-in
never consumed one. The slice record for XS-W4-06 states that legacy queue chronology is `UNKNOWN`
unless proven, and forbids treating `CommunityPresence`, WhatsApp reserve lists,
`selectedPlayerIds[]` ordering or `updated_at` as historical FIFO evidence. Ordinal position inside
the legacy array is arrival order only by coincidence; using it would silently decide who gets
promoted first on the first withdrawal.

`joined_at` records the transition instant, which is the moment target authority began for these
entries, rather than a legacy timestamp that the same rule forbids. Because the command does not go
through `app_private.allocate_registration_slot`, the missing `p_joined_at` parameter noted in
HANDOFF never becomes a problem, and the allocator signature stays unchanged.

### Capacity is explicit and never shrinks the roster

`p_capacity` is required. The command refuses when it is smaller than the migrated confirmed count,
and never demotes anyone into the waitlist to make the number fit.

The legacy `sessions` table has no capacity column; only untyped `config jsonb`. Deriving capacity
from the roster size would turn a product fact into an accident of who happened to be on a legacy
list. Refusing a too-small capacity mirrors REG-INV-017, where reducing capacity below the confirmed
count is refused rather than resolved by picking victims.

### One ineligible member refuses the whole introduction

Every migrated player is revalidated before anything is written: the `players` row must be alive and
active, and the Community roster standing in `community_players` must be alive and active. The first
failure refuses the command and nothing is written.

This mirrors W4-05, where a single ineligible `CONFIRMED` entry rejects the entire finalization, and
the blocker style of W3-07. The alternative, silently importing the eligible subset and recording
the rest as `REMOVED`, would shrink a roster the Organizer already agreed with, in a transition that
cannot be undone. Under ADR-MIG-004, ambiguity becomes a migration anomaly to resolve, not an
invented confirmed registration.

Revalidation deliberately does not require a Community membership or an `ACTIVE` player account
link. That asymmetry is inherited, not invented: W4-04 revalidates by entry `source`, and only
`SELF_JOIN` demands the account-bearing conditions. A player without any account is exactly the case
W4-03's Organizer-add path exists to serve, and legacy rosters are full of them.

### No optimistic fingerprint token

The command takes no `p_expected_source_fingerprint`. Between an inspection and the transition the
source cannot change: `roster_revisions` and `roster_revision_entries` are immutable by trigger
(`55000`), and `session_participants.participation_status` only moves when a new roster revision is
materialized, which on this Session only `finalize_session_roster` does, and that command requires a
`LOCKED` Window that does not exist yet.

A token that can never legitimately go stale is a branch no test can exercise honestly and a
guarantee that reads stronger than it is. The fingerprint is still computed, server-side, and stored
in the ledger as provenance.

One condition in that proof is reachable and is checked instead: the `LEGACY_SELECTED_ROSTER`
revision must be the Session's latest revision. If a newer revision exists, something else already
wrote roster authority and migrating the older snapshot would be silently wrong
(`LEGACY_ROSTER_SUPERSEDED`).

### Provenance lives in its own immutable ledger

`app_private.registration_introductions` records the introduction, mirroring
`app_private.session_authority_cutovers` from W3-07.

`command_receipts` cannot carry this record: its retention is an open decision (`OPEN-API-002`), and
an irreversible authority transfer must not depend on a table that may be pruned. Columns on
`registration_windows` were rejected too: they would be null for every natively created Window and
would make the aggregate root a partial ledger.

The status, revision and chronology columns are pinned by single-value `check` constraints. They
record what this slice decided, not merely the value it happens to write. A later slice that wants a
Window introduced already open, or a chronology that was actually proven, has to widen the
constraint deliberately. That is the "do not invent a permanent default in code" rule made visible
in the schema.

## Public contract

```sql
public.inspect_registration_introduction(p_session_id uuid)
returns table (
  introducible boolean,
  source_fingerprint text,
  confirmed_count integer,
  blockers text[],
  entries jsonb
)

public.introduce_registration_from_legacy_roster(
  p_command_id uuid,
  p_window_id uuid,
  p_session_id uuid,
  p_capacity integer,
  p_closes_at timestamptz
)
returns table (
  window_id uuid,
  window_revision integer,
  confirmed_count integer
)
```

Both are `SECURITY DEFINER`, both authorize through `public.assert_target_session_write_authorized`,
and both are granted to `authenticated` only. The inspection is not more permissive than the write:
otherwise it becomes a roster read surface for callers who cannot write, which is precisely the kind
of accidental disclosure `OPEN-REG-003` is being kept open to decide.

The transition returns no `queue_sequence`, no player identity and no waitlist information,
following the return discipline of W4-03 and W4-04.

The inspection's `entries` is the resolved source set in `entry_order`: `player_id`,
`display_name_at_time` and an `eligible` boolean per row. It carries no queue field, because there
is no queue to report. Naming the ineligible people is the point of the command — that is what makes
an all-or-nothing refusal actionable — and it is safe precisely because the caller already passed
the write authorization.

Blocker vocabulary, shared by both functions:

```text
SESSION_NOT_COMMUNITY
SESSION_NOT_UPCOMING
REGISTRATION_WINDOW_EXISTS
LEGACY_ROSTER_MISSING
LEGACY_ROSTER_EMPTY
LEGACY_ROSTER_SUPERSEDED
ROSTER_ENTRY_NOT_PLAYER
PLAYER_NOT_ELIGIBLE
```

`ROSTER_ENTRY_NOT_PLAYER` is unreachable today, because W3-07 resolves only `PLAYER` identities. It
is named anyway: a `GUEST` entry has no `player_id` and cannot become a Registration entry, and
refusing by name is better than a raw `not null` violation if a later slice teaches the cutover to
carry guests.

The inspection lists every blocker it finds. The transition raises on the first one, and its message
never enumerates people; the Organizer runs the inspection to see who.

## Transaction flow

1. Validate arguments; missing ones raise `23514`.
2. `app_private.find_command_receipt(p_command_id, 'introduce_registration_from_legacy_roster',
   p_window_id)`, before any row lock. The result is discarded here. The call is load-bearing: it
   raises `23505` when the command id already belongs to another aggregate or command type, and that
   collision must surface before a lock is taken.
3. `select ... from public.sessions where id = p_session_id for update`. Session before Window, the
   global lock order that nine commands now share. An absent row raises `P0002`.
4. `public.assert_target_session_write_authorized(v_session)`; unauthorized raises `42501`.
5. Replay the receipt, after authorization. A caller whose capability was revoked cannot read back
   an earlier result.
6. Validate `authority_model = 'target'`, `session_context = 'COMMUNITY'` and
   `lifecycle_status in ('DRAFT', 'SCHEDULED')`. Validate that no Window exists for the Session and
   that `p_window_id` is free. Each raises `23514`; `23505` stays reserved for command id
   collisions. The `authority_model` assertion is defense in depth, not the Organizer-facing path:
   step 4 already excluded every legacy Session, and the W3-07 trigger forbids a target Session from
   returning to legacy.
7. Resolve the `LEGACY_SELECTED_ROSTER` revision and its entries: missing, empty, superseded or
   non-player entries raise `23514` naming the blocker.
8. Revalidate every player through `app_private.registration_player_standing_alive`; the first
   failure raises `23514`.
9. Validate `p_capacity >= confirmed_count`; otherwise `23514`. `p_closes_at` is not validated,
   exactly as in `create_registration_window`: this slice does not invent a rule the owning slice
   does not have.
10. Insert the Window (`DRAFT`, `revision = 1`, `next_queue_sequence = 1`), then the entries
    (`CONFIRMED`, `queue_sequence null`, `source = 'MIGRATION'`), then the ledger row. One revision
    for the whole command, never one per person, which is why the allocator is not reused.
11. `app_private.record_command_receipt(..., 'REGISTRATION_INTRODUCTION')`.

Everything happens in the single implicit transaction of the function call, so a refusal at any step
leaves no Window, no entries and no ledger row.

## Data model

```sql
create table app_private.registration_introductions (
  registration_window_id uuid primary key
    references public.registration_windows(id) on delete restrict,
  session_id uuid not null unique references public.sessions(id) on delete restrict,
  source_kind text not null check (source_kind = 'LEGACY_SELECTED_ROSTER'),
  source_roster_revision_id uuid not null
    references public.roster_revisions(id) on delete restrict,
  source_fingerprint text not null,
  confirmed_count integer not null check (confirmed_count > 0),
  capacity_at_introduction integer not null check (capacity_at_introduction > 0),
  initial_window_status text not null check (initial_window_status = 'DRAFT'),
  initial_window_revision integer not null check (initial_window_revision = 1),
  queue_chronology text not null check (queue_chronology = 'UNKNOWN'),
  command_id uuid not null unique,
  introduced_by_user_id uuid references auth.users(id) on delete set null,
  introduced_at timestamptz not null default pg_catalog.now(),
  check (capacity_at_introduction >= confirmed_count)
);
```

No grants: the table lives in `app_private` and is written only by the command.

An immutability trigger rejects `UPDATE` and `DELETE` with `55000`, carrying the same narrow
carve-out as `session_authority_cutovers`: when an `auth.users` row is deleted, the
`on delete set null` arrives as an `UPDATE` at trigger depth greater than one, changing only
`introduced_by_user_id`. Without that exception, deleting a user would fail.

The fingerprint is `md5` over a canonical `jsonb` of the source revision id, its revision number and
its entries ordered by `entry_order`, following
`app_private.legacy_session_cutover_fingerprint` from W3-07.

## Shared eligibility predicate

W4-04 owns `app_private.registration_entry_still_eligible(p_entry_id)`, which answers the question
from an existing entry. The introduction must answer it before any entry exists.

Rather than write a second copy of "standing alive", this slice extracts
`app_private.registration_player_standing_alive(p_community_id uuid, p_player_id uuid)` — the
`community_players` and `players` liveness conditions — and redefines
`registration_entry_still_eligible` to delegate to it, keeping its `source`-aware account-link
branch unchanged. Two independent definitions of the same rule would drift, and the next fix would
land on only one of them.

The W4-04 and W4-05 database suites are the regression net for this refactor and must pass unchanged.

## Security model

- Both functions are `SECURITY DEFINER` with `set search_path = ''` and fully qualified references.
- `revoke all ... from public, anon`, `grant execute ... to authenticated`, matching the W4-02..05
  commands.
- `registration_entries` keeps no browser grant. The migrated set is read and written only inside
  the command, which is where W4-05 already established the boundary lives.
- `registration_introductions` has no grant at all, and `app_private` usage stays revoked.
- The introduction does not widen `registration_windows` reads. The known aggregate leak through
  `next_queue_sequence` documented in W4-03 is neither worsened nor fixed here; it belongs to the
  slice that closes `OPEN-REG-003`.
- Authorization derives the Community through the Session row that was locked, never from a payload
  argument (REG-INV-037).

## Errors and atomicity

| Condition                                                    | Code    |
| ------------------------------------------------------------ | ------- |
| Missing or malformed argument                                 | `23514` |
| Command id already used by another aggregate or command type  | `23505` |
| Session row absent                                            | `P0002` |
| Caller holds no valid Session organizer assignment            | `42501` |
| Session is still legacy (no assignment can exist)             | `42501` |
| Any blocker in the vocabulary above                           | `23514` |
| Capacity below the migrated confirmed count                   | `23514` |

There is no `40001` in this command: it takes no expected-revision or fingerprint token, because it
creates the aggregate it writes.

## Interaction with the rest of wave W4

After the introduction the Window is an ordinary `DRAFT` Window. `open_registration` opens it,
`join_registration` and `add_registration_entry` fill it, `leave_registration` and
`remove_registration_entry` empty it, `change_registration_capacity` resizes it and
`finalize_session_roster` materializes the roster. None of them needs to know the entries came from
a migration, with one exception that is already correct: the W4-04 promoter revalidates by `source`,
and `MIGRATION` takes the non-`SELF_JOIN` branch.

The invariant W4-04 named — after every mutating command either `confirmed = capacity` or no
`WAITLISTED` entry exists — holds at introduction time, because the command refuses when
`capacity < confirmed_count` and creates no waitlisted entry.

## Test strategy

A new database suite, `src/test/db/registrationIntroduction.dbtest.ts`, following the W4-05 shape.
The slice is entirely SQL, so it adds no unit or UI test.

- Happy path and ledger exactness: `DRAFT`, `revision = 1`, N `CONFIRMED` entries with
  `source = 'MIGRATION'` and null `queue_sequence`, and a ledger row whose every column matches.
- One revision regardless of size: five migrated members still leave `revision = 1` and
  `next_queue_sequence = 1`.
- Queue exit gate: with `capacity = confirmed_count`, open the Window and join through the target
  path; the joiner is `WAITLISTED` with `queue_sequence = 1`, proving migrated entries consumed no
  position.
- Promotion across the boundary: a migrated member leaves and the waitlisted joiner is promoted, in
  one revision bump.
- All-or-nothing and atomicity: a soft-deleted player refuses the command, and no Window, no entry
  and no ledger row exists afterwards.
- Source asymmetry: a migrated player with no account link at all stays eligible and promotable.
- Every blocker in the vocabulary, through both the inspection and the transition.
- Idempotency: the same `command_id` replays the receipt; a different `command_id` on the same
  Session is refused with `REGISTRATION_WINDOW_EXISTS`; two concurrent introductions leave one
  winner and no partial state.
- Symmetric authorization: a caller without a Session organizer assignment gets `42501` from both
  functions, and so does any caller pointing at a still-legacy Session — the inspection never
  becomes a way to read a roster the caller cannot write.
- Immutability: `UPDATE` and `DELETE` on the ledger raise `55000`, and deleting the acting user
  succeeds while nulling only `introduced_by_user_id`.
- Inherited exit gate: an `authenticated` `update` of `selected_player_ids` on a target Session
  affects zero rows, `registration_introductions` has no grant, and both new functions are revoked
  from `public` and `anon`.

## Migration shape

One migration file, `supabase/migrations/<timestamp>_legacy_registration_introduction.sql`:

1. `app_private.registration_introductions` with constraints and indexes;
2. the immutability trigger and its function;
3. `app_private.registration_player_standing_alive`;
4. `create or replace` of `app_private.registration_entry_still_eligible`, delegating to it;
5. `app_private.legacy_registration_source_fingerprint`;
6. `public.inspect_registration_introduction`;
7. `public.introduce_registration_from_legacy_roster`;
8. grants and revokes.

No data is backfilled. Existing Sessions gain the ability to transition, not the transition itself.

## Deployment and rollback

The migration is additive: one new private table, one new private predicate, one redefined private
predicate and two new functions. No existing table, policy or grant changes.

Rollback before any Session has transitioned is dropping the objects and restoring the previous
`registration_entry_still_eligible` body. After a Session has transitioned there is no rollback: the
Window is that Session's Registration authority, and returning it to legacy is the explicit reverse
migration that C6 section 5.1 keeps out of the default path.

## Exit gate

- An upcoming legacy-sourced Session gains target Registration only through
  `introduce_registration_from_legacy_roster`.
- Every Join and Leave after the transition uses the target queue sequence, and the first genuine
  waitlisted entry holds sequence 1.
- No legacy sync path mutates the target Window: `registration_windows` and `registration_entries`
  take no browser write grant, and RLS already filters browser updates of any target Session row.
- The introduction's source, capacity, initial status, initial revision and unknown queue chronology
  are recorded immutably.
