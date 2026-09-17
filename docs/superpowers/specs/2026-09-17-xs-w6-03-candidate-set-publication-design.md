# XS-W6-03 — CandidateSet publication (revised after XS-W6-08c)

Supersedes [the 2026-09-10 design](2026-09-10-xs-w6-03-candidate-set-publication-design.md). The
artifact, the command and the verification it describes still hold; three things changed underneath
it, and two product decisions were made on 2026-09-17.

## What changed since 2026-09-10

1. **The capture is already in the flow.** XS-W6-08c made every synced Community Session create or
   adopt its target Session, finalize its roster through W4 Registration, capture a W6-01 snapshot
   and draw from it. The old "Capture in the flow" section, its eligibility rule and its loud
   failure are done, with a different eligibility than that design proposed (evaluation model
   mandatory, so every synced Community Session is eligible). This slice does not touch capture.
2. **Hard constraints are not server state.** Locks and pairs come from the Session config on the
   device, keyed by local Player ids; no table holds them. The server can therefore only check a
   candidate against the constraints the client declares. The set stores those declared constraints,
   so the record states what the candidates were checked against. What the server guarantees on its
   own is the exact partition of the snapshot's participants.
3. **Participant ids.** The Worker runs on a request re-keyed to local Player ids (XS-W6-08c). The
   client maps teams and constraints back to roster participant ids, through the roster revision it
   already reads, before publishing. A local id with no participant cannot be mapped: for a team
   member that is an error; for a constraint it is an orphan and is dropped, as the engine ignores it.

## Product decisions (2026-09-17)

- **Publication is an explicit "Publicar" button** in the results step, only for a draw that came
  from the authorized snapshot. Generating stays as it is; publishing is a decision.
- **A failed publication blocks and explains.** The set is not shown as published, the error is
  shown in the results step, and the organizer can try again. Nothing claims a publication the
  server did not accept.

## The artifact

Two private tables, as the 2026-09-10 design describes, with one added column:

```text
app_private.team_candidate_sets
  id                  uuid PK (= command_id)
  session_id          uuid NOT NULL → sessions, restrict
  roster_revision_id  uuid NOT NULL, composite FK (roster_revision_id, session_id)
  snapshot_id         uuid NOT NULL → balance_input_snapshots, restrict
  created_by          uuid NULL → auth.users, set null
  published_at        timestamptz NOT NULL
  team_count          integer NOT NULL
  hard_constraints    jsonb NOT NULL   -- declared by the client, in participant ids, checked
  contract_version, algorithm_version, objective_policy_version text NOT NULL
  set_fingerprint     text NOT NULL    -- computed by the server
  client_claimed      jsonb NOT NULL   -- labeled, unverified

app_private.team_candidate_solutions
  set_id                 uuid NOT NULL → team_candidate_sets, restrict
  candidate_index        integer NOT NULL
  candidate_fingerprint  text NOT NULL -- computed by the server
  assignment             jsonb NOT NULL -- array of teams, each an array of participant ids
  client_claimed         jsonb NOT NULL -- score, diagnostics, seed, iterations
  PK (set_id, candidate_index)
```

`rubric_version` and `resolver_version` are not copied: they belong to the snapshot, which the set
references. RLS enabled, no browser grants, FK leading columns indexed, UPDATE and DELETE rejected
with `55000` except `created_by → null` with every other column identical. No persisted status: the
current set is the newest one for the Session whose roster revision is still current.

## The commands

`publish_team_candidate_set(p_command_id, p_session_id, p_snapshot_id, p_set jsonb)` returns the set
id and its fingerprint. `read_team_candidate_set(p_set_id)` returns the set with its solutions. Both
`security definer`, empty `search_path`, `authenticated` only, and authorized exactly as
`capture_balance_input_snapshot` is, so the two cannot disagree about who may form teams. Receipt type
`publish_team_candidate_set`, aggregate the Session, retention class `TEAM_CANDIDATE_SET`; set id
equals command id; authorization is checked before the receipt.

`p_set` carries `teamCount`, `hardConstraints` (`lockedParticipantTeams`, `pairsTogether`,
`pairsSeparated`, all in participant ids), the three versions, `clientClaimed`, and `candidates`
(each with `teams` and `clientClaimed`).

Validation, in the order it fails:

1. Target COMMUNITY Session in `DRAFT` or `SCHEDULED`, authorized; the Session row is locked first.
2. The snapshot belongs to that Session and to its current roster revision (highest
   `revision_number`, the definition `capture_balance_input_snapshot` uses). Otherwise `40001`.
3. Between one and eight candidates, `teamCount` between 2 and the participant count, and every
   candidate has exactly `teamCount` teams. Otherwise `23514`.
4. Every candidate is an exact partition of the snapshot's participants: each on exactly one team,
   none missing, none invented. Otherwise `23514`.
5. Declared constraints hold for participants in the snapshot: a locked participant is on the
   declared team index, a together pair shares a team, a separated pair does not. References to
   participants outside the snapshot are tolerated. Otherwise `23514`.
6. Then it writes the set, the solutions and the receipt, computing each candidate fingerprint over
   the stored assignment (teams normalized: members sorted, teams in order) and the set fingerprint
   over the snapshot id, team count, constraints and candidate fingerprints.

A different command id over identical input produces an equal set fingerprint.

## The client

- `teamCandidateSetCloudService` in `src/infra/supabase` (publish and read), behind the existing
  `AuthorizedFormationGateway` style of injectable gateway.
- A pure mapper builds `p_set` from the divisions on screen, the Session config constraints and the
  roster revision; it refuses a team member without a participant and drops orphan constraints.
- `publishTeamCandidateSet` use case: stores the command id in `session.authorizedFormation` before
  calling (a retry replays the receipt), records `publishedCandidateSetId` on success, and classifies
  errors into the pt-BR messages already used by XS-W6-08c (offline, permission, roster changed,
  not ready, unexpected).
- `useSessionWizard` exposes `publishCandidateSet`, `publicationState`
  (`idle | publishing | published | error`) and clears the published state when divisions are
  regenerated.
- The results step shows "Publicar" only when `authorizedDraw` is present; while publishing it is
  disabled; once published it shows "Publicado"; on error it shows the message and allows retry.

## Non-goals

Confirmation stays local (`confirmDivision`), so the published set has no consumer until XS-W6-04.
Also out: voting, the organizer-choice record, reading sets on another device, team-size rules, and
server-side recomputation of the objective score.

## Verification

DB tests against the disposable PostgreSQL: authorized organizer versus governance-only, outsider and
anon; snapshot from another Session and from a superseded revision; a candidate missing, inventing or
duplicating a participant; wrong team count; each constraint violation and orphan tolerance; more
than eight candidates; replay of the command id; equal set fingerprint for a different command id;
immutability under privileged DML and the permitted `created_by → null`; a failed command writing
nothing. The exit gate is shown through the authenticated RPC: a forged candidate that breaks a
declared constraint or the partition is refused.

Client tests cover the mapper (orphans, unmapped member), the use case (idempotent command id,
error classification) and the results-step states.
