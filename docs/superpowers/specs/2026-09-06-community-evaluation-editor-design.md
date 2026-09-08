# Community evaluation editor and source authority

Continuation approved by the user's “seguir” after the W5-03 recommendation: connect evaluation
entry to the versioned source with one write authority per Community. This is an integration slice
between W5-03 and later balance cutover, not completion of XS-W5-04 or XS-W5-05. Earlier local
handoff notes called this editor W5-04; that numbering is corrected without replacing the planned
GlobalPlayerSkillProfile slice.

## Decisions

Use an explicit, one-way Community activation. Existing legacy evaluation rows remain historical;
do not translate or import their values into the experimental rubric. Do not automatically grant
evaluation capability from governance rank. Community members managers may explicitly assign or
revoke EVALUATOR for active members, including themselves.

The new cloud editor sends a dedicated semantic evaluation command. Saving a cloud Player's
identity/profile never simulates consensus, changes technical attributes, or queues a legacy
evaluation. Local-only play retains its current flow. Legacy displays and balance inputs retain
their existing values until the separate snapshot cutover; the experimental profile is fed only
by versioned source evaluations. The UI explains this boundary.

Why: merely swapping the save RPC leaves the sync writer able to replay stale legacy notes. A
client-only flag cannot stop old clients. Global immediate migration would discard context and
force a historical mapping with no agreed semantics. A small server cohort guard is sufficient;
no generic feature-flag engine, offline queue, rubric editor or global profile is needed.

## Backend contract

New migration: `20260907010305_community_evaluation_editor.sql`. Preserve all earlier migrations.

Private table `app_private.community_evaluation_cutovers` stores community_id PK/FK,
activated_at, activated_by nullable on account deletion. No browser table grants. No implicit cohort
activation. Existing W5-01 record command may still supply shadow fixtures in a legacy cohort;
the new editor command requires activation. This does not make shadow data authoritative there.

Authenticated RPCs, SECURITY DEFINER, empty search_path, no PUBLIC/anon execution:

- `activate_community_evaluation_model(p_community_id uuid) -> void`: require
  `community.members.manage`, serialize on the Community row, insert once; repeated activation is
  harmless. Do not grant any evaluator responsibility. Preserve all legacy/source facts.
- `set_community_evaluator(p_community_id uuid,p_user_id uuid,p_enabled boolean) -> void`: require
  `community.members.manage`; reject null inputs/non-active membership; explicitly upsert EVALUATOR
  with assigned_by/assigned_at or set revoked_at. Never change membership rank or ORGANIZER.
- `get_community_evaluation_editor(p_community_id uuid,p_player_id uuid) -> jsonb`: require active
  Community membership before revealing Player standing; require living standing. Return
  `{community_id,player_id,authority_model:'legacy'|'target',can_evaluate:boolean,
  can_manage_evaluators:boolean,rubric_version:'v0-legacy-11',
  own_evaluation:null|{contribution_id,rubric_version,dimensions:Record<string,number>},
  members:Array<{user_id,label,is_evaluator}>}`. Own source only for the authenticated evaluator,
  never another person's scores. Managers alone get active member choices; no members list otherwise.
  The current own contribution may use another rubric; client must not silently reinterpret it.
- `record_community_player_evaluation(p_command_id uuid,p_contribution_id uuid,p_community_id uuid,
  p_player_id uuid,p_rubric_version text,p_dimension_scores jsonb,
  p_expected_contribution_id uuid) -> void`: acknowledge the command; the editor refreshes the profile
  separately. Reuse the existing source receipt internally rather than adding a second receipt.
  Require active target cohort and contextual evaluation capability. Serialize using the existing
  W5-01 Player row lock. On first execution compare the caller's previous own
  contribution id (null means none) with the effective source, rejecting stale changes with 40001.
  Replays use existing receipt semantics before checking the now-stale expected id, and recheck
  capability and bind the receipt to the authenticated evaluator, Community and Player. Call the
  existing record command; do not duplicate its validation/receipt implementation.
- `community_evaluation_target_ids(p_community_ids uuid[]) -> setof uuid`: only target IDs where
  the actor has active membership. Used by legacy sync to omit retired cohorts, never to authorize
  writes. Reject unauthenticated calls. Older-server missing-function codes alone permit legacy sync
  fallback; all other lookup failures stop that batch rather than guessing.

A legacy table trigger rejects INSERT and UPDATE entering or leaving target Communities with
23514 and `Legacy evaluation writes are disabled for this Community`. Serialize on affected
Community rows in sorted order before checking activation so concurrent activation and old-client
writes cannot race. Do not block DELETE: existing account erasure/cleanup semantics still own legacy
deletion, and no new legacy evaluation can be created or changed after activation. No new global
permissions, mutation of old source facts, or caller-spoofable bypass flag.

## Client contract

`CommunityEvaluationEditor` mounts on explicit “Avaliar atleta” from the existing profile panel,
with exact Community and Player cloud IDs and account-keyed lifetime. It loads only the server's
own current evaluation and starts unanswered dimensions blank, never from consensus or legacy
Player attributes. Eleven pt-BR number inputs accept blank or finite 0..10. Sending replaces the
complete own contribution for v0; omitted fields remain missing. At least one score is required.

Managers see separate explicit activation acknowledgement and evaluator grant/revoke selection.
Buttons act only on selected Community/member. Other users see an explanation when activation or
evaluation capability is missing. No automatic self-grant. Context changes discard draft/result
and ignore late requests. A successful save triggers a fresh profile read.

Each logical submission captures immutable payload plus generated command/contribution UUIDs.
While pending, disable edits and duplicate clicks. On an uncertain network failure preserve those
IDs/payload for explicit retry. Definite permission/validation/conflict failure clears the pending
command; do not claim saved on failure or fall back to legacy/local consensus. A stale-source conflict
requires reload of the current evaluation before another submission.

The existing cloud Player editor shows old technical sliders as read-only. Its profile save preserves
original technical/source fields and does not queue a legacy evaluation. Local mode is unchanged.
Legacy bulk upload resolves target IDs at send time, omits them, and the database guard remains the
final protection against stale clients or activation after the lookup.

## Verification

Real disposable Postgres tests: member/manager/evaluator separation; own-only source; activation
idempotence/history; legacy guard including Community moves and concurrent activation; explicit
assignment/revocation; complete evaluation→profile result; replay and stale own revision; grants;
legacy deletion retained for account cleanup. No simultaneous harness rebuilds.
Client tests: sparse/zero validation, exact immutable retry, conflict handling, account/Community/Player
reset, successful profile refresh, explicit management controls, no legacy/profile cross-write;
sync mixed-cohort filter and fail-closed lookup. Run full app/DB suites, typecheck/build and scoped
lint/format; report existing global gate failures. Browser fixture inspection without production data.

No remote migration, production activation, commit, merge or deploy in this task. Keep W5-02/W5-03
uncommitted work intact. Representative load tests and solver cutover remain separate work.
