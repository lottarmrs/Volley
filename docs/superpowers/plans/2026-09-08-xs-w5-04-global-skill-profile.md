# XS-W5-04 Global Skill Profile Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the implementation
> and independent review. Execute all authorized tasks without another continuation prompt.

**Goal:** Compute a reproducible global skill vector with one equally weighted value per Community.
**Architecture:** Private on-demand PostgreSQL projection sharing the existing Community estimator.
**Tech Stack:** PostgreSQL, Node test runner, TypeScript DB harness.
**Spec:** `docs/superpowers/specs/2026-09-08-xs-w5-04-global-skill-profile-design.md`.

## Global Constraints

Preserve all existing uncommitted W5 work on the current feature branch. Do not commit/deploy.
Use `v0-equal-community-mean` globally and `v0-legacy-mad-mean` within each Community.
No new source comments, dependencies, browser grants or mutable projection tables.
DB tests only on disposable `127.0.0.1:55500`, serially. No global user-facing API or solver cutover.

## Task 1 — Private projection and regression coverage

Files: `supabase/migrations/20260908031027_global_skill_profile.sql` (created by CLI),
`src/test/db/globalSkillProfile.dbtest.ts`; preserve all existing source migrations.
Consumers/producers: exact private helper signatures and JSON result from the spec; existing
public Community RPC signature and result remain unchanged.

- [x] Add DB tests using the fixture/auth helpers in `communitySkillProfile.dbtest.ts`.
      Start with the equal-Community regression; record sources through the semantic command.

```ts
assert.equal(dimension(globalProfile, 'saque').value, 5);
assert.equal(dimension(globalProfile, 'saque').community_count, 2);
assert.equal(dimension(globalProfile, 'defesa').value, null);
assert.equal(globalProfile.aggregation_policy_version, 'v0-equal-community-mean');
```

- [x] Run `npm run test:db -- globalSkillProfile.dbtest.ts` with the disposable DB URL;
      confirm failure because the private global function is absent.
- [x] Extract the unchanged Community calculation into the private helper, replace the public
      body with identical validation followed by delegation, and add the private global calculation.

```sql
select dimension_key, round(avg(value), 1) as value, count(value) as community_count
from community_dimension_values
group by dimension_key;
```

- [x] Add independently expected fixtures for filtering, per-dimension coverage, zero/empty,
      version/Player isolation, source supersession and revocation, stable fingerprints, read-only
      behavior and legacy/Overall independence. Assert exact DTO fields and sorted provenance.
- [x] Test pg_proc security/search_path, has_function_privilege and actual anon/authenticated
      call denial for both private helpers; retain public Community authorization regressions.
- [x] Run focused global, Community and editor DB suites serially; self-review and report counts.

## Task 2 — Independent review, full verification and recorded boundary

Integration finding: the W5-02 historical migration test excluded only its own migration while
applying later dependent migrations. Update `src/test/db/skillRubricContract.dbtest.ts` to exclude
that migration and every later entry from `loadMigrations()`, preserving the base schema. Verify
the original atomic refusal test and all 13 rubric tests before the full rerun.

Files: `HANDOFF.md`, `README.md`, C6.02 execution document, ADR-CATALOG and a scoped ADR.
Consumes: Task 1 implementations and test results; produces accurate continuation state.

- [x] Review estimator ordering, source scope, precision, privacy and Community compatibility.
      Fix concrete findings and rerun affected tests.
- [x] Run typecheck, focused ESLint/Prettier, complete app tests, full serial DB tests and build;
      use `git diff --check` and record exact counts without implying remote validation.
- [x] Record W5-04 internal projection as locally validated; explain no stored cache or public
      visibility, and leave W5-05 target snapshot/cutover unfinished.
