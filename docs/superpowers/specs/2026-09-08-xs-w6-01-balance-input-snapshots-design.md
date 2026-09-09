# W6-01 — Authorized immutable balance inputs

User continuation authorizes the next W5-05/W6-01 integration. User explicitly chose missing scores
resolved by the evaluated roster mean, then 5 when there is no reference. This is an experimental
versioned policy, not closure of the final rubric/objective decisions.

## Scope and architecture

For a target COMMUNITY Session in DRAFT or SCHEDULED, an assigned authorized Organizer captures
an exact current RosterRevision into one private immutable JSON snapshot set. A semantic RPC
accepts IDs only; the browser never supplies attribute vectors. The private global profile introduced
in W5-04 is the only evaluation source. No legacy attributes, self-evaluations, Overall, form,
statistics or display rating enter the vector. No solver/publication/voting UI is changed yet.

Evaluation cutover must be active for the Session Community and every Community contributing to
any selected global profile. Reject mixed shadow/activated sources; do not silently omit a Community
or promote shadow facts to trusted input. Query these conditions within the same statement that
resolves source facts. W5-05 target source integration is proven for this new resolver only; the
legacy wizard's sorter remains on its prior path until candidate publication is integrated.

Use a private snapshot table, not a materialized current profile. This storage is necessary: later
changes to sources must not rewrite the inputs of a captured formation. One snapshot set per command
ID; new commands may capture fresh evidence for the same roster. No source refresh jobs needed.

## Authorization and lifecycle

Commands: `public.capture_balance_input_snapshot(p_command_id uuid, p_session_id uuid,
p_roster_revision_id uuid) -> jsonb`; `public.read_balance_input_snapshot(p_snapshot_id uuid) -> jsonb`.
Both are SECURITY DEFINER, empty search_path, authenticated EXECUTE only, explicit auth.uid check.
Load target COMMUNITY Session and require `public.assert_target_session_write_authorized` for both
capture and read. Governance rank or EVALUATOR alone does not grant formation access. Reader never
returns raw evaluations, evaluator identities or Community source identities. No table grants.

Capture locks Session first (same lock as roster mutation/finalization). Require non-null IDs (23514),
existing target COMMUNITY Session (P0002), then valid Organizer (42501). Inspect existing receipt
only after authorization. A replay returns the original frozen snapshot, even after evaluations,
lifecycle or current roster changed; reusing its command with a different roster is 23505.
Receipt type `capture_balance_input_snapshot`, aggregate_id Session, existing ledger retention
`BALANCE_INPUT_SNAPSHOT`. Authorization runs before the receipt lookup, and the receipt match is confined to this Session by aggregate_id; the existing receipt API does NOT itself recheck actor. Snapshot ID equals command ID.

For new capture require DRAFT/SCHEDULED, active Session evaluation cohort, a nonempty latest roster
revision belonging to the Session, rejecting old/cross-session revision with 40001/23514 respectively.
Require each PLAYER entry to have non-null existing active Player and live Community standing;
do not transform a removed Player into a Guest. GUEST entries have no global profile and are estimated.
Use frozen roster entry participant_id and display_name_at_time, not current participant edits.
No Session revision bump: capture is its own immutable artifact, not a roster mutation.

Read rechecks current assigned-Organizer permission but permits old/terminal snapshots. A returned
snapshot remains tied to its original roster; downstream candidate publication must revalidate the
current roster and configuration independently. No claim of candidate validity is made here.

## Resolver policy and JSON contract

Fixed rubric `v0-legacy-11`, resolver `v0-global-roster-mean-5`. Global policy stays
`v0-equal-community-mean` and Community policy `v0-legacy-mad-mean`. Validate exact eleven source
dimension keys in the registry for this resolver, fail 23514 on drift (no arbitrary new solver keys).
Attribute vector uses the Portuguese rubric keys, with all eleven finite numeric values 0..10.

