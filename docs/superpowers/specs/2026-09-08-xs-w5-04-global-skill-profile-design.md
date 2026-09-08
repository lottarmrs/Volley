# XS-W5-04 — Internal Global Skill Profile

Continuation of the authorized C6 W5 sequence. This slice implements the GlobalPlayerSkillProfile
projection in PostgreSQL. It does not publish a global profile to users or implement W5-05/W6.

## Judgment and alternatives

Keep the hierarchical projection: a player can have evidence from several Communities, and the
canonical N2.02 ownership addendum forbids raw evaluator-count weighting globally. Skipping the
global layer would postpone that invariant until Team Formation. Building stored profiles and
refresh jobs now would add stale-data coordination before a consumer needs it. Compute on demand,
as in W5-03, with one reusable Community calculation and a small global aggregation.

Use the explicit experimental policy `v0-equal-community-mean`: arithmetic mean of available
Community dimension values, each Community counted once, rounded to one decimal with PostgreSQL
numeric arithmetic. Community values retain the user-selected `v0-legacy-mad-mean` filtering and
its existing one-decimal rounding. No second outlier filter across Communities. Confidence/counts
are metadata, never weights. OPEN-RATING-001 and OPEN-RATING-002 remain open.

## Source and semantics

Resolve a single Player and registered rubric version from effective retained evaluation
contributions (`superseded_at is null`). Group by Community, then run the existing Community
calculation. Other Players and rubric versions never enter the result. Legacy table values,
self-evaluation, Player attributes and Overall never enter either stage.

This is a shadow projection: activation does not determine whether a retained versioned source
exists. Do not reinterpret current membership, evaluator revocation or Community standing as a
retraction of an earlier accepted fact. Existing source supersession determines effectiveness.
Current access and roster eligibility will be checked by a future authorized consumer. The private
global calculation requires a non-null existing Player and a registered, trimmed rubric (23514 on
invalid input). It can reconstruct retained facts for an inactive Player; it grants no read access.

Return all dimensions registered for the requested rubric in display order. A Community without
a value for a dimension is omitted from that dimension's denominator. Zero is a value. No available
Community value means null, never zero, midpoint or legacy fallback. Zero sources produce all
null dimensions, community_count=0 and an empty provenance list.

## Database contract

New migration: `supabase/migrations/20260908031027_global_skill_profile.sql`.

- `app_private.compute_community_player_skill_profile(uuid, uuid, text) -> jsonb`: extract the exact
  W5-03 calculation, including its revision and DTO, into a stable SECURITY INVOKER function with
  empty search_path. This is trusted internal computation, not authorization.
- Replace the body of `public.get_community_player_skill_profile(uuid, uuid, text)` in the new
  migration: preserve every existing authentication/capability/standing/rubric check and grants;
  delegate only the calculation to the private helper. Never alter an earlier migration.
- `app_private.compute_global_player_skill_profile(p_player_id uuid, p_rubric_version text)
-> jsonb`: stable SECURITY INVOKER, empty search_path, source selection within one statement
  snapshot, one computed profile per distinct Community. Reuse the private Community helper.
- Revoke execution of both private helpers from PUBLIC, anon and authenticated. No schema grants,
  public wrapper, browser service or UI is introduced. The privileged future resolver is the
  integration boundary; being an evaluator in one Community grants no global visibility.

Global result fields:

```text
player_id, rubric_version, aggregation_policy_version='v0-equal-community-mean',
community_aggregation_policy_version='v0-legacy-mad-mean', status='EXPERIMENTAL',
source_revision, calculated_at, community_count,
community_sources: [{community_id, source_revision, aggregation_policy_version}],
dimensions: [{dimension_key, value:number|null, community_count:number}]
```

community_count counts distinct Communities with an effective contribution for this rubric.
Each dimension's community_count counts only available values. Source provenance is sorted by
Community ID. source_revision is a deterministic fingerprint over subject, rubric, both policy
versions, ordered registered dimensions and ordered Community source revisions. Exclude timestamps
and all display Overall inputs. A same-score replacement still changes source_revision.

Reuse existing Player and Community/Player indexes. No new table, cache, job, index or dependency
without measured need. This read never mutates evaluations, receipts or legacy state.

## Verification and scope

Use real PostgreSQL fixtures and accepted record_player_evaluation commands. Prove unequal
evaluator counts yield equal Community weights (Community A: ten scores of 2, B: one score of 8,
global=5); Community filtering precedes global aggregation; per-dimension missing and zero;
empty and custom rubric; other Player/version isolation; same-score supersession changes revision;
unrelated writes and timestamps do not; evaluator revocation does not retract source facts;
read-only behavior; no Overall/legacy dependency; browser roles cannot call either private helper;
existing Community RPC retains its access denials and identical output/revision.

Run focused Community/global/editor DB suites serially, then full DB suite on the confirmed
disposable PostgreSQL at 127.0.0.1:55500. Run typecheck, scoped lint/format, app tests and build.
Document exact measured evidence and pre-existing global lint/format failures. No remote migration,
commit, merge or deploy. W5-05 and W6 keep their own authorization, snapshot and cutover gates.
