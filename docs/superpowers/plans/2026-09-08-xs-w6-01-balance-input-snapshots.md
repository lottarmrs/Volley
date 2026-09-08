# W6-01 Balance Input Snapshots Implementation Plan

> Use superpowers:subagent-driven-development for independent backend/client work and review.

**Goal:** Capture immutable server-resolved roster inputs with the user-selected missing policy.
**Architecture:** Private snapshot artifact + semantic capture/read RPC + thin application boundary.
**Tech Stack:** PostgreSQL, TypeScript, Node DB/unit tests, Vitest gateway tests where useful.
**Spec:** `docs/superpowers/specs/2026-09-08-xs-w6-01-balance-input-snapshots-design.md`.

## Constraints

Preserve uncommitted W5 work on current feature branch. No comments/dependencies/deploy/commit.
Only disposable localhost:55500 DB; backend agent owns serial DB tests until explicit hand-back.
Fixed rubric and policy versions from spec; source target cohorts only. No legacy solver cutover claim.

## Task 1 — PostgreSQL snapshot capture and regression coverage

Files: `supabase/migrations/20260908142236_balance_input_snapshots.sql` (CLI-created),
`src/test/db/balanceInputSnapshots.dbtest.ts`.

- [ ] Build fixtures with existing target Session/Registration/roster and versioned evaluation helpers.
  Add failing capture test against absent RPC, observe 42883 before implementation.

```ts
assert.equal(snapshot.participants[0].attribute_vector.saque, 0);
assert.equal(snapshot.participants[1].attribute_vector.saque, 0);
assert.equal(snapshot.participants[1].attribute_vector.defesa, 5);
assert.ok(snapshot.participants[1].estimated_dimensions.includes('saque'));
```

- [ ] Implement exact spec RPCs, private RLS table, FK indexes, immutability guard, atomic ledger write,
  single-statement profile/metadata/cohort resolution and ordered provenance/fingerprint.
- [ ] Cover all authorization, immutable replay, concurrent capture, source/cohort, missing/zero,
  failure atomicity and account-erasure cases from spec. Use actual authenticated RPCs for commands.
- [ ] Run focused suite plus roster/registration/evaluation regressions serially; report hand-back.

## Task 2 — Typed application boundary

Files: `src/shared/types/balanceInputSnapshot.ts`, `src/types.ts`,
`src/infra/supabase/balanceInputSnapshotCloudService.ts`,
`src/application/balanceInputSnapshotUseCases.ts` and `.test.ts`.

- [ ] Add tests for same ID/payload retry and error classification using existing AppResult/gateway pattern.
- [ ] Implement DTOs exactly matching spec and thin capture/read gateway; no generated IDs or vectors
  in requests. Validate required request IDs before gateway invocation.
- [ ] Run unit tests/typecheck/scoped lint/format; no DB runs or edits to SQL.

## Task 3 — Review, full verification and continuation

- [ ] Independent spec/SQL/privacy and application interface review; fix concrete findings.
- [ ] Run typecheck, scoped lint/format, app suite, full serial DB suite, build, diff check.
- [ ] Update HANDOFF/README/C6 with actual evidence, user's explicit missing policy and boundaries:
  trusted input resolver implemented; legacy wizard/candidate publishing and W5-05 broad cutover pending.
