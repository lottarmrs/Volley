# XS-W3-08 — Target Session cohort reachability

Make a transitioned Session a first-class citizen in the client, so the target cohort stops being
unreachable infrastructure. Inserted into the C6 sequence, which assumed reachability it never had.

## Why this slice exists

The C6 pack runs W3 → W4 → W5 → W6 on the assumption that target Sessions exist. They do not.

- `src/infra/supabase/operationalCloudService.ts:101` writes `authority_model: 'legacy'` on every
  Session the client creates, and `:72` filters every Session read to `legacy`. Nothing in
  production creates a target Session.
- `transition_legacy_session_to_target` exists in the database, and its client use case exists in
  `src/application/sessionCohortCutover.ts` — imported by nothing but DB tests.
- The client has no notion of roster revisions: zero references in `src/` outside the W6-01 types.
  `read_target_roster_revision` requires the id you are trying to discover, so
  `capture_balance_input_snapshot` is not callable from the client at all.

The consequence is a chain of four slices with no path to a user: the cohort cutover (XS-W3-07), the
balance input snapshot (XS-W6-01), the authorized adapter (XS-W6-02), and the candidate publication
being designed as XS-W6-03. This slice is the smallest change that turns them into reachable
software.

A second consequence, already recorded as debt in HANDOFF: a transitioned Session disappears from
the client's download and fails the generic upload on every sync, forever.

## Decisions

1. **Only pre-start Sessions convert, and the server already enforces it.**
   `inspect_legacy_session_cutover` blocks on `NOT_DRAFT`, `HAS_TEAM_EVIDENCE` and
   `HAS_GAME_EVIDENCE` among others. The client respects that list; it does not reimplement it.
2. **The sync learns about cohorts.** Legacy Sessions keep downloading in bulk. Converted ones are
   read by id through `read_target_session` and merged. Their root stops being uploaded, closing the
   indefinite-failure debt.
3. **`read_target_session` also returns the current roster revision**, rather than a new RPC. The
   client reads a converted Session during sync anyway; the revision rides along, and no new
   authorization surface is introduced.

## What converting actually costs

A converted Session has a server-authoritative root and legacy children: `scopeOperationalFetch`
special-cases only `sessions`, so teams and games keep flowing through the generic sync unfiltered.
That is not elegant, and this slice does not pretend otherwise or pull XS-W7 forward.

In practice, converting a draft Session is safe: it keeps appearing, stays editable across
everything W3–W6 covers, and when the organizer starts the match, teams and games are created the
way they always were. What changes is where the root's authority lives.

**The conversion is irreversible** — there is no command back. The interface must say so before the
action, not after. That is product copy, not a technical footnote.

## The read

`read_target_session(p_session_id)` gains one column: the id of the Session's current roster
revision, or `null` when it has none.

"Current" means the highest `revision_number` for the Session — the same definition
`capture_balance_input_snapshot` uses. The two must not drift: a client that reads one revision and
a capture command that rejects it would leave the organizer with no action that works. Existing
authorization, the `security definer` header and the empty `search_path` are preserved exactly; this
is a fourth `create or replace` on a function that already has three, which is the established
pattern in this file's history.

## Direction change, 2026-09-10: the cutover is dead, native creation replaces it

This spec originally wired `transition_legacy_session_to_target` to a button. That was implemented,
reviewed, and **reverted** — it would have shipped a control that can never appear. Three walls,
each found below the previous one:

1. **No target Session exists.** `operationalCloudService` writes `authority_model: 'legacy'` and
   filters reads to `legacy`.
2. **No legacy Session can become one.** A Session enters `sessions` only via `confirmDivision`,
   which sets `status: 'teams_generated'` and creates teams — blocked by both `NOT_DRAFT` and
   `HAS_TEAM_EVIDENCE`. A wizard draft lives in `activeSession` alone, never uploads, has no
   `cloudId`, so `inspect_legacy_session_cutover` raises `P0002`. And `buildManualSessionDraft`, the
   only path producing a teamless draft, has no caller.
3. **Creating one natively needs a responsibility the app cannot grant.**
   `create_target_session` requires an `ORGANIZER` row in `community_responsibilities`. Those rows
   exist only from a one-time backfill in `20260827150000`, seeded from legacy
   `community_members.role = 'organizador'`. `set_community_member_role` never writes that table.
   So it works for grandfathered organizers and silently fails for anyone promoted since.

The slice now delivers two things instead of the conversion action.

### Granting ORGANIZER

A public RPC mirroring `set_community_evaluator`, which XS-W5 created as the exact precedent: same
`community.members.manage` guard, same shape, granting and revoking the `ORGANIZER` responsibility.

This is not optional. Without it, everything downstream works for the grandfathered set and decays
silently for everyone else — a failure that is invisible and gets blamed on the user.

### Creating the Session in the target model

The server row for a Session is created at **sync**, not at creation: `upsertSession` writes it with
`authority_model: 'legacy'`. So the cohort decision belongs there too.

When a Session belongs to a Community with the evaluation model activated and the user holds
`ORGANIZER`, its first upload calls `create_target_session` instead of the legacy upsert, and the
local marker is set **through React state** — never by writing `localStorage` directly. That direct
write is exactly the defect that killed the first attempt: `useSessions` rewrites both storage keys
wholesale from state on the next interaction, so a raw write is erased by the next click.

From then on Task 3 already skips re-uploading the root and Task 4 already reads it back by id.

**Why sync and not creation time:** the app is local-first. Calling an RPC when the organizer creates
a Session would break creating one offline, which is the premise of the whole product. At sync, the
network is already a precondition.

**What the organizer sees change:** in an activated Community, new Sessions start living in the new
model. That is what finally gives the chain a path — including the W6-01 capture that motivated all
of this.

## Non-goals

No XS-W7: match execution, teams and games stay on the legacy path for target Sessions too. No
listing RPC. No conversion of existing legacy Sessions — that path is dead and this slice does not
revive it. No capture or publication wiring: that is XS-W6-03, and this slice only opens the road.
No change to what a Session in a non-activated Community does, anywhere.

## Verification

Database: the read returns the current revision id, returns `null` for a Session with no revision,
and agrees with `capture_balance_input_snapshot`'s definition on a Session with several revisions —
that agreement is asserted directly, not assumed. Existing authorization behavior is unchanged,
proven by the pre-existing tests staying green without edits.

Client: a Session in an activated Community whose user holds `ORGANIZER` is created through
`create_target_session` on its first upload and carries the marker afterwards; the marker survives a
subsequent state-driven persist, which is the regression that killed the first attempt and must have
its own test; a Session in a non-activated Community still takes the legacy upsert byte-for-byte.

Database: granting and revoking `ORGANIZER` respects `community.members.manage`, refuses a
non-member, and makes `create_target_session` succeed where it previously raised 42501 — asserted
through the authenticated RPCs, not as owner.

The regression that matters most: a non-converted Session behaves byte-for-byte as it does today.
