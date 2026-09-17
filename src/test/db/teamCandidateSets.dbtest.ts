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
      await refusal(
        f.ownerId,
        f,
        setOf([teams], constraints({ lockedParticipantTeams: { [a]: 1 } })),
      ),
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

    await client.query(
      'update app_private.team_candidate_sets set created_by = null where id = $1',
      [published.set_id],
    );
    const { rows } = await client.query<{ created_by: string | null; set_fingerprint: string }>(
      'select created_by, set_fingerprint from app_private.team_candidate_sets where id = $1',
      [published.set_id],
    );
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