For each dimension, arithmetic mean of non-null global values of PLAYER entries in this exact
roster, rounded to one decimal using numeric arithmetic. Missing entries get that mean; with zero
observations get numeric 5. Observed zero participates. Do not include estimates in the mean and
never overwrite an observed value. GUESTs participate in teams but not the reference mean.
Every estimated dimension is explicitly listed in `estimated_dimensions`; `is_estimated` is true
when any dimension is estimated. Raw missing values remain available only in private provenance.

Public result (capture and read share exact shape):

```text
snapshot_id, session_id, roster_revision_id, rubric_version, resolver_version,
global_policy_version, community_policy_version, captured_at, input_fingerprint,
participants: [{participant_id, identity_kind:'PLAYER'|'GUEST', display_name_at_time,
  attribute_vector: Record<eleven rubric keys,number>, estimated_dimensions:string[],
  is_estimated:boolean, source_profile_revision:string|null,
  height_cm:number|null, gender:string|null, primary_position:string|null,
  secondary_positions:string[], is_injured:boolean}]
```

Participant order is roster entry_order; estimated dimensions follow registry display_order.
PLAYER physical/position metadata is frozen from columns on public.players; height invalid/nonpositive
or nonfinite becomes null (unknown); gender and positions are captured as source strings, not skill.
`is_injured` is true only for JSON boolean status.lesionado=true; no arbitrary status/profile object.
GUEST metadata is null/empty/false. Injury is an input hint, not a new automatic exclusion policy.
Do not copy global player_id into public or private JSON; use roster/participant references for identity.

Private table `app_private.balance_input_snapshots` columns: id uuid PK; session_id uuid NOT NULL
FK sessions restrict; roster_revision_id uuid NOT NULL, composite FK (roster_revision_id,session_id)
to roster_revisions; created_by uuid nullable FK auth.users set null; captured_at timestamptz NOT NULL;
payload jsonb object NOT NULL (the public result); provenance jsonb array NOT NULL (per participant
original global profile revisions, Community source provenance, raw dimensions; no evaluator IDs).
Index complete leading columns of all FKs. RLS enabled, no browser grants. Trigger rejects UPDATE
and DELETE with 55000 except exact created_by transition to null for account erasure, all other
columns identical. Explicitly revoke private trigger/helper execution.

input_fingerprint is md5 of deterministic JSON containing Session, roster, all policy versions,
ordered public participant data and private source provenance. Exclude snapshot ID/captured_at/actor:
same logical input captured twice has same fingerprint; same-score source revision change differs.
Source reads/global profile resolution/player metadata/cohort validation use one SQL statement
snapshot so mixed-time profile vectors cannot occur. Store raw provenance without calculated_at
to avoid timestamp changes affecting fingerprint. Use global helper once per Player (materialized CTE).
Insert snapshot and command receipt in same transaction; failures write neither.

## Client boundary

Create shared DTO/request types exported through src/types.ts; thin Supabase gateway and application
functions for capture/read returning AppResult. Errors: 42501 permission, 40001 conflict, 23514 invalid
or unavailable context, 23505 command reuse conflict, P0002 missing context, missing function/network
technical recoverable. Forward caller-owned immutable IDs; never generate a new command on retry.
No direct table writes or client resolver; no new UI or generic sync/cache integration.

## Verification

DB tests use real disposable PG serially: explicit Organizer versus governance/evaluator/outsider/
anon; exact Session/roster and current revision; empty/deleted/inactive Player; Guests; cohort guard;
scores only from target source; observed zero, partially missing, all missing, mean excludes estimates;
cross-Community equal weights; source and physical metadata change leaves prior snapshot intact;
new capture reflects change; same command replay; different command equal-input fingerprint;
changed-roster replay rejection; concurrent identical capture produces one row/receipt; old roster
reads allowed but new capture rejected; private direct DML denied and privileged mutation rejected;
created_by nulling permitted without payload changes; failed command writes neither snapshot/receipt.
Root runs complete serial DB regression after focused tests, typecheck/scoped lint/format/app tests/build.
No remote apply, commit, merge or deployment. Quick local resolver remains W12; W6 solver/candidate
publication remains next integration, so do not call the legacy sorter migrated.
