# XS-W6-03 CandidateSet Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer publish, with a "Publicar" button, the team candidates of an authorized draw as an immutable server artifact that the database revalidates against the snapshot.

**Architecture:** Two private append-only tables and two `security definer` RPCs in one migration; the publish command locks the Session, authorizes like `capture_balance_input_snapshot`, checks snapshot currency, exact partition and declared constraints, then writes the set, its solutions and a receipt. On the client, a pure mapper turns the divisions on screen (local Player ids) into participant ids through the roster revision, a resumable use case calls the RPC, and the wizard hook and results step expose `idle | publishing | published | error`.

**Tech Stack:** PostgreSQL 15 / Supabase RPC, TypeScript, React 19, Node test runner (`.test.ts`), Vitest + Testing Library (`.spec.tsx`), real-Postgres suites (`.dbtest.ts`).

**Spec:** `docs/superpowers/specs/2026-09-17-xs-w6-03-candidate-set-publication-design.md`

## Global Constraints

- Worktree `C:\Volley-xs-w6-03`, branch `exec/c6-candidate-set-publication`; never edit `C:\Volley`.
- Migration file `supabase/migrations/20260917130000_team_candidate_sets.sql`; functions `security definer`, `set search_path = ''`, qualified names, `revoke ... from public, anon` and `grant execute ... to authenticated` only for the two RPCs.
- Receipt type `publish_team_candidate_set`, aggregate the Session id, retention class `TEAM_CANDIDATE_SET`; set id equals command id; authorization before the receipt lookup.
- Error codes: unauthenticated or unauthorized `42501`; Session missing `P0002`; malformed input, wrong lifecycle, foreign snapshot, partition or constraint violation `23514`; superseded roster revision `40001`; mutation of the artifact `55000`.
- Candidate bounds: 1 to 8 candidates; `teamCount` between 2 and the participant count; every candidate has exactly `teamCount` teams.
- Constraint JSON keys: `lockedParticipantTeams` (object participant id → 0-based team index), `pairsTogether`, `pairsSeparated` (arrays of two participant ids). References to participants outside the snapshot are tolerated.
- UI copy in pt-BR: button "Publicar", busy "Publicando…", done "Publicado"; errors reuse `classifyAuthorizedFormationFailure`.
- `.rpc(` only under `src/infra/supabase` (AF-FREEZE-004). No comments in TS source.
- DB tests: `VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs <file>.dbtest.ts` (container `volley_test_pg2`).

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260917130000_team_candidate_sets.sql` | Tables, immutability triggers, `team_index_of`, `publish_team_candidate_set`, `read_team_candidate_set` |
| `src/test/db/teamCandidateSets.dbtest.ts` | Publish and read against real Postgres |
| `src/shared/types/teamCandidateSet.ts` | `TeamCandidateSetPayload`, `PublishedTeamCandidateSet`, `TeamCandidateSetRead` |
| `src/infra/supabase/teamCandidateSetCloudService.ts` (+ `.test.ts`) | RPC calls and response parsing |
| `src/application/authorizedFormationGateways.ts` | `TeamCandidateSetGateway` |
| `src/application/teamCandidateSetMapper.ts` (+ `.test.ts`) | Divisions + constraints + roster → payload |
| `src/application/teamCandidateSetUseCases.ts` (+ `.test.ts`) | Resumable publish, `clearCandidateSetPublication` |
| `src/shared/types/authorizedFormation.ts` | `publishedCandidateSetId` in progress |
| `src/hooks/useSessionWizard.ts` (+ spec) | `publishCandidateSet`, `publicationState`, `publicationError` |
| `src/application/screens/sessionWizard/*` | Hook API, model, intent `publishCandidateSet` |
| `src/components/session/CandidateSetPublication.tsx` (+ spec) | Button and states |
| `src/components/session/SessionWizard.tsx` | Renders it in the results step |

---

### Task 1: Artifact tables and `publish_team_candidate_set`

**Files:**

- Create: `supabase/migrations/20260917130000_team_candidate_sets.sql`
- Test: `src/test/db/teamCandidateSets.dbtest.ts`

**Interfaces:**

- Consumes: `public.assert_target_session_write_authorized(public.sessions)`, `app_private.find_command_receipt(uuid, text, uuid)`, `app_private.record_command_receipt(uuid, uuid, text, uuid, jsonb, text)`, `app_private.balance_input_snapshots` (`payload -> 'participants'`), `public.roster_revisions (id, session_id, revision_number)`.
- Produces: `public.publish_team_candidate_set(p_command_id uuid, p_session_id uuid, p_snapshot_id uuid, p_set jsonb) returns jsonb` → `{"set_id": uuid, "set_fingerprint": text}`; tables `app_private.team_candidate_sets`, `app_private.team_candidate_solutions`; `app_private.team_index_of(jsonb, text) returns integer`.

- [ ] **Step 1: Write the failing DB suite**

Create `src/test/db/teamCandidateSets.dbtest.ts`:

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentity,
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

const MIGRATION = '20260917130000_team_candidate_sets.sql';

interface Published {
  set_id: string;
  set_fingerprint: string;
}

interface Fixture {
  ownerId: string;
  communityId: string;
  sessionId: string;
  rosterRevisionId: string;
  snapshotId: string;
  participants: string[];
  playerIds: string[];
}

if (!isTestDatabaseConfigured()) {
  test(`team candidate sets require ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.deepEqual(
      result.failures.filter(({ migration }) => migration === MIGRATION),
      [],
    );
  });

  test.after(async () => {
    await client?.end();
  });

  async function newUser(label: string): Promise<string> {
    const email = `${label}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email) values ($1, $2) on conflict do nothing',
      [rows[0].id, email],
    );
    return rows[0].id;
  }

  async function newPlayer(ownerId: string, communityId: string, name: string): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, has_account_identity_history)
       values ($1, $2, $3, false)`,
      [id, ownerId, name],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, id, ownerId],
    );
    return id;
  }

  let sourceRevision = 0;

  async function materialize(
    sessionId: string,
    ownerId: string,
    playerIds: string[],
    participantIds: string[],
  ): Promise<string> {
    const rosterRevisionId = randomUUID();
    sourceRevision += 1;
    const payload = playerIds.map((playerId, index) => ({
      entry_order: index,
      participant_id: participantIds[index],
      identity_kind: 'PLAYER',
      player_id: playerId,
      display_name: `Atleta ${index}`,
    }));
    await client.query(
      `select app_private.materialize_target_session_roster(
         $1, $2, 'REGISTRATION', null, $3::bigint, null, $4, $5::jsonb
       )`,
      [rosterRevisionId, sessionId, sourceRevision, ownerId, JSON.stringify(payload)],
    );
    return rosterRevisionId;
  }

  async function capture(ownerId: string, sessionId: string, rosterRevisionId: string) {
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ snapshot: { snapshot_id: string } }>(
        'select public.capture_balance_input_snapshot($1, $2, $3) as snapshot',
        [randomUUID(), sessionId, rosterRevisionId],
      ),
    );
    return rows[0].snapshot.snapshot_id;
  }

  async function fixture(size = 4): Promise<Fixture> {
    const ownerId = await newUser('owner');
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Candidatos ${randomUUID()}`,
      ]),
    );
    const communityId = rows[0].id;
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, ownerId],
    );
    const sessionId = randomUUID();
    await asIdentityCommitting(client, ownerId, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessionId, communityId, 'Sessao com candidatos'],
      ),
    );
    const playerIds: string[] = [];
    for (let index = 0; index < size; index += 1) {
      playerIds.push(await newPlayer(ownerId, communityId, `Atleta ${index}`));
    }
    const participants = playerIds.map(() => randomUUID());
    const rosterRevisionId = await materialize(sessionId, ownerId, playerIds, participants);
    const snapshotId = await capture(ownerId, sessionId, rosterRevisionId);
    return {
      ownerId,
      communityId,
      sessionId,
      rosterRevisionId,
      snapshotId,
      participants,
      playerIds,
    };
  }

  function setOf(
    candidates: string[][][],
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      teamCount: candidates[0]?.length ?? 2,
      contractVersion: 'v1',
      algorithmVersion: 'simulated-annealing-v1',
      objectivePolicyVersion: 'v0-legacy-weights',
      hardConstraints: { lockedParticipantTeams: {}, pairsTogether: [], pairsSeparated: [] },
      clientClaimed: { setFingerprint: 'client-side' },
      candidates: candidates.map((teams, index) => ({
        teams,
        clientClaimed: { score: index, seed: 42 },
      })),
      ...overrides,
    };
  }

  async function publish(
    actorId: string | null,
    f: Fixture,
    set: Record<string, unknown>,
    commandId = randomUUID(),
  ): Promise<Published> {
    const { rows } = await asIdentityCommitting(client, actorId, () =>
      client.query<{ result: Published }>(
        'select public.publish_team_candidate_set($1, $2, $3, $4::jsonb) as result',
        [commandId, f.sessionId, f.snapshotId, JSON.stringify(set)],
      ),
    );
    return rows[0].result;
  }

  async function refusal(
    actorId: string | null,
    f: Fixture,
    set: Record<string, unknown>,
    snapshotId = f.snapshotId,
  ): Promise<string | undefined> {
    const error = await asIdentity(client, actorId, () =>
      client.query('select public.publish_team_candidate_set($1, $2, $3, $4::jsonb)', [
        randomUUID(),
        f.sessionId,
        snapshotId,
        JSON.stringify(set),
      ]),
    ).catch((thrown: Error) => thrown);
    return (error as { code?: string }).code;
  }

  async function setCount(sessionId: string): Promise<number> {
    const { rows } = await client.query<{ count: string }>(
      'select count(*) from app_private.team_candidate_sets where session_id = $1',
      [sessionId],
    );
    return Number(rows[0].count);
  }

  test('publica o conjunto, normaliza as atribuicoes e grava o recibo', async () => {
    const f = await fixture();
    const [a, b, c, d] = f.participants;
    const commandId = randomUUID();
    const result = await publish(
      f.ownerId,
      f,
      setOf([
        [
          [b, a],
          [d, c],
        ],
        [
          [a, c],
          [b, d],
        ],
      ]),
      commandId,
    );

    assert.equal(result.set_id, commandId);
    assert.match(result.set_fingerprint, /^[0-9a-f]{32}$/);

    const set = await client.query(
      `select session_id, roster_revision_id, snapshot_id, created_by, team_count,
              hard_constraints, set_fingerprint, client_claimed
         from app_private.team_candidate_sets where id = $1`,
      [commandId],
    );
    assert.equal(set.rows[0].session_id, f.sessionId);
    assert.equal(set.rows[0].roster_revision_id, f.rosterRevisionId);
    assert.equal(set.rows[0].snapshot_id, f.snapshotId);
    assert.equal(set.rows[0].created_by, f.ownerId);
    assert.equal(set.rows[0].team_count, 2);
    assert.equal(set.rows[0].set_fingerprint, result.set_fingerprint);
    assert.deepEqual(set.rows[0].client_claimed, { setFingerprint: 'client-side' });

    const solutions = await client.query<{
      candidate_index: number;
      assignment: string[][];
      candidate_fingerprint: string;
      client_claimed: Record<string, unknown>;
    }>(
      `select candidate_index, assignment, candidate_fingerprint, client_claimed
         from app_private.team_candidate_solutions where set_id = $1 order by candidate_index`,
      [commandId],
    );
    assert.equal(solutions.rows.length, 2);
    assert.deepEqual(solutions.rows[0].assignment, [[a, b].sort(), [c, d].sort()]);
    assert.deepEqual(solutions.rows[1].client_claimed, { score: 1, seed: 42 });
    assert.notEqual(
      solutions.rows[0].candidate_fingerprint,
      solutions.rows[1].candidate_fingerprint,
    );

    const receipt = await client.query(
      `select command_type, aggregate_id, retention_class, result
         from app_private.command_receipts where command_id = $1`,
      [commandId],
    );
    assert.equal(receipt.rows[0].command_type, 'publish_team_candidate_set');
    assert.equal(receipt.rows[0].aggregate_id, f.sessionId);
    assert.equal(receipt.rows[0].retention_class, 'TEAM_CANDIDATE_SET');
    assert.deepEqual(receipt.rows[0].result, result);
  });

  test('somente quem forma times publica: admin sem designacao, estranho e anonimo recebem 42501', async () => {
    const f = await fixture();
    const [a, b, c, d] = f.participants;
    const admin = await newUser('admin');
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'admin', 'active')`,
      [f.communityId, admin],
    );
    const outsider = await newUser('outsider');
    const set = setOf([
      [
        [a, b],
        [c, d],
      ],
    ]);
    for (const actor of [admin, outsider, null]) {
      assert.equal(await refusal(actor, f, set), '42501', `ator ${actor ?? 'anonimo'}`);
    }
    assert.equal(await setCount(f.sessionId), 0);
  });

  test('snapshot de outra Session e 23514; de elenco superado e 40001', async () => {
    const f = await fixture();
    const other = await fixture();
    const [a, b, c, d] = f.participants;
    const set = setOf([
      [
        [a, b],
        [c, d],
      ],
    ]);
    assert.equal(await refusal(f.ownerId, f, set, other.snapshotId), '23514');

    await materialize(f.sessionId, f.ownerId, f.playerIds, f.participants);
    assert.equal(await refusal(f.ownerId, f, set), '40001');
    assert.equal(await setCount(f.sessionId), 0);
  });

  test('candidato que nao e particao exata do elenco e recusado', async () => {
    const f = await fixture();
    const [a, b, c, d] = f.participants;
    const forged = randomUUID();
    for (const teams of [
      [[a, b], [c]],
      [
        [a, b],
        [c, forged],
      ],
      [
        [a, b, c],
        [c, d],
      ],
      [
        [a, b],
        [c, d, forged],
      ],
    ]) {
      assert.equal(await refusal(f.ownerId, f, setOf([teams])), '23514', JSON.stringify(teams));
    }
    assert.equal(await setCount(f.sessionId), 0);
  });

  test('contagem de times e de candidatos fora dos limites e recusada', async () => {
    const f = await fixture();
    const [a, b, c, d] = f.participants;
    const valid = [
      [a, b],
      [c, d],
    ];
    assert.equal(await refusal(f.ownerId, f, setOf([valid], { teamCount: 3 })), '23514');
    assert.equal(await refusal(f.ownerId, f, setOf([[[a], [b], [c], [d], []]])), '23514');
    assert.equal(await refusal(f.ownerId, f, setOf([[[a, b, c, d]]])), '23514');
    assert.equal(await refusal(f.ownerId, f, setOf([valid], { candidates: [] })), '23514');
    assert.equal(
      await refusal(f.ownerId, f, setOf(Array.from({ length: 9 }, () => valid))),
      '23514',
    );
    assert.equal(await refusal(f.ownerId, f, setOf([valid], { teamCount: '2' })), '23514');
    assert.equal(await setCount(f.sessionId), 0);
  });

  test('restricoes declaradas valem para quem esta no elenco e referencias orfas sao toleradas', async () => {
    const f = await fixture();
    const [a, b, c, d] = f.participants;
    const teams = [
      [a, b],
      [c, d],
    ];
    const orphan = randomUUID();
    const constraints = (value: Record<string, unknown>) => ({
      hardConstraints: {
        lockedParticipantTeams: {},
        pairsTogether: [],
        pairsSeparated: [],
        ...value,
      },
    });

    assert.equal(
      await refusal(f.ownerId, f, setOf([teams], constraints({ lockedParticipantTeams: { [a]: 1 } }))),
      '23514',
    );
    assert.equal(
      await refusal(f.ownerId, f, setOf([teams], constraints({ pairsTogether: [[a, c]] }))),
      '23514',
    );
    assert.equal(
      await refusal(f.ownerId, f, setOf([teams], constraints({ pairsSeparated: [[a, b]] }))),
      '23514',
    );
    assert.equal(
      await refusal(f.ownerId, f, setOf([teams], constraints({ pairsTogether: [[a]] }))),
      '23514',
    );

    const published = await publish(
      f.ownerId,
      f,
      setOf(
        [teams],
        constraints({
          lockedParticipantTeams: { [a]: 0, [orphan]: 1 },
          pairsTogether: [
            [a, b],
            [c, orphan],
          ],
          pairsSeparated: [
            [a, c],
            [b, orphan],
          ],
        }),
      ),
    );
    const { rows } = await client.query<{ hard_constraints: Record<string, unknown> }>(
      'select hard_constraints from app_private.team_candidate_sets where id = $1',
      [published.set_id],
    );
    assert.deepEqual(rows[0].hard_constraints, {
      lockedParticipantTeams: { [a]: 0, [orphan]: 1 },
      pairsTogether: [
        [a, b],
        [c, orphan],
      ],
      pairsSeparated: [
        [a, c],
        [b, orphan],
      ],
    });
  });

  test('replay devolve o mesmo resultado e comando novo com a mesma entrada iguala a impressao digital', async () => {
    const f = await fixture();
    const [a, b, c, d] = f.participants;
    const set = setOf([
      [
        [a, b],
        [c, d],
      ],
    ]);
    const commandId = randomUUID();
    const first = await publish(f.ownerId, f, set, commandId);
    const replayed = await publish(f.ownerId, f, set, commandId);
    assert.deepEqual(replayed, first);
    assert.equal(await setCount(f.sessionId), 1);

    const reordered = setOf([
      [
        [b, a],
        [d, c],
      ],
    ]);
    const second = await publish(f.ownerId, f, reordered);
    assert.notEqual(second.set_id, first.set_id);
    assert.equal(second.set_fingerprint, first.set_fingerprint);
    assert.equal(await setCount(f.sessionId), 2);
  });

  test('comando recusado nao deixa conjunto, solucao nem recibo', async () => {
    const f = await fixture();
    const [a, b, c] = f.participants;
    const commandId = randomUUID();
    const error = await asIdentity(client, f.ownerId, () =>
      client.query('select public.publish_team_candidate_set($1, $2, $3, $4::jsonb)', [
        commandId,
        f.sessionId,
        f.snapshotId,
        JSON.stringify(setOf([[[a, b], [c]]])),
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((error as { code?: string }).code, '23514');
    for (const sql of [
      'select count(*) from app_private.team_candidate_sets where id = $1',
      'select count(*) from app_private.team_candidate_solutions where set_id = $1',
      'select count(*) from app_private.command_receipts where command_id = $1',
    ]) {
      const { rows } = await client.query<{ count: string }>(sql, [commandId]);
      assert.equal(Number(rows[0].count), 0, sql);
    }
  });

  test('o artefato e privado ao navegador e imutavel, exceto created_by para null', async () => {
    const f = await fixture();
    const [a, b, c, d] = f.participants;
    const published = await publish(
      f.ownerId,
      f,
      setOf([
        [
          [a, b],
          [c, d],
        ],
      ]),
    );

    for (const statement of [
      'select * from app_private.team_candidate_sets',
      'select * from app_private.team_candidate_solutions',
      'delete from app_private.team_candidate_sets',
    ]) {
      const denied = await asIdentity(client, f.ownerId, () => client.query(statement)).catch(
        (thrown: Error) => thrown,
      );
      assert.equal((denied as { code?: string }).code, '42501', statement);
    }

    for (const statement of [
      "update app_private.team_candidate_sets set set_fingerprint = 'forjada' where id = $1",
      'delete from app_private.team_candidate_sets where id = $1',
      "update app_private.team_candidate_solutions set assignment = '[]'::jsonb where set_id = $1",
      'delete from app_private.team_candidate_solutions where set_id = $1',
    ]) {
      const blocked = await client
        .query(statement, [published.set_id])
        .catch((thrown: Error) => thrown);
      assert.equal((blocked as { code?: string }).code, '55000', statement);
    }

    const combined = await client
      .query(
        "update app_private.team_candidate_sets set created_by = null, set_fingerprint = 'x' where id = $1",
        [published.set_id],
      )
      .catch((thrown: Error) => thrown);
    assert.equal((combined as { code?: string }).code, '55000');

    await client.query('update app_private.team_candidate_sets set created_by = null where id = $1', [
      published.set_id,
    ]);
    const { rows } = await client.query<{ created_by: string | null; set_fingerprint: string }>(
      'select created_by, set_fingerprint from app_private.team_candidate_sets where id = $1',
      [published.set_id],
    );
    assert.equal(rows[0].created_by, null);
    assert.equal(rows[0].set_fingerprint, published.set_fingerprint);
  });
}
```

- [ ] **Step 2: Run the suite and watch it fail**

```bash
cd /c/Volley-xs-w6-03 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs teamCandidateSets.dbtest.ts 2>&1 | grep -E "^ℹ (tests|pass|fail)|does not exist" | head -5
```

Expected: every test fails with `function public.publish_team_candidate_set(...) does not exist` (the `before` hook passes because the migration file does not exist yet).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260917130000_team_candidate_sets.sql`:

```sql
-- XS-W6-03: an immutable, server-validated set of team candidates. The server checks the exact
-- partition of the snapshot and the constraints the client declares; it does not recompute scores.

create table app_private.team_candidate_sets (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete restrict,
  roster_revision_id uuid not null,
  snapshot_id uuid not null references app_private.balance_input_snapshots(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default pg_catalog.now(),
  team_count integer not null,
  hard_constraints jsonb not null,
  contract_version text not null,
  algorithm_version text not null,
  objective_policy_version text not null,
  set_fingerprint text not null,
  client_claimed jsonb not null,
  constraint team_candidate_sets_roster_fkey
    foreign key (roster_revision_id, session_id)
    references public.roster_revisions (id, session_id)
    on delete restrict,
  constraint team_candidate_sets_team_count_check check (team_count >= 2),
  constraint team_candidate_sets_constraints_object_check
    check (pg_catalog.jsonb_typeof(hard_constraints) = 'object'),
  constraint team_candidate_sets_claimed_object_check
    check (pg_catalog.jsonb_typeof(client_claimed) = 'object')
);

create index team_candidate_sets_session_idx
  on app_private.team_candidate_sets (session_id);
create index team_candidate_sets_roster_idx
  on app_private.team_candidate_sets (roster_revision_id, session_id);
create index team_candidate_sets_snapshot_idx
  on app_private.team_candidate_sets (snapshot_id);
create index team_candidate_sets_created_by_idx
  on app_private.team_candidate_sets (created_by);

create table app_private.team_candidate_solutions (
  set_id uuid not null references app_private.team_candidate_sets(id) on delete restrict,
  candidate_index integer not null,
  candidate_fingerprint text not null,
  assignment jsonb not null,
  client_claimed jsonb not null,
  primary key (set_id, candidate_index),
  constraint team_candidate_solutions_index_check check (candidate_index >= 0),
  constraint team_candidate_solutions_assignment_array_check
    check (pg_catalog.jsonb_typeof(assignment) = 'array'),
  constraint team_candidate_solutions_claimed_object_check
    check (pg_catalog.jsonb_typeof(client_claimed) = 'object')
);

alter table app_private.team_candidate_sets enable row level security;
alter table app_private.team_candidate_solutions enable row level security;
revoke all on table app_private.team_candidate_sets from public, anon, authenticated;
revoke all on table app_private.team_candidate_solutions from public, anon, authenticated;

create function app_private.reject_team_candidate_set_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.created_by is not null
     and new.created_by is null
     and (pg_catalog.to_jsonb(new) - 'created_by') = (pg_catalog.to_jsonb(old) - 'created_by') then
    return new;
  end if;
  raise exception 'Team candidate sets are immutable' using errcode = '55000';
end;
$$;

create trigger team_candidate_sets_immutable
  before update or delete on app_private.team_candidate_sets
  for each row execute function app_private.reject_team_candidate_set_mutation();

create function app_private.reject_team_candidate_solution_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Team candidate solutions are immutable' using errcode = '55000';
end;
$$;

create trigger team_candidate_solutions_immutable
  before update or delete on app_private.team_candidate_solutions
  for each row execute function app_private.reject_team_candidate_solution_mutation();

revoke all on function app_private.reject_team_candidate_set_mutation()
  from public, anon, authenticated;
revoke all on function app_private.reject_team_candidate_solution_mutation()
  from public, anon, authenticated;

create function app_private.team_index_of(p_teams jsonb, p_participant text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (t.ordinality - 1)::integer
    from pg_catalog.jsonb_array_elements(p_teams) with ordinality as t(team, ordinality)
   where exists (
     select 1
       from pg_catalog.jsonb_array_elements_text(t.team) as m(member)
      where m.member = p_participant
   )
   limit 1
$$;

revoke all on function app_private.team_index_of(jsonb, text) from public, anon, authenticated;

create function public.publish_team_candidate_set(
  p_command_id uuid,
  p_session_id uuid,
  p_snapshot_id uuid,
  p_set jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.sessions;
  v_snapshot app_private.balance_input_snapshots;
  v_revision_number integer;
  v_latest_revision integer;
  v_receipt jsonb;
  v_participants text[];
  v_team_count integer;
  v_constraints jsonb;
  v_locks jsonb;
  v_together jsonb;
  v_separated jsonb;
  v_normalized_constraints jsonb;
  v_set_claimed jsonb;
  v_candidate jsonb;
  v_teams jsonb;
  v_claimed jsonb;
  v_members text[];
  v_assignment jsonb;
  v_assignments jsonb[] := array[]::jsonb[];
  v_claims jsonb[] := array[]::jsonb[];
  v_fingerprints text[] := array[]::text[];
  v_set_fingerprint text;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_command_id is null or p_session_id is null or p_snapshot_id is null or p_set is null then
    raise exception 'command_id, session_id, snapshot_id and set are required'
      using errcode = '23514';
  end if;

  select * into v_session
    from public.sessions s
   where s.id = p_session_id
     and s.authority_model = 'target'
     and s.session_context = 'COMMUNITY'
   for update;
  if not found then
    raise exception 'Target Community Session not found' using errcode = 'P0002';
  end if;

  perform public.assert_target_session_write_authorized(v_session);

  v_receipt := app_private.find_command_receipt(
    p_command_id, 'publish_team_candidate_set', p_session_id
  );
  if v_receipt is not null then
    return v_receipt;
  end if;

  if v_session.lifecycle_status not in ('DRAFT', 'SCHEDULED') then
    raise exception 'Session must be DRAFT or SCHEDULED to publish team candidates'
      using errcode = '23514';
  end if;

  select * into v_snapshot
    from app_private.balance_input_snapshots s
   where s.id = p_snapshot_id
     and s.session_id = v_session.id;
  if not found then
    raise exception 'Balance input snapshot does not belong to this Session'
      using errcode = '23514';
  end if;

  select r.revision_number into v_revision_number
    from public.roster_revisions r
   where r.id = v_snapshot.roster_revision_id;
  select pg_catalog.max(r.revision_number) into v_latest_revision
    from public.roster_revisions r
   where r.session_id = v_session.id;
  if v_revision_number is distinct from v_latest_revision then
    raise exception 'Snapshot roster revision is not the current one' using errcode = '40001';
  end if;

  if pg_catalog.jsonb_typeof(p_set) <> 'object'
     or pg_catalog.jsonb_typeof(p_set -> 'candidates') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_set -> 'teamCount') is distinct from 'number'
     or (p_set ->> 'teamCount') !~ '^[0-9]{1,4}$' then
    raise exception 'Candidate set is malformed' using errcode = '23514';
  end if;
  if coalesce(p_set ->> 'contractVersion', '') = ''
     or coalesce(p_set ->> 'algorithmVersion', '') = ''
     or coalesce(p_set ->> 'objectivePolicyVersion', '') = '' then
    raise exception 'Candidate set versions are required' using errcode = '23514';
  end if;

  v_set_claimed := coalesce(p_set -> 'clientClaimed', '{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_set_claimed) <> 'object' then
    raise exception 'Candidate set claim is malformed' using errcode = '23514';
  end if;

  if pg_catalog.jsonb_array_length(p_set -> 'candidates') not between 1 and 8 then
    raise exception 'A candidate set carries between 1 and 8 candidates' using errcode = '23514';
  end if;

  select pg_catalog.array_agg(p.participant ->> 'participant_id' order by p.participant ->> 'participant_id')
    into v_participants
    from pg_catalog.jsonb_array_elements(v_snapshot.payload -> 'participants') as p(participant);

  v_team_count := (p_set ->> 'teamCount')::integer;
  if v_team_count < 2 or v_team_count > pg_catalog.cardinality(v_participants) then
    raise exception 'Team count is out of range' using errcode = '23514';
  end if;

  v_constraints := coalesce(p_set -> 'hardConstraints', '{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_constraints) <> 'object' then
    raise exception 'Hard constraints are malformed' using errcode = '23514';
  end if;
  v_locks := coalesce(v_constraints -> 'lockedParticipantTeams', '{}'::jsonb);
  v_together := coalesce(v_constraints -> 'pairsTogether', '[]'::jsonb);
  v_separated := coalesce(v_constraints -> 'pairsSeparated', '[]'::jsonb);
  if pg_catalog.jsonb_typeof(v_locks) <> 'object'
     or pg_catalog.jsonb_typeof(v_together) <> 'array'
     or pg_catalog.jsonb_typeof(v_separated) <> 'array' then
    raise exception 'Hard constraints are malformed' using errcode = '23514';
  end if;
  if exists (
    select 1
      from pg_catalog.jsonb_each(v_locks) as l(participant, team_index)
     where pg_catalog.jsonb_typeof(l.team_index) <> 'number'
        or (l.team_index #>> '{}') !~ '^[0-9]{1,4}$'
  ) then
    raise exception 'Locked participant teams are malformed' using errcode = '23514';
  end if;
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_together || v_separated) as pr(pair)
     where case
             when pg_catalog.jsonb_typeof(pr.pair) <> 'array' then true
             when pg_catalog.jsonb_array_length(pr.pair) <> 2 then true
             else pg_catalog.jsonb_typeof(pr.pair -> 0) <> 'string'
               or pg_catalog.jsonb_typeof(pr.pair -> 1) <> 'string'
           end
  ) then
    raise exception 'Constraint pairs are malformed' using errcode = '23514';
  end if;
  v_normalized_constraints := pg_catalog.jsonb_build_object(
    'lockedParticipantTeams', v_locks,
    'pairsTogether', v_together,
    'pairsSeparated', v_separated
  );

  for v_candidate in
    select c.candidate from pg_catalog.jsonb_array_elements(p_set -> 'candidates') as c(candidate)
  loop
    if pg_catalog.jsonb_typeof(v_candidate) <> 'object'
       or pg_catalog.jsonb_typeof(v_candidate -> 'teams') is distinct from 'array' then
      raise exception 'Candidate is malformed' using errcode = '23514';
    end if;
    v_teams := v_candidate -> 'teams';
    v_claimed := coalesce(v_candidate -> 'clientClaimed', '{}'::jsonb);
    if pg_catalog.jsonb_typeof(v_claimed) <> 'object' then
      raise exception 'Candidate claim is malformed' using errcode = '23514';
    end if;
    if pg_catalog.jsonb_array_length(v_teams) <> v_team_count then
      raise exception 'Candidate does not have the declared team count' using errcode = '23514';
    end if;
    if exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_teams) as t(team)
       where pg_catalog.jsonb_typeof(t.team) <> 'array'
    ) then
      raise exception 'Candidate teams are malformed' using errcode = '23514';
    end if;
    if exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_teams) as t(team),
             pg_catalog.jsonb_array_elements(t.team) as m(member)
       where pg_catalog.jsonb_typeof(m.member) <> 'string'
    ) then
      raise exception 'Candidate members are malformed' using errcode = '23514';
    end if;

    select pg_catalog.array_agg(m.member order by m.member)
      into v_members
      from pg_catalog.jsonb_array_elements(v_teams) as t(team),
           pg_catalog.jsonb_array_elements_text(t.team) as m(member);
    if v_members is distinct from v_participants then
      raise exception 'Candidate is not an exact partition of the snapshot participants'
        using errcode = '23514';
    end if;

    if exists (
      select 1
        from pg_catalog.jsonb_each(v_locks) as l(participant, team_index)
       where l.participant = any (v_participants)
         and app_private.team_index_of(v_teams, l.participant)
             is distinct from (l.team_index #>> '{}')::integer
    ) then
      raise exception 'Candidate breaks a locked participant' using errcode = '23514';
    end if;
    if exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_together) as pr(pair)
       where (pr.pair ->> 0) = any (v_participants)
         and (pr.pair ->> 1) = any (v_participants)
         and app_private.team_index_of(v_teams, pr.pair ->> 0)
             <> app_private.team_index_of(v_teams, pr.pair ->> 1)
    ) then
      raise exception 'Candidate splits a pair that must play together' using errcode = '23514';
    end if;
    if exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_separated) as pr(pair)
       where (pr.pair ->> 0) = any (v_participants)
         and (pr.pair ->> 1) = any (v_participants)
         and app_private.team_index_of(v_teams, pr.pair ->> 0)
             = app_private.team_index_of(v_teams, pr.pair ->> 1)
    ) then
      raise exception 'Candidate joins a pair that must be separated' using errcode = '23514';
    end if;

    select coalesce(
             pg_catalog.jsonb_agg(
               coalesce(
                 (select pg_catalog.jsonb_agg(m.member order by m.member)
                    from pg_catalog.jsonb_array_elements_text(t.team) as m(member)),
                 '[]'::jsonb
               )
               order by t.ordinality
             ),
             '[]'::jsonb
           )
      into v_assignment
      from pg_catalog.jsonb_array_elements(v_teams) with ordinality as t(team, ordinality);

    v_assignments := pg_catalog.array_append(v_assignments, v_assignment);
    v_claims := pg_catalog.array_append(v_claims, v_claimed);
    v_fingerprints := pg_catalog.array_append(v_fingerprints, pg_catalog.md5(v_assignment::text));
  end loop;

  v_set_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'snapshot_id', v_snapshot.id,
      'team_count', v_team_count,
      'hard_constraints', v_normalized_constraints,
      'contract_version', p_set ->> 'contractVersion',
      'algorithm_version', p_set ->> 'algorithmVersion',
      'objective_policy_version', p_set ->> 'objectivePolicyVersion',
      'candidates', pg_catalog.to_jsonb(v_fingerprints)
    )::text
  );

  insert into app_private.team_candidate_sets (
    id, session_id, roster_revision_id, snapshot_id, created_by, team_count, hard_constraints,
    contract_version, algorithm_version, objective_policy_version, set_fingerprint, client_claimed
  ) values (
    p_command_id, v_session.id, v_snapshot.roster_revision_id, v_snapshot.id, v_uid,
    v_team_count, v_normalized_constraints, p_set ->> 'contractVersion',
    p_set ->> 'algorithmVersion', p_set ->> 'objectivePolicyVersion', v_set_fingerprint,
    v_set_claimed
  );

  insert into app_private.team_candidate_solutions (
    set_id, candidate_index, candidate_fingerprint, assignment, client_claimed
  )
  select p_command_id, i - 1, v_fingerprints[i], v_assignments[i], v_claims[i]
    from pg_catalog.generate_subscripts(v_fingerprints, 1) as i;

  v_result := pg_catalog.jsonb_build_object(
    'set_id', p_command_id,
    'set_fingerprint', v_set_fingerprint
  );
  perform app_private.record_command_receipt(
    p_command_id, v_uid, 'publish_team_candidate_set', v_session.id, v_result, 'TEAM_CANDIDATE_SET'
  );

  return v_result;
end;
$$;

revoke all on function public.publish_team_candidate_set(uuid, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.publish_team_candidate_set(uuid, uuid, uuid, jsonb)
  to authenticated;
```

- [ ] **Step 4: Run the suite and watch it pass**

```bash
cd /c/Volley-xs-w6-03 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs teamCandidateSets.dbtest.ts 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖" | head -12
```

Expected: `ℹ tests 9`, `ℹ pass 9`, `ℹ fail 0`. If a test fails, read the message before changing any expectation; the expectations encode the spec.

- [ ] **Step 5: Format, lint and commit**

```bash
cd /c/Volley-xs-w6-03 && npx prettier --write src/test/db/teamCandidateSets.dbtest.ts > /dev/null && npx eslint --quiet src/test/db/teamCandidateSets.dbtest.ts && git add -- supabase/migrations/20260917130000_team_candidate_sets.sql src/test/db/teamCandidateSets.dbtest.ts && git commit -q -F - <<'EOF'
feat: publicar conjunto de candidatos validado pelo servidor

Duas tabelas privadas e imutaveis guardam o conjunto e as solucoes.
publish_team_candidate_set trava a Session, autoriza como a captura do
snapshot, exige o snapshot do elenco atual (40001 quando superado), de 1 a 8
candidatos com o numero de times declarado, particao exata dos participantes e
as restricoes declaradas, tolerando referencias orfas. Impressoes digitais sao
calculadas no servidor sobre a atribuicao normalizada; o que o cliente afirma
fica em client_claimed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: `read_team_candidate_set`

**Files:**

- Modify: `supabase/migrations/20260917130000_team_candidate_sets.sql` (append)
- Test: `src/test/db/teamCandidateSets.dbtest.ts` (new tests inside the `else` block)

**Interfaces:**

- Consumes: Task 1 tables and the `publish`, `fixture`, `setOf`, `newUser` helpers of the suite.
- Produces: `public.read_team_candidate_set(p_set_id uuid) returns jsonb` → `{ set_id, session_id, roster_revision_id, snapshot_id, published_at, team_count, hard_constraints, contract_version, algorithm_version, objective_policy_version, set_fingerprint, client_claimed, candidates: [{ candidate_index, candidate_fingerprint, assignment, client_claimed }] }`, candidates ordered by `candidate_index`.

- [ ] **Step 1: Write the failing tests**

In `src/test/db/teamCandidateSets.dbtest.ts`, replace:

```ts
    assert.equal(rows[0].created_by, null);
    assert.equal(rows[0].set_fingerprint, published.set_fingerprint);
  });
}
```

with:

```ts
    assert.equal(rows[0].created_by, null);
    assert.equal(rows[0].set_fingerprint, published.set_fingerprint);
  });

  test('a leitura devolve o conjunto com os candidatos em ordem para quem forma times', async () => {
    const f = await fixture();
    const [a, b, c, d] = f.participants;
    const published = await publish(
      f.ownerId,
      f,
      setOf([
        [
          [b, a],
          [c, d],
        ],
        [
          [a, c],
          [b, d],
        ],
      ]),
    );
    const { rows } = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{
        result: {
          set_id: string;
          session_id: string;
          snapshot_id: string;
          team_count: number;
          set_fingerprint: string;
          candidates: { candidate_index: number; assignment: string[][] }[];
        };
      }>('select public.read_team_candidate_set($1) as result', [published.set_id]),
    );
    const read = rows[0].result;
    assert.equal(read.set_id, published.set_id);
    assert.equal(read.session_id, f.sessionId);
    assert.equal(read.snapshot_id, f.snapshotId);
    assert.equal(read.team_count, 2);
    assert.equal(read.set_fingerprint, published.set_fingerprint);
    assert.deepEqual(
      read.candidates.map((candidate) => candidate.candidate_index),
      [0, 1],
    );
    assert.deepEqual(read.candidates[0].assignment, [[a, b].sort(), [c, d].sort()]);
  });

  test('ler exige quem forma times e um conjunto existente', async () => {
    const f = await fixture();
    const [a, b, c, d] = f.participants;
    const published = await publish(
      f.ownerId,
      f,
      setOf([
        [
          [a, b],
          [c, d],
        ],
      ]),
    );
    const outsider = await newUser('outsider');
    for (const actor of [outsider, null]) {
      const denied = await asIdentity(client, actor, () =>
        client.query('select public.read_team_candidate_set($1)', [published.set_id]),
      ).catch((thrown: Error) => thrown);
      assert.equal((denied as { code?: string }).code, '42501', `ator ${actor ?? 'anonimo'}`);
    }
    const missing = await asIdentity(client, f.ownerId, () =>
      client.query('select public.read_team_candidate_set($1)', [randomUUID()]),
    ).catch((thrown: Error) => thrown);
    assert.equal((missing as { code?: string }).code, 'P0002');
  });
}
```

- [ ] **Step 2: Run the suite and watch the two new tests fail**

```bash
cd /c/Volley-xs-w6-03 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs teamCandidateSets.dbtest.ts 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖" | head -8
```

Expected: `ℹ tests 11`, `ℹ fail 2`, both with `function public.read_team_candidate_set(unknown) does not exist`.

- [ ] **Step 3: Append the read function to the migration**

Append to `supabase/migrations/20260917130000_team_candidate_sets.sql`:

```sql
create function public.read_team_candidate_set(p_set_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_set app_private.team_candidate_sets;
  v_session public.sessions;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_set_id is null then
    raise exception 'set_id is required' using errcode = '23514';
  end if;

  select * into v_set from app_private.team_candidate_sets s where s.id = p_set_id;
  if not found then
    raise exception 'Team candidate set not found' using errcode = 'P0002';
  end if;

  select * into v_session from public.sessions s where s.id = v_set.session_id;
  perform public.assert_target_session_write_authorized(v_session);

  return pg_catalog.jsonb_build_object(
    'set_id', v_set.id,
    'session_id', v_set.session_id,
    'roster_revision_id', v_set.roster_revision_id,
    'snapshot_id', v_set.snapshot_id,
    'published_at', v_set.published_at,
    'team_count', v_set.team_count,
    'hard_constraints', v_set.hard_constraints,
    'contract_version', v_set.contract_version,
    'algorithm_version', v_set.algorithm_version,
    'objective_policy_version', v_set.objective_policy_version,
    'set_fingerprint', v_set.set_fingerprint,
    'client_claimed', v_set.client_claimed,
    'candidates', coalesce(
      (select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'candidate_index', c.candidate_index,
                  'candidate_fingerprint', c.candidate_fingerprint,
                  'assignment', c.assignment,
                  'client_claimed', c.client_claimed
                )
                order by c.candidate_index
              )
         from app_private.team_candidate_solutions c
        where c.set_id = v_set.id),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.read_team_candidate_set(uuid) from public, anon;
grant execute on function public.read_team_candidate_set(uuid) to authenticated;
```

- [ ] **Step 4: Run the suite and watch it pass**

```bash
cd /c/Volley-xs-w6-03 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test node scripts/db-harness.mjs teamCandidateSets.dbtest.ts 2>&1 | grep -E "^ℹ (tests|pass|fail)|^✖" | head -8
```

Expected: `ℹ tests 11`, `ℹ pass 11`, `ℹ fail 0`.

- [ ] **Step 5: Format, lint and commit**

```bash
cd /c/Volley-xs-w6-03 && npx prettier --write src/test/db/teamCandidateSets.dbtest.ts > /dev/null && npx eslint --quiet src/test/db/teamCandidateSets.dbtest.ts && git add -- supabase/migrations/20260917130000_team_candidate_sets.sql src/test/db/teamCandidateSets.dbtest.ts && git commit -q -F - <<'EOF'
feat: ler conjunto de candidatos publicado

read_team_candidate_set devolve o conjunto com as solucoes em ordem, para quem
pode formar times na Session.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Shared types, cloud service and gateway

**Files:**

- Create: `src/shared/types/teamCandidateSet.ts`
- Modify: `src/types.ts` (export the new types)
- Create: `src/infra/supabase/teamCandidateSetCloudService.ts`
- Test: `src/infra/supabase/teamCandidateSetCloudService.test.ts`
- Modify: `src/application/authorizedFormationGateways.ts` (add `TeamCandidateSetGateway`)

**Interfaces:**

- Consumes: `RpcClient` from `src/infra/supabase/sessionCohortCloudService.ts`; `RosterRevisionRead` from `src/application/authorizedFormationGateways.ts`.
- Produces:
  - types `TeamCandidateSetConstraints`, `TeamCandidatePayload`, `TeamCandidateSetPayload`, `PublishTeamCandidateSetRequest`, `PublishedTeamCandidateSet`, `TeamCandidateSetRead`, `CandidateSetPublicationState` exported from `@shared/types`;
  - `createTeamCandidateSetCloudService(client: RpcClient): TeamCandidateSetCloudService` with `publish(input: PublishTeamCandidateSetRequest): Promise<PublishedTeamCandidateSet>` and `read(setId: string): Promise<TeamCandidateSetRead>`; singleton `teamCandidateSetCloudService`;
  - `interface TeamCandidateSetGateway { readRosterRevision(rosterRevisionId: string): Promise<RosterRevisionRead>; publish(input: PublishTeamCandidateSetRequest): Promise<PublishedTeamCandidateSet>; }`.

- [ ] **Step 1: Create the shared types**

Create `src/shared/types/teamCandidateSet.ts`:

```ts
export interface TeamCandidateSetConstraints {
  readonly lockedParticipantTeams: Readonly<Record<string, number>>;
  readonly pairsTogether: readonly (readonly [string, string])[];
  readonly pairsSeparated: readonly (readonly [string, string])[];
}

export interface TeamCandidatePayload {
  readonly teams: readonly (readonly string[])[];
  readonly clientClaimed: Readonly<Record<string, unknown>>;
}

export interface TeamCandidateSetPayload {
  readonly teamCount: number;
  readonly contractVersion: string;
  readonly algorithmVersion: string;
  readonly objectivePolicyVersion: string;
  readonly hardConstraints: TeamCandidateSetConstraints;
  readonly clientClaimed: Readonly<Record<string, unknown>>;
  readonly candidates: readonly TeamCandidatePayload[];
}

export interface PublishTeamCandidateSetRequest {
  readonly commandId: string;
  readonly sessionId: string;
  readonly snapshotId: string;
  readonly set: TeamCandidateSetPayload;
}

export interface PublishedTeamCandidateSet {
  readonly setId: string;
  readonly setFingerprint: string;
}

export interface TeamCandidateSetRead {
  readonly setId: string;
  readonly sessionId: string;
  readonly rosterRevisionId: string;
  readonly snapshotId: string;
  readonly teamCount: number;
  readonly setFingerprint: string;
  readonly candidates: readonly {
    readonly candidateIndex: number;
    readonly candidateFingerprint: string;
    readonly assignment: readonly (readonly string[])[];
  }[];
}

export type CandidateSetPublicationState = 'idle' | 'publishing' | 'published' | 'error';
```

In `src/types.ts`, replace:

```ts
export type {
  AuthorizedFormationProgress,
  AuthorizedFormationStage,
} from './shared/types/authorizedFormation';
```

with:

```ts
export type {
  AuthorizedFormationProgress,
  AuthorizedFormationStage,
} from './shared/types/authorizedFormation';
export type {
  CandidateSetPublicationState,
  PublishedTeamCandidateSet,
  PublishTeamCandidateSetRequest,
  TeamCandidatePayload,
  TeamCandidateSetConstraints,
  TeamCandidateSetPayload,
  TeamCandidateSetRead,
} from './shared/types/teamCandidateSet';
```

- [ ] **Step 2: Write the failing service tests**

Create `src/infra/supabase/teamCandidateSetCloudService.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TeamCandidateSetPayload } from '@shared/types';
import { createTeamCandidateSetCloudService } from './teamCandidateSetCloudService';

function recording(data: unknown, error: { code?: string; message: string } | null = null) {
  const calls: [string, Record<string, unknown>][] = [];
  const service = createTeamCandidateSetCloudService({
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data, error };
    },
  });
  return { service, calls };
}

const SET: TeamCandidateSetPayload = {
  teamCount: 2,
  contractVersion: 'v1',
  algorithmVersion: 'simulated-annealing-v1',
  objectivePolicyVersion: 'v0-legacy-weights',
  hardConstraints: { lockedParticipantTeams: {}, pairsTogether: [], pairsSeparated: [] },
  clientClaimed: {},
  candidates: [{ teams: [['p-1'], ['p-2']], clientClaimed: { score: 1 } }],
};

test('publish sends command, session, snapshot and set and returns the set id and fingerprint', async () => {
  const { service, calls } = recording({ set_id: 'c-1', set_fingerprint: 'abc' });
  const published = await service.publish({
    commandId: 'c-1',
    sessionId: 's-1',
    snapshotId: 'snap-1',
    set: SET,
  });
  assert.deepEqual(published, { setId: 'c-1', setFingerprint: 'abc' });
  assert.deepEqual(calls, [
    [
      'publish_team_candidate_set',
      { p_command_id: 'c-1', p_session_id: 's-1', p_snapshot_id: 'snap-1', p_set: SET },
    ],
  ]);
});

test('read parses the set and its candidates', async () => {
  const { service, calls } = recording({
    set_id: 'set-1',
    session_id: 's-1',
    roster_revision_id: 'r-1',
    snapshot_id: 'snap-1',
    team_count: 2,
    set_fingerprint: 'abc',
    candidates: [
      { candidate_index: 0, candidate_fingerprint: 'f0', assignment: [['p-1'], ['p-2']] },
    ],
  });
  const read = await service.read('set-1');
  assert.deepEqual(calls, [['read_team_candidate_set', { p_set_id: 'set-1' }]]);
  assert.deepEqual(read, {
    setId: 'set-1',
    sessionId: 's-1',
    rosterRevisionId: 'r-1',
    snapshotId: 'snap-1',
    teamCount: 2,
    setFingerprint: 'abc',
    candidates: [{ candidateIndex: 0, candidateFingerprint: 'f0', assignment: [['p-1'], ['p-2']] }],
  });
});

test('an RPC error is thrown as is and a malformed response is refused', async () => {
  const failing = recording(null, { code: '40001', message: 'stale' });
  await assert.rejects(
    failing.service.publish({ commandId: 'c', sessionId: 's', snapshotId: 'n', set: SET }),
    { code: '40001' },
  );

  const malformed = recording({ set_id: 'c' });
  await assert.rejects(
    malformed.service.publish({ commandId: 'c', sessionId: 's', snapshotId: 'n', set: SET }),
    /Invalid publish_team_candidate_set response/,
  );

  const badRead = recording({
    set_id: 'set-1',
    session_id: 's-1',
    roster_revision_id: 'r-1',
    snapshot_id: 'snap-1',
    team_count: 2,
    set_fingerprint: 'abc',
    candidates: [{ candidate_index: 0, candidate_fingerprint: 'f0', assignment: [[1]] }],
  });
  await assert.rejects(badRead.service.read('set-1'), /Invalid read_team_candidate_set response/);
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-03 && node --import tsx --test src/infra/supabase/teamCandidateSetCloudService.test.ts 2>&1 | grep -E "^ℹ (pass|fail)|Cannot find module" | head -3
```

Expected: FAIL, `Cannot find module './teamCandidateSetCloudService'`.

- [ ] **Step 4: Implement the service and the gateway type**

Create `src/infra/supabase/teamCandidateSetCloudService.ts`:

```ts
import type {
  PublishedTeamCandidateSet,
  PublishTeamCandidateSetRequest,
  TeamCandidateSetRead,
} from '@shared/types';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { RpcClient } from './sessionCohortCloudService';

export interface TeamCandidateSetCloudService {
  publish(input: PublishTeamCandidateSetRequest): Promise<PublishedTeamCandidateSet>;
  read(setId: string): Promise<TeamCandidateSetRead>;
}

function invalid(label: string): Error {
  return new Error(`Invalid ${label} response`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(label);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(label);
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid(label);
  return value;
}

function assignment(value: unknown, label: string): string[][] {
  if (
    !Array.isArray(value) ||
    !value.every((team) => Array.isArray(team) && team.every((id) => typeof id === 'string'))
  ) {
    throw invalid(label);
  }
  return value as string[][];
}

export function createTeamCandidateSetCloudService(
  client: RpcClient,
): TeamCandidateSetCloudService {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  return {
    async publish(input) {
      const label = 'publish_team_candidate_set';
      const row = record(
        await call(label, {
          p_command_id: input.commandId,
          p_session_id: input.sessionId,
          p_snapshot_id: input.snapshotId,
          p_set: input.set,
        }),
        label,
      );
      return {
        setId: text(row.set_id, label),
        setFingerprint: text(row.set_fingerprint, label),
      };
    },
    async read(setId) {
      const label = 'read_team_candidate_set';
      const row = record(await call(label, { p_set_id: setId }), label);
      if (!Array.isArray(row.candidates)) throw invalid(label);
      return {
        setId: text(row.set_id, label),
        sessionId: text(row.session_id, label),
        rosterRevisionId: text(row.roster_revision_id, label),
        snapshotId: text(row.snapshot_id, label),
        teamCount: integer(row.team_count, label),
        setFingerprint: text(row.set_fingerprint, label),
        candidates: row.candidates.map((value) => {
          const candidate = record(value, label);
          return {
            candidateIndex: integer(candidate.candidate_index, label),
            candidateFingerprint: text(candidate.candidate_fingerprint, label),
            assignment: assignment(candidate.assignment, label),
          };
        }),
      };
    },
  };
}

export const teamCandidateSetCloudService: TeamCandidateSetCloudService = isSupabaseConfigured
  ? createTeamCandidateSetCloudService(supabase)
  : createTeamCandidateSetCloudService({
      rpc: async () => {
        throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
      },
    });
```

In `src/application/authorizedFormationGateways.ts`, replace:

```ts
import type { BalanceInputSnapshot, BalanceInputSnapshotCaptureRequest } from '@shared/types';
```

with:

```ts
import type {
  BalanceInputSnapshot,
  BalanceInputSnapshotCaptureRequest,
  PublishedTeamCandidateSet,
  PublishTeamCandidateSetRequest,
} from '@shared/types';
```

Append to `src/application/authorizedFormationGateways.ts`:

```ts
export interface TeamCandidateSetGateway {
  readRosterRevision(rosterRevisionId: string): Promise<RosterRevisionRead>;
  publish(input: PublishTeamCandidateSetRequest): Promise<PublishedTeamCandidateSet>;
}
```

- [ ] **Step 5: Run the tests, typecheck and lint**

```bash
cd /c/Volley-xs-w6-03 && npx prettier --write src/shared/types/teamCandidateSet.ts src/types.ts src/infra/supabase/teamCandidateSetCloudService.ts src/infra/supabase/teamCandidateSetCloudService.test.ts src/application/authorizedFormationGateways.ts > /dev/null && node --import tsx --test src/infra/supabase/teamCandidateSetCloudService.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/shared/types/teamCandidateSet.ts src/infra/supabase/teamCandidateSetCloudService.ts src/infra/supabase/teamCandidateSetCloudService.test.ts src/application/authorizedFormationGateways.ts
```

Expected: `ℹ pass 3`, `ℹ fail 0`; typecheck silent; no ESLint errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-xs-w6-03 && git add -- src/shared/types/teamCandidateSet.ts src/types.ts src/infra/supabase/teamCandidateSetCloudService.ts src/infra/supabase/teamCandidateSetCloudService.test.ts src/application/authorizedFormationGateways.ts && git commit -q -F - <<'EOF'
feat: servico de nuvem do conjunto de candidatos

Tipos compartilhados do conjunto publicado, servico que chama
publish_team_candidate_set e read_team_candidate_set conferindo o formato da
resposta, e o gateway que o caso de uso de publicacao vai consumir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Map divisions to a candidate set payload

**Files:**

- Create: `src/application/teamCandidateSetMapper.ts`
- Test: `src/application/teamCandidateSetMapper.test.ts`

**Interfaces:**

- Consumes: `TeamCandidateSetPayload` (Task 3); `RosterRevisionRead` (`entries: { participantId, identityKind, playerId }[]`); `Division.teams[].playerIds` (local Player ids); `BalanceConstraints` (`lockedPlayerIdxs`, `pairsTogether`, `pairsSeparated`, keyed by local Player ids); `TEAM_FORMATION_CONTRACT_VERSION`, `TEAM_FORMATION_OBJECTIVE_POLICY` from `@shared/types`; `BALANCE_ALGORITHM_VERSION` from `src/logic/balancing.ts`.
- Produces: `buildTeamCandidateSetPayload(input: CandidateSetMappingInput): CandidateSetMapping` where `CandidateSetMappingInput = { divisions: readonly Division[]; constraints: BalanceConstraints | undefined; roster: RosterRevisionRead; players: readonly Player[] }` and `CandidateSetMapping = { ok: true; set: TeamCandidateSetPayload } | { ok: false; unmappedPlayerIds: string[] }`.

- [ ] **Step 1: Write the failing tests**

Create `src/application/teamCandidateSetMapper.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Division, Player } from '@shared/types';
import { makePlayer } from '../test/fixtures';
import type { RosterRevisionRead } from './authorizedFormationGateways';
import { buildTeamCandidateSetPayload } from './teamCandidateSetMapper';

const players: Player[] = ['a', 'b', 'c', 'd'].map((id) =>
  makePlayer(id, { cloudId: `CLOUD-${id}` }),
);

const roster: RosterRevisionRead = {
  rosterRevisionId: 'r-1',
  sessionId: 's-1',
  entries: ['a', 'b', 'c', 'd'].map((id) => ({
    participantId: `p-${id}`,
    identityKind: 'PLAYER' as const,
    playerId: `cloud-${id}`,
  })),
};

function division(teams: string[][], score: number): Division {
  return {
    teams: teams.map((playerIds, index) => ({ id: `t-${index}`, playerIds })),
    score,
    penalty: 0,
    seed: 7,
    iterations: 100,
    qualityLabel: 'GOOD',
    algorithm: 'simulated-annealing-v1',
  } as unknown as Division;
}

test('maps teams and constraints to participant ids and drops orphan constraints', () => {
  const mapping = buildTeamCandidateSetPayload({
    divisions: [
      division(
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
        0.5,
      ),
      division(
        [
          ['a', 'c'],
          ['b', 'd'],
        ],
        0.7,
      ),
    ],
    constraints: {
      lockedPlayerIdxs: { a: 0, ghost: 1 },
      pairsTogether: [
        ['a', 'b'],
        ['c', 'ghost'],
      ],
      pairsSeparated: [['a', 'd']],
    },
    roster,
    players,
  });

  assert.equal(mapping.ok, true);
  if (!mapping.ok) return;
  assert.deepEqual(mapping.set, {
    teamCount: 2,
    contractVersion: 'v1',
    algorithmVersion: 'simulated-annealing-v1',
    objectivePolicyVersion: 'v0-legacy-weights',
    hardConstraints: {
      lockedParticipantTeams: { 'p-a': 0 },
      pairsTogether: [['p-a', 'p-b']],
      pairsSeparated: [['p-a', 'p-d']],
    },
    clientClaimed: { candidateCount: 2 },
    candidates: [
      {
        teams: [
          ['p-a', 'p-b'],
          ['p-c', 'p-d'],
        ],
        clientClaimed: {
          score: 0.5,
          penalty: 0,
          seed: 7,
          iterations: 100,
          qualityLabel: 'GOOD',
          algorithm: 'simulated-annealing-v1',
        },
      },
      {
        teams: [
          ['p-a', 'p-c'],
          ['p-b', 'p-d'],
        ],
        clientClaimed: {
          score: 0.7,
          penalty: 0,
          seed: 7,
          iterations: 100,
          qualityLabel: 'GOOD',
          algorithm: 'simulated-annealing-v1',
        },
      },
    ],
  });
});

test('refuses a team member without a participant, including a Player never synced', () => {
  const unsynced = makePlayer('e');
  const mapping = buildTeamCandidateSetPayload({
    divisions: [
      division(
        [
          ['a', 'b', 'e'],
          ['c', 'd', 'x'],
        ],
        1,
      ),
    ],
    constraints: undefined,
    roster,
    players: [...players, unsynced],
  });
  assert.deepEqual(mapping, { ok: false, unmappedPlayerIds: ['e', 'x'] });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-03 && node --import tsx --test src/application/teamCandidateSetMapper.test.ts 2>&1 | grep -E "^ℹ (pass|fail)|Cannot find module" | head -3
```

Expected: FAIL, `Cannot find module './teamCandidateSetMapper'`.

- [ ] **Step 3: Implement the mapper**

Create `src/application/teamCandidateSetMapper.ts`:

```ts
import {
  TEAM_FORMATION_CONTRACT_VERSION,
  TEAM_FORMATION_OBJECTIVE_POLICY,
  type BalanceConstraints,
  type Division,
  type Player,
  type TeamCandidateSetPayload,
} from '@shared/types';
import { BALANCE_ALGORITHM_VERSION } from '../logic/balancing';
import type { RosterRevisionRead } from './authorizedFormationGateways';

export interface CandidateSetMappingInput {
  readonly divisions: readonly Division[];
  readonly constraints: BalanceConstraints | undefined;
  readonly roster: RosterRevisionRead;
  readonly players: readonly Player[];
}

export type CandidateSetMapping =
  | { readonly ok: true; readonly set: TeamCandidateSetPayload }
  | { readonly ok: false; readonly unmappedPlayerIds: string[] };

export function buildTeamCandidateSetPayload(input: CandidateSetMappingInput): CandidateSetMapping {
  const participantByCloudId = new Map<string, string>();
  for (const entry of input.roster.entries) {
    if (entry.playerId) participantByCloudId.set(entry.playerId.toLowerCase(), entry.participantId);
  }
  const participantByPlayerId = new Map<string, string>();
  for (const player of input.players) {
    const participantId = player.cloudId
      ? participantByCloudId.get(player.cloudId.toLowerCase())
      : undefined;
    if (participantId) participantByPlayerId.set(player.id, participantId);
  }

  const unmapped = new Set<string>();
  const candidates = input.divisions.map((division) => ({
    teams: division.teams.map((team) =>
      team.playerIds.map((playerId) => {
        const participantId = participantByPlayerId.get(playerId);
        if (!participantId) unmapped.add(playerId);
        return participantId ?? '';
      }),
    ),
    clientClaimed: {
      score: division.score,
      penalty: division.penalty,
      seed: division.seed ?? null,
      iterations: division.iterations ?? null,
      qualityLabel: division.qualityLabel ?? null,
      algorithm: division.algorithm ?? null,
    },
  }));
  if (unmapped.size > 0) return { ok: false, unmappedPlayerIds: [...unmapped] };

  const lockedParticipantTeams: Record<string, number> = {};
  for (const [playerId, teamIndex] of Object.entries(input.constraints?.lockedPlayerIdxs ?? {})) {
    const participantId = participantByPlayerId.get(playerId);
    if (participantId) lockedParticipantTeams[participantId] = teamIndex;
  }
  const pairs = (list: [string, string][] | undefined): [string, string][] =>
    (list ?? []).flatMap(([left, right]) => {
      const first = participantByPlayerId.get(left);
      const second = participantByPlayerId.get(right);
      return first && second ? [[first, second] as [string, string]] : [];
    });

  return {
    ok: true,
    set: {
      teamCount: input.divisions[0]?.teams.length ?? 0,
      contractVersion: TEAM_FORMATION_CONTRACT_VERSION,
      algorithmVersion: BALANCE_ALGORITHM_VERSION,
      objectivePolicyVersion: TEAM_FORMATION_OBJECTIVE_POLICY,
      hardConstraints: {
        lockedParticipantTeams,
        pairsTogether: pairs(input.constraints?.pairsTogether),
        pairsSeparated: pairs(input.constraints?.pairsSeparated),
      },
      clientClaimed: { candidateCount: candidates.length },
      candidates,
    },
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd /c/Volley-xs-w6-03 && npx prettier --write src/application/teamCandidateSetMapper.ts src/application/teamCandidateSetMapper.test.ts > /dev/null && node --import tsx --test src/application/teamCandidateSetMapper.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/application/teamCandidateSetMapper.ts src/application/teamCandidateSetMapper.test.ts && npm run check:architecture > /dev/null && echo ARCH ok
```

Expected: `ℹ pass 2`, `ℹ fail 0`; typecheck silent; no ESLint errors; `ARCH ok`.

- [ ] **Step 5: Commit**

```bash
cd /c/Volley-xs-w6-03 && git add -- src/application/teamCandidateSetMapper.ts src/application/teamCandidateSetMapper.test.ts && git commit -q -F - <<'EOF'
feat: traduzir divisoes para o conjunto de candidatos do elenco

O sorteio roda com ids locais; o mapeador troca times e restricoes pelos
participantes da revisao de elenco. Atleta de time sem participante recusa o
mapeamento; restricao que cita quem nao esta no elenco e descartada, como o
motor ja ignora.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Resumable publish use case

**Files:**

- Modify: `src/shared/types/authorizedFormation.ts` (add `publishedCandidateSetId`)
- Create: `src/application/teamCandidateSetUseCases.ts`
- Test: `src/application/teamCandidateSetUseCases.test.ts`

**Interfaces:**

- Consumes: `TeamCandidateSetGateway` (Task 3), `teamCandidateSetCloudService` (Task 3), `sessionCohortCloudService.readRosterRevision`, `buildTeamCandidateSetPayload` (Task 4), `AuthorizedFormationFailure` and `classifyAuthorizedFormationFailure` from `src/application/authorizedTeamFormationRules.ts`, `appOk`, `productError`, `AppResult` from `src/application/appResult.ts`.
- Produces:
  - `AuthorizedFormationProgress.publishedCandidateSetId?: string`;
  - `publishTeamCandidateSet(input: PublishCandidateSetInput, gateway?: TeamCandidateSetGateway): Promise<PublishCandidateSetOutput>` with `PublishCandidateSetInput = { session: Session; divisions: readonly Division[]; players: readonly Player[]; createId: () => string; onSessionChange?: (session: Session) => void }` and `PublishCandidateSetOutput = { session: Session; result: AppResult<PublishedTeamCandidateSet> }`;
  - `clearCandidateSetPublication(session: Session): Session`;
  - `defaultTeamCandidateSetGateway: TeamCandidateSetGateway`.

- [ ] **Step 1: Add the progress field**

In `src/shared/types/authorizedFormation.ts`, replace:

```ts
  readonly snapshotRosterRevisionId?: string;
```

with:

```ts
  readonly snapshotRosterRevisionId?: string;
  readonly publishedCandidateSetId?: string;
```

- [ ] **Step 2: Write the failing tests**

Create `src/application/teamCandidateSetUseCases.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  Division,
  Player,
  PublishTeamCandidateSetRequest,
  Session,
} from '@shared/types';
import { makePlayer, makeSession } from '../test/fixtures';
import type { RosterRevisionRead, TeamCandidateSetGateway } from './authorizedFormationGateways';
import {
  clearCandidateSetPublication,
  publishTeamCandidateSet,
} from './teamCandidateSetUseCases';

const coded = (code: string) => Object.assign(new Error(code), { code });

const players: Player[] = ['a', 'b', 'c', 'd'].map((id) =>
  makePlayer(id, { cloudId: `cloud-${id}` }),
);

const roster: RosterRevisionRead = {
  rosterRevisionId: 'r-1',
  sessionId: 'cloud-session',
  entries: ['a', 'b', 'c', 'd'].map((id) => ({
    participantId: `p-${id}`,
    identityKind: 'PLAYER' as const,
    playerId: `cloud-${id}`,
  })),
};

const divisions = [
  {
    teams: [{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }],
    score: 1,
    penalty: 0,
  },
] as unknown as Division[];

function authorizedSession(overrides: Partial<Session> = {}): Session {
  return makeSession('session-1', {
    communityId: 'community-1',
    cloudId: 'cloud-session',
    authorityModel: 'target',
    authorizedFormation: {
      snapshotId: 'snap-1',
      snapshotRosterRevisionId: 'r-1',
      pendingCommandIds: {},
    },
    ...overrides,
  });
}

function fakeGateway(failures: unknown[] = []) {
  const published: PublishTeamCandidateSetRequest[] = [];
  const rosterReads: string[] = [];
  const gateway: TeamCandidateSetGateway = {
    async readRosterRevision(id) {
      rosterReads.push(id);
      return roster;
    },
    async publish(input) {
      published.push(input);
      if (failures.length > 0) throw failures.shift();
      return { setId: input.commandId, setFingerprint: 'fp' };
    },
  };
  return { gateway, published, rosterReads };
}

test('publishes the mapped set and records the published set id', async () => {
  const { gateway, published, rosterReads } = fakeGateway();
  const changes: Session[] = [];
  const output = await publishTeamCandidateSet(
    {
      session: authorizedSession(),
      divisions,
      players,
      createId: () => 'command-1',
      onSessionChange: (session) => changes.push(session),
    },
    gateway,
  );

  assert.deepEqual(output.result, { ok: true, value: { setId: 'command-1', setFingerprint: 'fp' } });
  assert.deepEqual(rosterReads, ['r-1']);
  assert.equal(published[0].commandId, 'command-1');
  assert.equal(published[0].sessionId, 'cloud-session');
  assert.equal(published[0].snapshotId, 'snap-1');
  assert.deepEqual(published[0].set.candidates[0].teams, [
    ['p-a', 'p-b'],
    ['p-c', 'p-d'],
  ]);
  assert.equal(changes[0].authorizedFormation?.pendingCommandIds.publishCandidateSet, 'command-1');
  assert.equal(output.session.authorizedFormation?.publishedCandidateSetId, 'command-1');
  assert.deepEqual(output.session.authorizedFormation?.pendingCommandIds, {});
});

test('a failed publish keeps the command id so the retry replays it', async () => {
  const { gateway, published } = fakeGateway([new TypeError('Failed to fetch')]);
  let next = 0;
  const createId = () => `command-${(next += 1)}`;

  const first = await publishTeamCandidateSet(
    { session: authorizedSession(), divisions, players, createId },
    gateway,
  );
  assert.equal(first.result.ok, false);
  if (!first.result.ok) {
    assert.equal(
      first.result.error.message,
      'Sem conexão com a nuvem. Sessões de comunidade precisam de internet para gerar os times.',
    );
  }

  const second = await publishTeamCandidateSet(
    { session: first.session, divisions, players, createId },
    gateway,
  );
  assert.equal(second.result.ok, true);
  assert.deepEqual(
    published.map((input) => input.commandId),
    ['command-1', 'command-1'],
  );
});

test('a superseded roster is explained as a change on another device', async () => {
  const { gateway } = fakeGateway([coded('40001')]);
  const output = await publishTeamCandidateSet(
    { session: authorizedSession(), divisions, players, createId: () => 'c' },
    gateway,
  );
  assert.equal(output.result.ok, false);
  if (!output.result.ok) {
    assert.equal(output.result.error.message, 'O elenco mudou em outro aparelho. Tente de novo.');
  }
});

test('a team member without a participant is refused before publishing', async () => {
  const { gateway, published } = fakeGateway();
  const output = await publishTeamCandidateSet(
    {
      session: authorizedSession(),
      divisions: [
        { teams: [{ playerIds: ['a', 'x'] }, { playerIds: ['c', 'd'] }], score: 1, penalty: 0 },
      ] as unknown as Division[],
      players,
      createId: () => 'c',
    },
    gateway,
  );
  assert.equal(output.result.ok, false);
  if (!output.result.ok) {
    assert.equal(
      output.result.error.message,
      'Não foi possível ligar o elenco autorizado aos atletas deste aparelho. Sincronize e tente de novo.',
    );
  }
  assert.equal(published.length, 0);
});

test('without an authorized snapshot there is nothing to publish', async () => {
  const { gateway, published, rosterReads } = fakeGateway();
  const output = await publishTeamCandidateSet(
    {
      session: authorizedSession({ authorizedFormation: { pendingCommandIds: {} } }),
      divisions,
      players,
      createId: () => 'c',
    },
    gateway,
  );
  assert.equal(output.result.ok, false);
  if (!output.result.ok) {
    assert.equal(
      output.result.error.message,
      'Gere os times pela comunidade antes de publicar.',
    );
  }
  assert.equal(published.length + rosterReads.length, 0);
});

test('clearing the publication drops the set id and the pending command only', () => {
  const session = authorizedSession({
    authorizedFormation: {
      snapshotId: 'snap-1',
      snapshotRosterRevisionId: 'r-1',
      publishedCandidateSetId: 'set-1',
      pendingCommandIds: { publishCandidateSet: 'c-1', captureSnapshot: 'c-2' },
    },
  });
  const cleared = clearCandidateSetPublication(session);
  assert.deepEqual(cleared.authorizedFormation, {
    snapshotId: 'snap-1',
    snapshotRosterRevisionId: 'r-1',
    pendingCommandIds: { captureSnapshot: 'c-2' },
  });

  const untouched = authorizedSession();
  assert.equal(clearCandidateSetPublication(untouched), untouched);
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-03 && node --import tsx --test src/application/teamCandidateSetUseCases.test.ts 2>&1 | grep -E "^ℹ (pass|fail)|Cannot find module" | head -3
```

Expected: FAIL, `Cannot find module './teamCandidateSetUseCases'`.

- [ ] **Step 4: Implement the use case**

Create `src/application/teamCandidateSetUseCases.ts`:

```ts
import type {
  AuthorizedFormationProgress,
  Division,
  Player,
  PublishedTeamCandidateSet,
  Session,
} from '@shared/types';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import { teamCandidateSetCloudService } from '@infra/supabase/teamCandidateSetCloudService';
import { appOk, productError, type AppResult } from './appResult';
import type { TeamCandidateSetGateway } from './authorizedFormationGateways';
import {
  AuthorizedFormationFailure,
  classifyAuthorizedFormationFailure,
} from './authorizedTeamFormationRules';
import { buildTeamCandidateSetPayload } from './teamCandidateSetMapper';

const PUBLISH_KEY = 'publishCandidateSet';

export interface PublishCandidateSetInput {
  readonly session: Session;
  readonly divisions: readonly Division[];
  readonly players: readonly Player[];
  readonly createId: () => string;
  readonly onSessionChange?: (session: Session) => void;
}

export interface PublishCandidateSetOutput {
  readonly session: Session;
  readonly result: AppResult<PublishedTeamCandidateSet>;
}

export const defaultTeamCandidateSetGateway: TeamCandidateSetGateway = {
  readRosterRevision: (id) => sessionCohortCloudService.readRosterRevision(id),
  publish: (input) => teamCandidateSetCloudService.publish(input),
};

export function clearCandidateSetPublication(session: Session): Session {
  const progress = session.authorizedFormation;
  if (!progress || (!progress.publishedCandidateSetId && !progress.pendingCommandIds[PUBLISH_KEY])) {
    return session;
  }
  const { publishedCandidateSetId: _published, ...rest } = progress;
  const { [PUBLISH_KEY]: _pending, ...pendingCommandIds } = progress.pendingCommandIds;
  return { ...session, authorizedFormation: { ...rest, pendingCommandIds } };
}

export async function publishTeamCandidateSet(
  input: PublishCandidateSetInput,
  gateway: TeamCandidateSetGateway = defaultTeamCandidateSetGateway,
): Promise<PublishCandidateSetOutput> {
  let session = input.session;
  const progress = session.authorizedFormation;
  const snapshotId = progress?.snapshotId;
  const rosterRevisionId = progress?.snapshotRosterRevisionId;
  const sessionCloudId = session.cloudId;
  if (
    session.authorityModel !== 'target' ||
    !sessionCloudId ||
    !progress ||
    !snapshotId ||
    !rosterRevisionId ||
    input.divisions.length === 0
  ) {
    return {
      session,
      result: productError('invalid_input', 'Gere os times pela comunidade antes de publicar.'),
    };
  }

  const commit = (next: AuthorizedFormationProgress) => {
    session = { ...session, authorizedFormation: next };
    input.onSessionChange?.(session);
  };

  const commandId = progress.pendingCommandIds[PUBLISH_KEY] ?? input.createId();
  commit({ ...progress, pendingCommandIds: { ...progress.pendingCommandIds, [PUBLISH_KEY]: commandId } });

  try {
    const roster = await gateway.readRosterRevision(rosterRevisionId);
    const mapping = buildTeamCandidateSetPayload({
      divisions: input.divisions,
      constraints: session.config?.balanceConstraints,
      roster,
      players: input.players,
    });
    if (!mapping.ok) {
      return {
        session,
        result: classifyAuthorizedFormationFailure(
          new AuthorizedFormationFailure('rekey', new Error('Player without participant')),
        ),
      };
    }
    const published = await gateway.publish({
      commandId,
      sessionId: sessionCloudId,
      snapshotId,
      set: mapping.set,
    });
    const current = session.authorizedFormation ?? progress;
    const { [PUBLISH_KEY]: _done, ...pendingCommandIds } = current.pendingCommandIds;
    commit({ ...current, pendingCommandIds, publishedCandidateSetId: published.setId });
    return { session, result: appOk(published) };
  } catch (error) {
    return {
      session,
      result: classifyAuthorizedFormationFailure(
        new AuthorizedFormationFailure('publishCandidateSet', error),
      ),
    };
  }
}
```

- [ ] **Step 5: Run the tests, typecheck and lint**

```bash
cd /c/Volley-xs-w6-03 && npx prettier --write src/shared/types/authorizedFormation.ts src/application/teamCandidateSetUseCases.ts src/application/teamCandidateSetUseCases.test.ts > /dev/null && node --import tsx --test src/application/teamCandidateSetUseCases.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet src/shared/types/authorizedFormation.ts src/application/teamCandidateSetUseCases.ts src/application/teamCandidateSetUseCases.test.ts
```

Expected: `ℹ pass 6`, `ℹ fail 0`; typecheck silent; no ESLint errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-xs-w6-03 && git add -- src/shared/types/authorizedFormation.ts src/application/teamCandidateSetUseCases.ts src/application/teamCandidateSetUseCases.test.ts && git commit -q -F - <<'EOF'
feat: caso de uso retomavel de publicacao dos candidatos

publishTeamCandidateSet guarda o id do comando antes de chamar, le a revisao
de elenco do snapshot, traduz as divisoes e publica; o id do conjunto fica no
progresso da Session. Falha mantem o id para o replay e usa as mensagens da
cadeia autorizada. clearCandidateSetPublication zera a publicacao quando os
times sao gerados de novo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Publish from `useSessionWizard`

**Files:**

- Modify: `src/hooks/useSessionWizard.ts` (imports, props, state, `prepareAndBalance`, new `publishCandidateSet`, return)
- Test: `src/hooks/useSessionWizard.spec.tsx` (module mock, import, new `describe`)

**Interfaces:**

- Consumes: `publishTeamCandidateSet`, `clearCandidateSetPublication` (Task 5); `TeamCandidateSetGateway` (Task 3); `CandidateSetPublicationState` (Task 3).
- Produces: `useSessionWizard` prop `teamCandidateSetGateway?: TeamCandidateSetGateway`; returned `publishCandidateSet: () => Promise<void>`, `publicationState: CandidateSetPublicationState`, `publicationError: string | null`.

- [ ] **Step 1: Write the failing hook tests**

In `src/hooks/useSessionWizard.spec.tsx`, replace:

```tsx
import type { Community, Player, Session } from '../types';
```

with:

```tsx
import type { Community, Division, Player, Session } from '../types';
```

Replace:

```tsx
const chain = vi.hoisted(() => ({ prepare: vi.fn() }));
```

with:

```tsx
const chain = vi.hoisted(() => ({ prepare: vi.fn() }));
const publication = vi.hoisted(() => ({ publish: vi.fn() }));

vi.mock('../application/teamCandidateSetUseCases', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../application/teamCandidateSetUseCases')>();
  return { ...actual, publishTeamCandidateSet: publication.publish };
});
```

Append at the end of the file:

```tsx
describe('useSessionWizard candidate set publication', () => {
  const divisions = [
    { teams: [{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }], score: 1, penalty: 0 },
  ] as unknown as Division[];

  beforeEach(() => {
    localStorage.clear();
    publication.publish.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes the divisions on screen and reports published', async () => {
    const players = syncedPlayers();
    const setActiveSession = vi.fn();
    publication.publish.mockImplementation(async (input) => {
      const next = {
        ...input.session,
        authorizedFormation: { pendingCommandIds: {}, publishedCandidateSetId: 'set-1' },
      };
      input.onSessionChange?.(next);
      return { session: next, result: { ok: true, value: { setId: 'set-1', setFingerprint: 'fp' } } };
    });
    const { result } = renderWizard(communitySession(players), players, {
      communities: [COMMUNITY],
      setActiveSession,
    });

    act(() => result.current.setBestDivisions(divisions));
    expect(result.current.publicationState).toBe('idle');

    await act(async () => {
      await result.current.publishCandidateSet();
    });

    expect(publication.publish).toHaveBeenCalledTimes(1);
    expect(publication.publish.mock.calls[0][0].divisions).toEqual(divisions);
    expect(publication.publish.mock.calls[0][0].players).toBe(players);
    expect(setActiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizedFormation: expect.objectContaining({ publishedCandidateSetId: 'set-1' }),
      }),
    );
    expect(result.current.publicationState).toBe('published');
    expect(result.current.publicationError).toBeNull();
  });

  it('shows the error and lets the organizer try again', async () => {
    const players = syncedPlayers();
    publication.publish
      .mockImplementationOnce(async (input) => ({
        session: input.session,
        result: {
          ok: false,
          error: {
            kind: 'conflict',
            code: 'roster_revision',
            message: 'O elenco mudou em outro aparelho. Tente de novo.',
            recoverable: true,
          },
        },
      }))
      .mockImplementationOnce(async (input) => ({
        session: input.session,
        result: { ok: true, value: { setId: 'set-2', setFingerprint: 'fp' } },
      }));
    const { result } = renderWizard(communitySession(players), players, {
      communities: [COMMUNITY],
    });
    act(() => result.current.setBestDivisions(divisions));

    await act(async () => {
      await result.current.publishCandidateSet();
    });
    expect(result.current.publicationState).toBe('error');
    expect(result.current.publicationError).toBe('O elenco mudou em outro aparelho. Tente de novo.');

    await act(async () => {
      await result.current.publishCandidateSet();
    });
    expect(result.current.publicationState).toBe('published');
    expect(result.current.publicationError).toBeNull();
  });

  it('does nothing without divisions on screen', async () => {
    const players = syncedPlayers();
    const { result } = renderWizard(communitySession(players), players, {
      communities: [COMMUNITY],
    });
    await act(async () => {
      await result.current.publishCandidateSet();
    });
    expect(publication.publish).not.toHaveBeenCalled();
    expect(result.current.publicationState).toBe('idle');
  });
});
```

- [ ] **Step 2: Run it and watch the new tests fail**

```bash
cd /c/Volley-xs-w6-03 && npx vitest run src/hooks/useSessionWizard.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" | head -8
```

Expected: the three publication tests fail (`result.current.publishCandidateSet is not a function` or `publicationState` undefined); every other test passes.

- [ ] **Step 3: Wire publication into the hook**

In `src/hooks/useSessionWizard.ts`, replace:

```ts
import type { AuthorizedFormationStage } from '../types';
import type { AuthorizedFormationGateway } from '../application/authorizedFormationGateways';
```

with:

```ts
import type { AuthorizedFormationStage, CandidateSetPublicationState } from '../types';
import type {
  AuthorizedFormationGateway,
  TeamCandidateSetGateway,
} from '../application/authorizedFormationGateways';
```

Replace:

```ts
import { prepareAuthorizedTeamFormation } from '../application/authorizedTeamFormationUseCases';
```

with:

```ts
import { prepareAuthorizedTeamFormation } from '../application/authorizedTeamFormationUseCases';
import {
  clearCandidateSetPublication,
  publishTeamCandidateSet,
} from '../application/teamCandidateSetUseCases';
```

Replace:

```ts
  communities?: Community[];
  authorizedFormationGateway?: AuthorizedFormationGateway;
}
```

with:

```ts
  communities?: Community[];
  authorizedFormationGateway?: AuthorizedFormationGateway;
  teamCandidateSetGateway?: TeamCandidateSetGateway;
}
```

Replace:

```ts
  communities = [],
  authorizedFormationGateway,
}: UseSessionWizardProps) {
```

with:

```ts
  communities = [],
  authorizedFormationGateway,
  teamCandidateSetGateway,
}: UseSessionWizardProps) {
```

Replace:

```ts
  const preparationRef = useRef(0);
```

with:

```ts
  const preparationRef = useRef(0);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const [publishedSetId, setPublishedSetId] = useState<string | null>(null);
```

Replace:

```ts
    setAuthorizedDraw({
      estimatedCount: output.result.value.estimatedCount,
      participantCount: output.result.value.participantCount,
    });
```

with:

```ts
    const cleared = clearCandidateSetPublication(output.session);
    if (cleared !== output.session && activeSessionIdRef.current === cleared.id) {
      setActiveSession(cleared);
    }
    setPublishedSetId(null);
    setPublicationError(null);
    setAuthorizedDraw({
      estimatedCount: output.result.value.estimatedCount,
      participantCount: output.result.value.participantCount,
    });
```

Replace:

```ts
  const cancelGeneration = () => {
    preparationRef.current += 1;
```

with:

```ts
  const publishCandidateSet = async () => {
    if (!activeSession || bestDivisions.length === 0 || publicationBusy) return;
    setPublicationBusy(true);
    setPublicationError(null);
    const output = await publishTeamCandidateSet(
      {
        session: activeSession,
        divisions: bestDivisions,
        players,
        createId: generateUUID,
        onSessionChange: (next) => {
          if (activeSessionIdRef.current === next.id) setActiveSession(next);
        },
      },
      teamCandidateSetGateway,
    );
    setPublicationBusy(false);
    if (output.result.ok) {
      setPublishedSetId(output.result.value.setId);
    } else {
      setPublicationError(output.result.error.message);
    }
  };

  const publicationState: CandidateSetPublicationState = publicationBusy
    ? 'publishing'
    : publicationError
      ? 'error'
      : publishedSetId || activeSession?.authorizedFormation?.publishedCandidateSetId
        ? 'published'
        : 'idle';

  const cancelGeneration = () => {
    preparationRef.current += 1;
```

Replace:

```ts
    generationStage,
    authorizedDraw,
    nextStep,
```

with:

```ts
    generationStage,
    authorizedDraw,
    publishCandidateSet,
    publicationState,
    publicationError,
    nextStep,
```

- [ ] **Step 4: Run the hook spec, typecheck and lint**

```bash
cd /c/Volley-xs-w6-03 && npx prettier --write src/hooks/useSessionWizard.ts src/hooks/useSessionWizard.spec.tsx > /dev/null && npx vitest run src/hooks/useSessionWizard.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && npm run typecheck && npx eslint --quiet src/hooks/useSessionWizard.ts src/hooks/useSessionWizard.spec.tsx
```

Expected: `Tests  13 passed (13)`; typecheck silent; no ESLint errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Volley-xs-w6-03 && git add -- src/hooks/useSessionWizard.ts src/hooks/useSessionWizard.spec.tsx && git commit -q -F - <<'EOF'
feat: wizard publica o conjunto de candidatos

publishCandidateSet publica as divisoes da tela pelo caso de uso e expoe
publicationState (idle, publishing, published, error) e a mensagem de erro,
permitindo tentar de novo. Gerar os times outra vez zera a publicacao anterior.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: "Publicar" in the results step

**Files:**

- Create: `src/components/session/CandidateSetPublication.tsx`
- Test: `src/components/session/CandidateSetPublication.spec.tsx`
- Modify: `src/application/screens/sessionWizard/sessionWizardIntents.ts`, `sessionWizardContract.ts`, `sessionWizardModel.ts`
- Test: `src/application/screens/sessionWizard/sessionWizardContract.test.ts`
- Modify: `src/components/session/SessionWizard.tsx`

**Interfaces:**

- Consumes: hook fields `publishCandidateSet`, `publicationState`, `publicationError` (Task 6); `CandidateSetPublicationState` (Task 3).
- Produces: `CandidateSetPublication({ state, error, onPublish })`; intent `{ kind: 'publishCandidateSet' }`; `SessionWizardHookApi` gains `publicationState`, `publicationError`, `publishCandidateSet`; `SessionWizardModel` gains `publicationState`, `publicationError`.

- [ ] **Step 1: Write the failing component spec**

Create `src/components/session/CandidateSetPublication.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateSetPublication } from './CandidateSetPublication';

describe('CandidateSetPublication', () => {
  it('publishes when idle', () => {
    const onPublish = vi.fn();
    render(<CandidateSetPublication state="idle" error={null} onPublish={onPublish} />);
    fireEvent.click(screen.getByRole('button', { name: /Publicar/ }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('disables the button while publishing', () => {
    render(<CandidateSetPublication state="publishing" error={null} onPublish={vi.fn()} />);
    expect((screen.getByRole('button', { name: /Publicando/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('shows published without a button', () => {
    render(<CandidateSetPublication state="published" error={null} onPublish={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('Publicado');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the error and keeps the button to try again', () => {
    const onPublish = vi.fn();
    render(
      <CandidateSetPublication
        state="error"
        error="O elenco mudou em outro aparelho. Tente de novo."
        onPublish={onPublish}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'O elenco mudou em outro aparelho. Tente de novo.',
    );
    fireEvent.click(screen.getByRole('button', { name: /Publicar/ }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Volley-xs-w6-03 && npx vitest run src/components/session/CandidateSetPublication.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |Failed to resolve" | head -3
```

Expected: FAIL — `Failed to resolve import "./CandidateSetPublication"`.

- [ ] **Step 3: Implement the component**

Create `src/components/session/CandidateSetPublication.tsx`:

```tsx
import { CheckCircle2, Send } from 'lucide-react';
import type { CandidateSetPublicationState } from '../../types';

interface CandidateSetPublicationProps {
  state: CandidateSetPublicationState;
  error: string | null;
  onPublish: () => void;
}

export function CandidateSetPublication({ state, error, onPublish }: CandidateSetPublicationProps) {
  if (state === 'published') {
    return (
      <p role="status" className="flex items-center gap-2 text-xs font-semibold text-success">
        <CheckCircle2 className="w-4 h-4" /> Publicado
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onPublish}
        disabled={state === 'publishing'}
        className="btn btn-accent btn-sm w-full text-xs"
      >
        <Send className="w-3.5 h-3.5" />
        {state === 'publishing' ? 'Publicando…' : 'Publicar'}
      </button>
      {state === 'error' && error && (
        <div role="alert" className="alert alert-error alert-soft text-xs font-semibold">
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Volley-xs-w6-03 && npx vitest run src/components/session/CandidateSetPublication.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests "
```

Expected: `Tests  4 passed (4)`.

- [ ] **Step 5: Write the failing contract test**

In `src/application/screens/sessionWizard/sessionWizardContract.test.ts`, replace:

```ts
    authorizedDraw: null,
    nextStep: noop,
```

with:

```ts
    authorizedDraw: null,
    publicationState: 'idle',
    publicationError: null,
    publishCandidateSet: async () => {},
    nextStep: noop,
```

Append to `src/application/screens/sessionWizard/sessionWizardContract.test.ts`:

```ts
test('publicar repassa ao hook e o modelo expoe o estado da publicacao', async () => {
  let published = 0;
  const c = buildSessionWizardContract(
    makeInput(
      makeHookApi({
        publicationState: 'error',
        publicationError: 'Falhou',
        publishCandidateSet: async () => {
          published += 1;
        },
      }),
    ),
  );
  assert.equal(c.model.publicationState, 'error');
  assert.equal(c.model.publicationError, 'Falhou');
  await c.dispatch({ kind: 'publishCandidateSet' });
  assert.equal(published, 1);
});
```

Run: `cd /c/Volley-xs-w6-03 && node --import tsx --test src/application/screens/sessionWizard/sessionWizardContract.test.ts 2>&1 | grep -E "^ℹ (pass|fail)"` — Expected: `ℹ fail 1`.

- [ ] **Step 6: Carry the fields through intents, contract and model**

In `src/application/screens/sessionWizard/sessionWizardIntents.ts`, replace:

```ts
  | { kind: 'cancelGeneration' }
```

with:

```ts
  | { kind: 'cancelGeneration' }
  | { kind: 'publishCandidateSet' }
```

In `src/application/screens/sessionWizard/sessionWizardModel.ts`, replace:

```ts
import type { AuthorizedFormationStage, Community, Division, Player, Session } from '@shared/types';
```

with:

```ts
import type {
  AuthorizedFormationStage,
  CandidateSetPublicationState,
  Community,
  Division,
  Player,
  Session,
} from '@shared/types';
```

and replace:

```ts
  authorizedDraw: { estimatedCount: number; participantCount: number } | null;
  partnershipMatrix?: PartnershipMatrix;
```

with:

```ts
  authorizedDraw: { estimatedCount: number; participantCount: number } | null;
  publicationState: CandidateSetPublicationState;
  publicationError: string | null;
  partnershipMatrix?: PartnershipMatrix;
```

In `src/application/screens/sessionWizard/sessionWizardContract.ts`, replace:

```ts
import type { AuthorizedFormationStage, Community, Division, Player, Session } from '@shared/types';
```

with:

```ts
import type {
  AuthorizedFormationStage,
  CandidateSetPublicationState,
  Community,
  Division,
  Player,
  Session,
} from '@shared/types';
```

replace:

```ts
  authorizedDraw: { estimatedCount: number; participantCount: number } | null;
  nextStep: () => void;
```

with:

```ts
  authorizedDraw: { estimatedCount: number; participantCount: number } | null;
  publicationState: CandidateSetPublicationState;
  publicationError: string | null;
  publishCandidateSet: () => Promise<void>;
  nextStep: () => void;
```

replace:

```ts
    authorizedDraw: h.authorizedDraw,
```

with:

```ts
    authorizedDraw: h.authorizedDraw,
    publicationState: h.publicationState,
    publicationError: h.publicationError,
```

and replace:

```ts
      case 'cancelGeneration':
        h.cancelGeneration();
        return;
```

with:

```ts
      case 'cancelGeneration':
        h.cancelGeneration();
        return;
      case 'publishCandidateSet':
        await h.publishCandidateSet();
        return;
```

Run the contract test again: `ℹ fail 0`.

- [ ] **Step 7: Render it in `SessionWizard.tsx`**

In `src/components/session/SessionWizard.tsx`, replace:

```tsx
import { SessionGenerationStatus } from './SessionGenerationStatus';
```

with:

```tsx
import { CandidateSetPublication } from './CandidateSetPublication';
import { SessionGenerationStatus } from './SessionGenerationStatus';
```

Replace:

```tsx
    generationStage,
    authorizedDraw,
    partnershipMatrix,
```

with:

```tsx
    generationStage,
    authorizedDraw,
    publicationState,
    publicationError,
    partnershipMatrix,
```

Replace:

```tsx
                <span className="badge badge-accent badge-soft text-xs font-semibold">
                  Notas autorizadas da comunidade
                </span>
```

with:

```tsx
                <span className="badge badge-accent badge-soft text-xs font-semibold">
                  Notas autorizadas da comunidade
                </span>
                <CandidateSetPublication
                  state={publicationState}
                  error={publicationError}
                  onPublish={() => dispatch({ kind: 'publishCandidateSet' })}
                />
```

- [ ] **Step 8: Run specs, contract test, typecheck, lint and format**

```bash
cd /c/Volley-xs-w6-03 && F="src/components/session/CandidateSetPublication.tsx src/components/session/CandidateSetPublication.spec.tsx src/components/session/SessionWizard.tsx src/application/screens/sessionWizard/sessionWizardIntents.ts src/application/screens/sessionWizard/sessionWizardContract.ts src/application/screens/sessionWizard/sessionWizardModel.ts src/application/screens/sessionWizard/sessionWizardContract.test.ts" && npx prettier --write $F > /dev/null && npx vitest run src/components/session src/hooks/useSessionWizard.spec.tsx 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests |×" && node --import tsx --test src/application/screens/sessionWizard/sessionWizardContract.test.ts 2>&1 | grep -E "^ℹ (pass|fail)" && npm run typecheck && npx eslint --quiet $F
```

Expected: all specs pass; contract `ℹ fail 0`; typecheck silent; no ESLint errors.

- [ ] **Step 9: Commit**

```bash
cd /c/Volley-xs-w6-03 && git add -- src/components/session/CandidateSetPublication.tsx src/components/session/CandidateSetPublication.spec.tsx src/components/session/SessionWizard.tsx src/application/screens/sessionWizard/sessionWizardIntents.ts src/application/screens/sessionWizard/sessionWizardContract.ts src/application/screens/sessionWizard/sessionWizardModel.ts src/application/screens/sessionWizard/sessionWizardContract.test.ts && git commit -q -F - <<'EOF'
feat: botao Publicar nos resultados do sorteio autorizado

CandidateSetPublication mostra Publicar, Publicando e Publicado; em erro mostra
a mensagem e deixa tentar de novo. So aparece junto do selo de notas
autorizadas, e a intencao publishCandidateSet chega ao hook pelo contrato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Documentation and full gates

**Files:**

- Modify: `docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`
- Modify: `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`
- Modify: `docs/architecture/execution/C6-REACHABILITY-MAP.md`
- Modify: `HANDOFF.md`

**Interfaces:**

- Consumes: Tasks 1–7.
- Produces: documentation only.

- [ ] **Step 1: C5.02 rows**

In `docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md`, replace:

```markdown
| `PublishCandidateSet` | shared TeamFormation aggregate `T2` | revalidate roster revision, input hashes, hard constraints | ONLINE shared; Quick local equivalent | immutable CandidateSet | client diagnostics are not authority |
```

with:

```markdown
| `PublishCandidateSet` | shared TeamFormation aggregate `T2` | revalidate roster revision, input hashes, hard constraints | ONLINE shared; Quick local equivalent | immutable CandidateSet | Implemented as `publish_team_candidate_set` (XS-W6-03): snapshot of the current roster revision, exact partition and declared constraints; client score and diagnostics stored as `client_claimed` |
```

and replace:

```markdown
| `GetTeamCandidateSet` | Team Formation | immutable CandidateSet | eligible participants/Organizer | bounded | candidate/voting events |
```

with:

```markdown
| `GetTeamCandidateSet` | Team Formation | immutable CandidateSet | eligible participants/Organizer | bounded | Implemented as `read_team_candidate_set` (XS-W6-03), Organizer only until voting |
```

- [ ] **Step 2: C6.02 note**

In `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md`, replace:

```markdown
A forged candidate that violates hard constraint cannot be published/confirmed.
```

with:

```markdown
A forged candidate that violates hard constraint cannot be published/confirmed.

### Implemented (2026-09-17)

Per the [revised XS-W6-03 spec](../../superpowers/specs/2026-09-17-xs-w6-03-candidate-set-publication-design.md).
`publish_team_candidate_set` stores an immutable set and its solutions after checking, in order,
the organizer, the snapshot of the current roster revision (`40001` when superseded), 1 to 8
candidates with the declared team count, the exact partition of the snapshot's participants and the
constraints the client declares, which the set keeps. Locks and pairs are not server state, so the
server can only hold the client to what it declares. Publication is an explicit "Publicar" button
after an authorized draw; confirmation stays local until XS-W6-04, which is the set's first
consumer.
```

- [ ] **Step 3: Reachability map**

In `docs/architecture/execution/C6-REACHABILITY-MAP.md`:

- In the `### Alcançável` table, add one row after the row that starts with `| Sorteio autorizado`:

  `| Publicar candidatos | tela | \`SessionWizard\` → \`CandidateSetPublication\` → \`useSessionWizard.publishCandidateSet\` → \`publishTeamCandidateSet\` → \`read_target_roster_revision\`, \`publish_team_candidate_set\` |`

- In the `### Não alcançável` table, add one row after the row that starts with `| **W6-01, W6-02**`:

  `| **W6-03** | \`read_team_candidate_set\` (sem consumidor até a XS-W6-04) |`

- Replace "**21 são alcançáveis**" with "**22 são alcançáveis**", and after the sentence that ends with "as contagens por tipo acima são as de antes dela." add: "A XS-W6-03 somou `publish_team_candidate_set`, pelo botão Publicar."

Run `npx prettier --write docs/architecture/execution/C6-REACHABILITY-MAP.md` to realign the tables.

- [ ] **Step 4: HANDOFF**

In `HANDOFF.md`:

- In the slice table, add a row after the row that starts with `| XS-W6-08c |`: `| XS-W6-03 | Publicação do conjunto de candidatos | concluída na branch |`.
- Replace the paragraph that starts with `- **C6**: a próxima fatia na ordem de` and ends with `continuam sem \`ORGANIZER\`.` with:

```markdown
- **C6**: a próxima fatia na ordem de
  `docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md` é a `XS-W6-04`
  (escolha do organizador e confirmação do sorteio), a primeira consumidora do conjunto que a
  XS-W6-03 publica. A captura de snapshot e a revisão de elenco já vêm do wizard desde a XS-W6-08c,
  e donos e admins têm `ORGANIZER` desde a XS-W6-08a.
```

- Insert before the line `### Membros aprovados entram no elenco — 2026-09-15 a 2026-09-17`:

```markdown
### O que a XS-W6-03 entregou — publicação do conjunto de candidatos

Branch `exec/c6-candidate-set-publication`, worktree `C:\Volley-xs-w6-03`. Ver a
[spec revisada](docs/superpowers/specs/2026-09-17-xs-w6-03-candidate-set-publication-design.md) e o
[plano](docs/superpowers/plans/2026-09-17-xs-w6-03-candidate-set-publication.md).

- `20260917130000_team_candidate_sets.sql`: tabelas privadas e imutáveis `team_candidate_sets` e
  `team_candidate_solutions`, `publish_team_candidate_set` e `read_team_candidate_set`. O servidor confere
  o organizador, o snapshot do elenco atual, de 1 a 8 candidatos, a partição exata dos participantes e as
  restrições que o app declara (guardadas no conjunto); pontuação e diagnóstico do app ficam em
  `client_claimed`, sem valor de autoridade.
- Nos resultados de um sorteio autorizado, o botão "Publicar" traduz os times para os participantes do
  elenco e publica; mostra "Publicado", ou o erro com a opção de tentar de novo. Gerar de novo zera a
  publicação.
- A confirmação continua local: nada consome o conjunto até a XS-W6-04.

**Migration não aplicada no Panelinha e sem push**: ambos esperam o ok do usuário.
```

- [ ] **Step 5: Run every gate, including the full database suite**

```bash
cd /c/Volley-xs-w6-03 && npm run typecheck \
&& git ls-files -z -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' | xargs -0 -n 100 npx eslint --quiet --no-warn-ignored \
&& npx prettier --write HANDOFF.md docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md docs/architecture/execution/C6-REACHABILITY-MAP.md > /dev/null \
&& git ls-files -z | xargs -0 -n 150 npx prettier --check --ignore-unknown 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^\[warn\]' | grep -v 'Code style issues'; \
npm test > /tmp/w603-test.log 2>&1; grep -E "^ℹ (pass|fail)|Tests +[0-9]|Test Files" /tmp/w603-test.log; \
npm run check:architecture > /dev/null && echo ARCH ok && npm run build > /tmp/w603-build.log 2>&1 && echo BUILD ok
```

Expected: typecheck silent; no ESLint errors; no Prettier `[warn]` lines; unit and UI `fail 0`; `ARCH ok`; `BUILD ok`.

Then the full database suite (run it in the background and wait for it):

```bash
cd /c/Volley-xs-w6-03 && VOLLEY_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55500/volley_test npm run test:db > /tmp/w603-db.log 2>&1; grep -E "^ℹ (tests|pass|fail)" /tmp/w603-db.log; grep -A25 "✖ failing" /tmp/w603-db.log | head -60
```

Expected: `ℹ fail 0` (720 existing tests plus the 11 of Tasks 1–2). Any failure stops the task: diagnose it before editing an expectation.

- [ ] **Step 6: Commit**

```bash
cd /c/Volley-xs-w6-03 && git add -- HANDOFF.md docs/architecture/matrices/C5.02-COMMAND-QUERY-TRANSACTION-MATRIX.md docs/architecture/execution/C6.02-W3-W6-SESSION-REGISTRATION-RATING-TEAM.md docs/architecture/execution/C6-REACHABILITY-MAP.md && git commit -q -F - <<'EOF'
docs: registra a XS-W6-03

C5.02 marca PublishCandidateSet e GetTeamCandidateSet implementados, C6.02
ganha a nota da fatia, o mapa de alcancabilidade soma a publicacao pelo botao
e o HANDOFF descreve a fatia, aponta a XS-W6-04 como proxima e registra que
migration e push esperam o usuario.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
git log --oneline -10 && git status --short
```

Expected: the spec commit plus eight XS-W6-03 commits (plan, Tasks 1–7 and this one) and a clean `git status`.
