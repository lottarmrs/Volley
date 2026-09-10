# W6-03 — CandidateSet publication

Publish an immutable set of team candidates as a server-authorized artifact, validated against the
snapshot the formation was built from, and wire the W6-01 capture into the formation flow so that
artifact has a real source.

## What the investigation found

**Nothing in production calls the W6-01 capture, and nothing calls the W6-02 authorized adapter.**
Verified: zero callers outside tests. Meanwhile `confirmDivision` (`src/hooks/useSessionWizard.ts`)
is entirely local — it builds teams and games on the client, writes to `localStorage`, and the
generic sync uploads them afterwards. There is no server authority anywhere in team formation today.

So the artifact this slice publishes would reference a snapshot nothing creates. Two slices of
infrastructure have been waiting for a consumer, and it is this one.

The exit gate is a security gate — "a forged candidate that violates a hard constraint cannot be
published" — so the server must revalidate. Verifying that an assignment respects locks and pairs is
cheap; recomputing the objective score would mean porting the simulated-annealing evaluator to SQL,
which is another order of magnitude.

The W6-02 fingerprint is computed on the client and is unkeyed. The W6-02 branch review flagged that
it offers no integrity the moment it is accepted as a receipt — and publishing is exactly that.

## Decisions

1. **This slice wires the capture into the flow.** Eligible Sessions capture a W6-01 snapshot and
   feed the formation port through the authorized adapter. This performs, for COMMUNITY Sessions,
   the source cutover that XS-W5-05 was to conduct; W5-05's remaining scope shrinks accordingly and
   the execution doc must say so.
2. **The server validates participation and hard constraints; it does not recompute the score.**
   Client score and diagnostics are stored in a field named for what they are — an unverified claim.
   A tampered client can make a bad option look good in a comparison; it cannot publish one that
   violates a constraint.
3. **Publication is an explicit organizer action.** Generation stays free and local; publishing is a
   decision. This matches "published set is immutable" and avoids writing artifacts nobody asked for.

## The artifact

Two private tables, in the shape XS-W6-01 established:

```text
app_private.team_candidate_sets
  id                  uuid PK (= command_id)
  session_id          uuid NOT NULL → sessions, restrict
  roster_revision_id  uuid NOT NULL, composite FK (roster_revision_id, session_id)
  snapshot_id         uuid NOT NULL → balance_input_snapshots, restrict
  created_by          uuid NULL → auth.users, set null
  published_at        timestamptz NOT NULL
  contract_version, algorithm_version, objective_policy_version,
  rubric_version, resolver_version                        text NOT NULL
  set_fingerprint     text NOT NULL   -- computed by the server
  client_claimed      jsonb NOT NULL  -- labeled, unverified

app_private.team_candidate_solutions
  set_id                 uuid NOT NULL → team_candidate_sets, restrict
  candidate_index        integer NOT NULL
  candidate_fingerprint  text NOT NULL   -- computed by the server
  assignment             jsonb NOT NULL  -- teams × participant_id
  client_claimed         jsonb NOT NULL  -- score, diagnostics, seed, iterations
  PK (set_id, candidate_index)
```

RLS enabled, no browser grants, FK leading columns indexed, and a trigger rejecting UPDATE and
DELETE with 55000 — with the same single exception W6-01 carries, `created_by → null` for account
erasure with every other column identical.

**No persisted `status`, deliberately, against the C6 pack's field list.** "The published set is
immutable" and "the set has a mutable status" contradict each other, and this repository already
settled that tension once: W3 derives readiness rather than persisting it, precisely so two places
cannot disagree. The current set is derived — the newest set for the Session whose roster revision
is still current. When XS-W6-04 records a choice and XS-W6-07 a confirmation, they create their own
artifact rather than mutating this one.

**The fingerprint is computed server-side**, over the canonical assignment the server stored, not
over what the client claimed. The client's own fingerprint may be kept beside it inside
`client_claimed`, but it never identifies the set.

The two `client_claimed` columns hold different things and the distinction matters: on the set it is
the client's own set fingerprint plus the budget and seed it says it used; on each solution it is
that candidate's score, diagnostics, seed and iteration count. Neither is read by anything that
decides.

Publishing twice for the same roster revision produces two sets, both retained. The newest is the
current one; the older is history, not garbage.

## The publish command

