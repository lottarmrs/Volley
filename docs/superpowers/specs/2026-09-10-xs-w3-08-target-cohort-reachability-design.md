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

## The client

The conversion action lives on the Session screen. It inspects first, renders the blocker list in
pt-BR when the Session is not eligible, states plainly that the change cannot be undone, and then
runs the command that already exists through the existing `CommandPort`. No new command layer.

**Only COMMUNITY conversion is offered.** The command accepts `QUICK`, but converting a Quick
Session leads nowhere: the whole chain downstream depends on a Community with an activated
evaluation model.

The sync gains cohort awareness in two places: it skips the root of a known-converted Session when
uploading, and after the legacy bulk download it reads each converted Session by id and merges the
result into the local model.

Knowing which Sessions are converted requires a marker the local model does not have today: there is
no `authorityModel` anywhere in `src/shared/types/session.ts`. This slice adds one, persisted
locally and set when the transition succeeds. It cannot be recovered from the download, because the
download is filtered to `legacy` — which is the whole problem.

### The cost of reading by id, stated rather than buried

That marker is the only record of a converted Session's existence on the client. **On a new device,
or after cleared storage, a converted Session never reappears**: the bulk download excludes it, and
without the marker nothing knows to ask for it by id.

This is the price of choosing per-id reads over a listing RPC, and it is real: cloud sync stops
being a full backup for exactly the Sessions this programme is migrating toward. Two things bound
the damage today — only draft Sessions with no teams or games can convert, so nothing played is at
risk, and the Session still exists server-side, recoverable the moment a listing surface exists.

A `list_target_sessions` RPC closes it. It is a non-goal here by decision, not by oversight, and it
should be the first thing reconsidered if anyone converts a Session they would mind losing sight of.

## Non-goals

No XS-W7: match execution, teams and games stay on the legacy path for converted Sessions too. No
listing RPC. No un-conversion, which does not exist in the database. No capture or publication
wiring — that is XS-W6-03, and this slice only opens the road. No change to what a non-converted
Session does, anywhere.

## Verification

Database: the read returns the current revision id, returns `null` for a Session with no revision,
and agrees with `capture_balance_input_snapshot`'s definition on a Session with several revisions —
that agreement is asserted directly, not assumed. Existing authorization behavior is unchanged,
proven by the pre-existing tests staying green without edits.

Client: the sync uploads no root for a converted Session; it reads converted Sessions by id and
merges them; an ineligible Session renders its blockers translated; the irreversibility copy is
present before the action.

The regression that matters most: a non-converted Session behaves byte-for-byte as it does today.
