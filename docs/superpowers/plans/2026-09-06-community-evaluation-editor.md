# Community Evaluation Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Complete authorized evaluation entry → experimental Community profile with server cohort protection.
**Architecture:** Private activation registry + guarded legacy writes + existing versioned semantic command;
separate online form and profile-only cloud Player save. No dual writes or historical import.
**Tech Stack:** PostgreSQL, Supabase, React/TypeScript, Node tests and Vitest.
**Spec:** `docs/superpowers/specs/2026-09-06-community-evaluation-editor-design.md`.

## Global Constraints

Read the spec for exact RPC/JSON/error signatures. Preserve prior uncommitted work and migrations.
No source comments, no deployment/commit, no schema bypass. UI pt-BR. Retain v0 legacy filtered mean.
DB tests only on disposable `127.0.0.1:55500`, serial. Missing scores remain missing. No new dependencies.

## Task 1 — Backend activation, evaluator management and evaluation command

Files: new `supabase/migrations/20260907010305_community_evaluation_editor.sql` and
`src/test/db/communityEvaluationEditor.dbtest.ts`.
Produces all five RPCs and private registry/legacy guard from the spec. Existing record API unchanged.

- [x] Write fixtures/tests before SQL, using `communitySkillProfile.dbtest.ts` setup patterns.
  Expected critical outcomes:

```ts
assert.equal(editor.authority_model, 'legacy');
assert.equal(editor.can_evaluate, false);
await assert.rejects(recordAsManager(), { code: '42501' });
await activateAsManager();
assert.equal((await editorRead()).can_evaluate, false);
await grantEvaluatorExplicitly();
await recordSparse({ saque: 0, ataque: 6 });
assert.equal((await profileRead()).dimensions.find(d => d.dimension_key === 'saque').value, 0);
assert.equal((await profileRead()).dimensions.find(d => d.dimension_key === 'defesa').value, null);
```

- [x] Observe red for absent new RPC, then implement qualified secure functions/trigger.
  Activation and legacy insert/update lock Community rows before reading registry. Record wrapper
  uses the existing source-command Player row lock and receipts rather than an unrelated lock.
- [x] Test own-only reads, active members, role/grant independence, grants and search_path; unchanged
  old record API; legacy insert/update/move refusal and server-side deletion; concurrent activation
  in both orders; wrapper replay after source supersession, actor/context isolation, stale expected
  id rejection, simultaneous retries and no extra receipts.
- [x] Run focused DB suite green, self-review and report. Root owns the full DB run after task ends.

## Task 2 — Client command form, profile refresh and legacy writer separation

Files: new `src/shared/types/communityEvaluation.ts`,
`src/infra/supabase/communityEvaluationCloudService.ts`,
`src/application/communityEvaluationUseCases.ts` + `.test.ts`,
`src/components/player/CommunityEvaluationEditor.tsx` + `.spec.tsx`;
modify `src/types.ts`, profile panel + test, PlayerEditView + test,
`src/application/localPlayerUseCases.ts` + test, `src/hooks/usePlayers.ts` + spec,
`src/app/routes/communityRoutes.tsx`, legacy cloud service + focused test.

- [x] Test input validation and gateway calls before implementation:

```ts
assert.deepEqual(parseScores({ saque: '0', defesa: '' }).value, { saque: 0 });
assert.equal(parseScores({ saque: 'NaN' }).ok, false);
assert.equal(parseScores({}).ok, false);
```

- [x] Implement thin service for the five exact RPCs; AppResult classification of permission,
  unavailable, invalid payload, stale revision and technical failures. Never send actor ID to record.
- [x] Test and implement explicit editor opening, activation acknowledgement, separate evaluator
  member selector, sparse source draft, conflict reload, exact-command retry and pending/context reset.
  Keep submission payload/UUIDs in component state/ref; on technical failure retry the same object.
- [x] Add `saveEvaluation` option (default true) to local save/hook; cloud route passes false.
  Preserve original technical fields and clear legacy evaluation queue context when false. Permit
  profile-only save with canEditPlayerProfile even when evaluation permission is false.
  Disable old technical sliders for cloud Player and explain the separate action.
- [x] Filter legacy upload via target IDs RPC, batching distinct context IDs; only missing-function
  codes PGRST202/42883 fall back for an old deployment. Other failures stop the batch. Test mixed
  cohorts and no writes on lookup error. Cover individual legacy upsert too with explicit refusal.
- [x] Run focused unit/UI/type checks green and inspect integration with existing route/model.

## Task 3 — Evidence and continuation documentation

- [x] Review code independently; root adjudicates/fixes concrete findings and runs affected tests.
- [x] Full typecheck → lint → format → app tests → serial DB tests → build, recording actual counts
  and existing failures. Inspect browser desktop/mobile using fixtures; no production interaction.
- [x] Update HANDOFF/README and C6 integration note with actual activation and rollback boundaries,
  no automatic legacy import, online-only editor, and solver/global cutover still pending.