`publish_team_candidate_set(p_command_id, p_session_id, p_snapshot_id, p_candidates jsonb)` and
`read_team_candidate_set(p_set_id)`. Both `security definer` with an empty `search_path`, granted to
`authenticated` only, requiring the assigned Organizer — governance rank does not grant formation
authority. Receipt type `publish_team_candidate_set`, aggregate the Session, retention class
`TEAM_CANDIDATE_SET`. Set id equals command id. Authorization is checked before the receipt is
consulted, so a replay cannot be used as a read oracle.

Validation, in the order it fails:

1. Target COMMUNITY Session in `DRAFT` or `SCHEDULED`, Organizer authorized. The Session row is
   locked first, as every command in this chain does.
2. The snapshot belongs to that Session **and** to the Session's current roster revision. A snapshot
   from another Session, or from a superseded revision, is refused.
3. The set carries between one and eight candidates, and each declares the same team count. The
   bound is not decoration: `p_candidates` is caller-supplied JSON reaching a `security definer`
   function, and validating an unbounded array is work an authenticated caller could ask for at
   will. Today's engine returns at most three (`selectPortfolio` caps the portfolio), so eight is
   already generous.
4. Every candidate is an **exact partition** of the snapshot's participants: each participant on
   exactly one team, none missing, none invented. This is the rule that closes the exit gate.
5. Declared hard constraints hold for participants that are present: a locked participant sits on
   the declared team, a `pairsTogether` pair shares a team, a `pairsSeparated` pair does not.
   Orphan references are tolerated exactly as the engine tolerates them — XS-W6-02 learned this the
   expensive way, and refusing here what the solver happily produces would repeat that regression.
6. Only then does it write, computing each candidate's fingerprint and the set's own.

"Current roster revision" means the highest `revision_number` for the Session, the same definition
`capture_balance_input_snapshot` already uses. The two commands must not drift on this; a snapshot
accepted by one and rejected by the other would be a contradiction the organizer cannot act on.

Team-size validation is deliberately absent: it is policy, and still open.

## Capture in the flow

Eligible means: target COMMUNITY Session, evaluation model activated for the Community, assigned
Organizer, and a current roster revision. Those Sessions capture a snapshot before generating and
feed the port through `fromAuthorizedSnapshot`.

The client cannot read activation directly — `app_private.community_evaluation_cutovers` has no
browser grant. It asks `community_evaluation_target_ids`, the public batch RPC the W5 editor slice
added for exactly this question, and which the Player editor already uses to decide whether the
legacy evaluation form still applies.

**Their numbers change.** Attribute vectors come from the versioned source — the global profile
under W6-01's missing-data policy — instead of the legacy `atributos`. Teams will differ. That is
the cutover, and it is the slice's user-visible value.

Quick Sessions, legacy Sessions and non-activated Communities keep today's numbers exactly. That is
not a fallback; they were never eligible.

**Falling back is silent for an ineligible Session and loud for an eligible one whose capture
fails.** An eligible Session that cannot capture — network, permission, revoked capability — must
not quietly generate teams from the old numbers. Switching between two numeric sources without
saying so is precisely what destroys trust in a draw. The organizer sees the error and decides.

The publish action is a button in the results step. It is the first interface these slices touch and
it stays minimal: no new route, no new area.

## Non-goals

Confirmation is not integrated: `confirmDivision` stays local, building teams and games on the
client. **The published set therefore has no consumer in this slice** — XS-W6-04 is the consumer.
This is stated rather than discovered: the slice's user-visible value is the source cutover, and the
publication is infrastructure for the next slice.

Also out: voting, the organizer-choice record, the confirmation cutover, Quick Session migration,
any team-size rule, and any change to what ineligible Sessions produce.

## Verification

DB tests against a real disposable PostgreSQL, serially: explicit Organizer versus
governance/evaluator/outsider/anon; snapshot from another Session and from a superseded revision;
a candidate missing a participant, one with an invented participant, and one placing a participant
on two teams; each hard-constraint violation and each orphan-reference tolerance; replay of the same
command id; a different command id over identical input producing an equal set fingerprint;
immutability of both tables under privileged DML, and the permitted `created_by → null`; a failed
command writing neither set, solutions, nor receipt.

Client tests cover the eligibility decision, the loud failure for an eligible Session, and that an
ineligible Session's request is byte-identical to today's.

The gate to demonstrate, not assert: a forged candidate violating a hard constraint is refused by
the database, exercised through the authenticated RPC rather than as owner.
