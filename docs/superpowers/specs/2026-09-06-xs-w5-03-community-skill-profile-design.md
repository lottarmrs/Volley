# XS-W5-03 — Community skill profile on demand

## Intent and decision

Make effective Community evaluations readable as an experimental skill profile, with explicit
missing data and reproducible provenance. The user approved continuing the simpler on-demand
direction and explicitly chose the existing mean with outlier filtering over a median estimator.

Persisting a derived profile now would require refresh/invalidation without measured benefit.
This slice computes a profile in one PostgreSQL snapshot and exposes a small read panel in the
existing player editor. It adds no projection table, refresh job, cache, new write authority,
global profile, Overall, or balancer input change. The semantic evaluation editor/cutover remains a
subsequent deliverable; this read integration does not claim to complete that entire journey.

This is an explicit experimental deviation from C6 W5-03's stored-projection exit gate, recorded
in `docs/architecture/adr/2026-09-06-community-skill-profile-on-demand.md` and linked from C6.02.
`OPEN-RATING-001` remains open for a permanent estimator and `OPEN-BAL-001` for a stable rubric.

## Profile contract

`public.get_community_player_skill_profile(p_community_id uuid, p_player_id uuid,
p_rubric_version text)` returns one JSONB object with:

- `community_id`, `player_id`, normalized `rubric_version`;
- `aggregation_policy_version = 'v0-legacy-mad-mean'`, `status = 'EXPERIMENTAL'`;
- opaque deterministic `source_revision`, derived from this context, registered dimensions and
  effective contribution IDs plus dimension scores, ordered canonically; not an authorization token;
- `calculated_at`, `contribution_count` for this rubric/context;
- `dimensions` in registered display order, each with `dimension_key`, nullable numeric `value`,
  `sample_count`, `included_count`, `excluded_count`.

No evaluator identities, raw scores, contribution IDs, or legacy Player attribute fallback are
returned. Zero is a real score; absence returns null with all counts zero. Count metadata represents
coverage, not a probability of accuracy. Unknown rubric is an explicit validation error.

Only effective contributions from the exact Community/Player/rubric are inputs. A superseding
evaluation in another version removes the old effective contribution from its version's profile,
but history remains retained. Anonymized retained contributions remain inputs, as W5-01 specifies.
Read execution must not mutate source facts or create command receipts.

## Experimental estimator — user-selected legacy policy

Compute independently for every dimension, using only actual normalized score rows:

1. Fewer than four samples: include every value.
2. Otherwise compute the median, then the median absolute deviation (MAD).
3. Include values whose absolute distance to the median is at most `max(1.75, MAD * 2.5)`.
4. If fewer than two values remain, include all original samples.
5. Average included values and round to one decimal; return the sample/included/excluded counts.

Examples: `[5, 6, 10] → 7.0` (three samples); `[5, 5, 5, 10] → 5.0` (one exclusion);
`[0] → 0.0`; `[] → null`. Preserve these parameters, not the legacy coercion of missing values
to 5. Compute numeric scores in PostgreSQL; never ship raw source rows for client aggregation.

## Authorization and errors

The first read surface is restricted to authenticated users with `player.evaluate` in the requested
Community and a living Player/Community roster relation. This purpose-limited preview does not
grant all members access or decide future athlete/global visibility. Owner/admin rank alone does
not grant access. Authorization is checked before revealing Player/rubric existence.

The RPC is `STABLE SECURITY DEFINER SET search_path = ''`, with fully qualified relations and
functions, revoked from PUBLIC/anon and granted only to authenticated. Source tables keep their
existing no-browser-grant posture. No new table or policy grants.

- unauthenticated: `42501`, `Not authenticated`;
- missing Community/Player parameters: `23514`, `Community and Player are required`;
- no contextual evaluator capability: `42501`, `Not authorized to read skill profiles in this Community`;
- no living Player standing: `23514`, `Player has no living roster standing in this Community`;
- unregistered/blank/null rubric: `23514`, `Rubric version is not registered`.

## Client integration

Add a separate type exported through `src/types.ts`, a thin Supabase read service and an application
use case classifying errors in Portuguese. Do not extend Player core or persist profile in localStorage.
The request includes the version explicitly. Browser sends no actor ID.

Add a compact section to PlayerEditView using existing daisyUI styling. Authenticated cloud Players
can explicitly select one of their cloud-backed Communities and request the experimental profile.
Selection is never inferred from the first Community. Show mean/coverage per dimension, missing
values, experimental method explanation, loading, access-denied and retryable failures. Query only
on request; no automatic network call merely from opening the legacy editor.

Changes of Player, account or selected Community clear the visible profile immediately. Late responses
cannot render into the new context. Never reuse the editor's legacy canEvaluate flag for authorization.
This preview does not save evaluations or alter the old edit/save path.

## Evidence

Database tests use the real disposable PostgreSQL harness: hand-calculated mean/MAD cases, missing
versus zero, context/version isolation, supersession and stable/change-sensitive checkpoint, no writes,
anonymous/member/rank/cross-Community denial and capability revocation. Keep fixtures small and focused.
UI tests prove explicit Community selection, no automatic request, missing/coverage display,
permission errors, and rejection of late results after context change. Verify the mounting point.
Run typecheck, focused lint/format, app tests, complete DB suite and build; report pre-existing global
lint/format failures separately. Inspect the read surface in browser when feasible.

## Rollout and next boundary

Migration is additive and follows W5-02, which retains its empty-source rollout precondition.
No deployment in this task. The preview needs the migrations and an explicit evaluator responsibility;
it must surface unavailable-server errors honestly on older deployments. Future work owns evaluator
assignment UI, the single-authority evaluation editor/cohort cutover, wider profile visibility,
global aggregation, and immutable balance snapshots. None is silently supplied by this slice.
