# XS-W5-03 Community Skill Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Expose an authorized experimental Community skill profile computed on demand, and make it readable in the existing Player editor.

**Architecture:** One stable RPC computes the user-selected legacy mean/MAD policy from versioned source facts. A thin service/use case returns a dedicated DTO to a request-driven read panel. No persisted profile, background jobs or source-writer cutover.

**Tech Stack:** PostgreSQL/Supabase, TypeScript, React, existing daisyUI, Node DB tests and Vitest/RTL.

**Spec:** `docs/superpowers/specs/2026-09-06-xs-w5-03-community-skill-profile-design.md`.

## Global Constraints

- Policy is `v0-legacy-mad-mean`, explicitly experimental; user chose the existing filtered mean.
- Missing remains null, never zero or a fabricated 5. Zero remains a real score.
- Exact Community/Player/rubric inputs; only effective source contributions.
- Read requires contextual `player.evaluate` and living Player standing; no rank fallback or raw-source grants.
- Source revision is deterministic, opaque and contextual, not an authorization token.
- No profile table, refresh job, global aggregate, Overall, source edits, or balancer changes.
- Preserve W5-02 uncommitted changes, old migration files and legacy save behavior.
- No new source comments. Only documented local disposable DB `127.0.0.1:55500` for DB tests.
- UI uses Portuguese, existing design tokens, explicit Community selection and request initiation.
- No profile persistence; clear context on Player/account/Community changes, ignore late responses.

## Task 1 — Backend read contract

Files: create `supabase/migrations/20260906231744_community_skill_profile.sql`,
`src/test/db/communitySkillProfile.dbtest.ts`.

Interface: `get_community_player_skill_profile(uuid, uuid, text) -> jsonb`, exact fields/errors from spec.

- [x] Create focused DB fixtures and tests before implementation. Independently expected examples:

```ts
assert.equal(byKey.saque.value, 7);
assert.equal(byKey.saque.sample_count, 3);
assert.equal(byKey.ataque.value, 5);
assert.equal(byKey.ataque.excluded_count, 1);
assert.equal(byKey.defesa.value, null);
assert.equal(byKey.defesa.sample_count, 0);
```

Use contributions containing saque `[5,6,10]` and ataque `[5,5,5,10]`, plus explicit zero in another
dimension. Establish membership/responsibility through existing test fixture patterns. The DB suite
must also prove isolation, supersession, deterministic/change-sensitive checkpoint, no source/receipt
mutations on reads, capability revocation and no rank-based access. Test privileges and search_path.

- [x] Run `npm run test:db -- communitySkillProfile.dbtest.ts` with the disposable URL and observe red.
- [x] Implement the spec with CTEs for effective source, per-dimension median, MAD, included counts,
      aggregate and source checkpoint. Use the exact threshold `greatest(1.75, mad * 2.5)` and fallback
      to all samples if fewer than two remain; fewer than four samples are never excluded. Round mean
      to one decimal. Read/auth/source queries share the STABLE snapshot. No write statement in RPC.
- [x] Run focused DB test green; inspect source privacy and query cost. Parent owns full-suite run.

## Task 2 — Typed client and usable read panel

Files: create `src/shared/types/communitySkillProfile.ts`,
`src/infra/supabase/communitySkillProfileCloudService.ts`,
`src/application/communitySkillProfileUseCases.ts`, its `.test.ts`,
`src/components/player/CommunitySkillProfilePanel.tsx`, its `.spec.tsx`;
modify `src/types.ts`, `src/components/player/PlayerEditView.tsx` and its `.spec.tsx`.

- [x] Export a dedicated profile DTO from the types barrel with nullable dimension values and exact
      snake_case JSON fields. Do not add attributes to Player or coerce the DTO to legacy Attributes.
- [x] Write failing use-case tests for missing IDs/cloud configuration, server denials/unavailability,
      and forwarding explicit Community/Player/rubric without an actor. Write failing UI tests for
      manual selection/request, coverage/missing display and stale-result cancellation on context changes.
- [x] Implement thin Supabase `.rpc` read and `AppResult` error classification. Use the real error code,
      never raw SQL errors as UI copy. No fake local profile when unavailable.
- [x] Implement a plain section with select, Consultar/Atualizar button, short experimental-policy
      explanation, status/error, and dimension table with sample counts. Use existing attribute labels.
      Mount in PlayerEditView, keyed by account/Player; filter cloud-backed Player Communities and require
      explicit selection. Do not alter existing sliders/save/permission behavior.
- [x] Run UI/use-case tests green and verify mount behavior and no request on initial opening.

## Task 3 — Documentation, evidence and review

- [x] Link the explicit on-demand architecture decision from C6.02's W5-03 exit gate and ADR catalog.
- [x] Update README and HANDOFF with the precise partial product boundary: profile read integrated,
      source evaluation editor/cutover and balancer consumption still pending.
- [x] Run typecheck → global lint → global format → app tests → full DB tests → build. Record existing
      global lint/format failures separately and run focused checks on altered files; do not format repo.
- [x] Inspect the UI in a browser if available, using test data only; no production interaction.
- [x] Obtain independent review of spec, quality and integration; fix meaningful findings and rerun
      affected checks. Record actual counts, scope and branch state. No commit, merge or deployment implied.
