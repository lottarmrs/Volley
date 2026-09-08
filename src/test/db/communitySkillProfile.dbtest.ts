import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

interface Context {
  ownerId: string;
  communityId: string;
  evaluatorId: string;
  playerId: string;
}

interface Dimension {
  dimension_key: string;
  value: number | null;
  sample_count: number;
  included_count: number;
  excluded_count: number;
}

interface Profile {
  community_id: string;
  player_id: string;
  rubric_version: string;
  aggregation_policy_version: string;
  status: string;
  source_revision: string;
  calculated_at: string;
  contribution_count: number;
  dimensions: Dimension[];
}

const VERSION = 'v0-legacy-11';
const MIGRATION = '20260906231744_community_skill_profile.sql';
const READ = 'select public.get_community_player_skill_profile($1, $2, $3) as profile';

if (!isTestDatabaseConfigured()) {
  test(`community skill profile requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.ok(result.failures.length <= 106);
    assert.deepEqual(
      result.failures.filter(({ migration }) => migration === MIGRATION),
      [],
    );
  });

  test.after(async () => {
    await client?.end();
  });

  async function call<T extends QueryResultRow>(
    actor: string | null,
    sql: string,
    args: unknown[],
  ) {
    return asIdentityCommitting(client, actor, () => client.query<T>(sql, args));
  }

  async function user() {
    const email = `profile-${randomUUID()}@test.local`;
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

  async function evaluator(communityId: string) {
    const id = await user();
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [communityId, id],
    );
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'EVALUATOR')`,
      [communityId, id],
    );
    return id;
  }

  async function context(): Promise<Context> {
    const ownerId = await user();
    const { rows } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      ['Skill profile test'],
    );
    const communityId = rows[0].id;
    const evaluatorId = await evaluator(communityId);
    const playerId = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active, has_account_identity_history)
       values ($1, $2, 'Skill profile player', true, false)`,
      [playerId, ownerId],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, playerId, ownerId],
    );
    return { ownerId, communityId, evaluatorId, playerId };
  }

  async function record(c: Context, dimensions: Record<string, number>, version = VERSION) {
    const id = randomUUID();
    await call(c.evaluatorId, 'select * from public.record_player_evaluation($1,$2,$3,$4,$5,$6)', [
      randomUUID(),
      id,
      c.communityId,
      c.playerId,
      version,
      JSON.stringify(dimensions),
    ]);
    return id;
  }

  async function read(c: Context, version: string | null = VERSION) {
    const { rows } = await call<{ profile: Profile }>(c.evaluatorId, READ, [
      c.communityId,
      c.playerId,
      version,
    ]);
    return rows[0].profile;
  }

  function dimension(profile: Profile, key: string) {
    const result = profile.dimensions.find((d) => d.dimension_key === key);
    assert.ok(result);
    return result;
  }

  async function rejects(actor: string | null, args: unknown[], code: string, message?: string) {
    await assert.rejects(call(actor, READ, args), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error & { code: string }).code, code);
      if (message) assert.equal(error.message, message);
      return true;
    });
  }

  async function sourceSnapshot() {
    const { rows } = await client.query(`select
      (select jsonb_agg(to_jsonb(c) order by id) from public.player_evaluation_contributions c) as contributions,
      (select jsonb_agg(to_jsonb(s) order by contribution_id, dimension_key) from public.player_evaluation_dimension_scores s) as scores,
      (select jsonb_agg(to_jsonb(r) order by command_id) from app_private.command_receipts r) as receipts`);
    return rows;
  }

  test('computes filtered means, preserves zero and absence, and returns only the public DTO', async () => {
    const c = await context();
    const samples: Record<string, number>[] = [
      { saque: 5, ataque: 5, recepcao: 0, levantamento: 1, bloqueio: 0, velocidade: 3.25 },
      { saque: 6, ataque: 5, levantamento: 1, bloqueio: 2, velocidade: 5 },
      { saque: 10, ataque: 5, levantamento: 2, bloqueio: 4, velocidade: 5 },
      { ataque: 10, levantamento: 2, bloqueio: 10, velocidade: 5 },
    ];
    for (const sample of samples) {
      await record({ ...c, evaluatorId: await evaluator(c.communityId) }, sample);
    }
    const before = await sourceSnapshot();
    const p = await read(c, ` ${VERSION} `);
    assert.deepEqual(Object.keys(p).sort(), [
      'aggregation_policy_version',
      'calculated_at',
      'community_id',
      'contribution_count',
      'dimensions',
      'player_id',
      'rubric_version',
      'source_revision',
      'status',
    ]);
    assert.equal(p.community_id, c.communityId);
    assert.equal(p.player_id, c.playerId);
    assert.equal(p.rubric_version, VERSION);
    assert.equal(p.aggregation_policy_version, 'v0-legacy-mad-mean');
    assert.equal(p.status, 'EXPERIMENTAL');
    assert.ok(Number.isFinite(Date.parse(p.calculated_at)));
    assert.equal(p.contribution_count, 4);
    assert.deepEqual(
      p.dimensions.map((d) => d.dimension_key),
      [
        'saque',
        'recepcao',
        'levantamento',
        'ataque',
        'bloqueio',
        'defesa',
        'velocidade',
        'resistencia',
        'leituraDeJogo',
        'regularidade',
        'controleEmocional',
      ],
    );
    for (const [key, value, sample, included, excluded] of [
      ['saque', 7, 3, 3, 0],
      ['ataque', 5, 4, 3, 1],
      ['recepcao', 0, 1, 1, 0],
      ['defesa', null, 0, 0, 0],
      ['levantamento', 1.5, 4, 4, 0],
      ['bloqueio', 2, 4, 3, 1],
      ['velocidade', 4.6, 4, 4, 0],
    ] as const) {
      assert.deepEqual(dimension(p, key), {
        dimension_key: key,
        value,
        sample_count: sample,
        included_count: included,
        excluded_count: excluded,
      });
    }
    assert.match(p.source_revision, /^[a-f0-9]{32,64}$/);
    assert.equal((await read(c)).source_revision, p.source_revision);
    assert.deepEqual(await sourceSnapshot(), before);
  });

  test('isolates Community, Player and rubric and supersedes across versions while retaining history', async () => {
    const c = await context();
    const other = await context();
    const empty = await read(c);
    assert.equal(empty.contribution_count, 0);
    assert.ok(empty.dimensions.every((d) => d.value === null && d.sample_count === 0));
    assert.notEqual(empty.source_revision, (await read(other)).source_revision);
    const originalId = await record(c, { saque: 6 });
    const original = await read(c);
    await record(other, { saque: 10 });
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active'), ($4, $5, $6, true, 'active')`,
      [c.communityId, other.playerId, c.ownerId, other.communityId, c.playerId, other.ownerId],
    );
    await record({ ...c, playerId: other.playerId }, { saque: 0 });
    await record({ ...other, playerId: c.playerId }, { saque: 10 });
    assert.equal((await read(c)).source_revision, original.source_revision);
    const version = `profile-test-${randomUUID()}`;
    await client.query(
      `insert into public.skill_rubric_versions (rubric_version, status, provenance)
       values ($1, 'EXPERIMENTAL', 'Test fixture')`,
      [version],
    );
    await client.query(
      `insert into public.skill_rubric_dimensions
       (rubric_version, dimension_key, kind, is_required, display_order)
       values ($1, 'saque', 'SOURCE', false, 1)`,
      [version],
    );
    await record(c, { saque: 8 }, version);
    const oldVersion = await read(c);
    assert.equal(oldVersion.contribution_count, 0);
    assert.equal(dimension(oldVersion, 'saque').value, null);
    assert.notEqual(oldVersion.source_revision, original.source_revision);
    const newVersion = await read(c, version);
    assert.equal(newVersion.contribution_count, 1);
    assert.equal(dimension(newVersion, 'saque').value, 8);
    const history = await client.query(
      'select * from public.player_evaluation_contributions where id=$1',
      [originalId],
    );
    assert.ok(history.rows[0].superseded_at);
  });

  test('revision tracks source identity, scores and registered dimensions and preserves anonymized inputs', async () => {
    const c = await context();
    const id = await record(c, { saque: 6 });
    const original = await read(c);
    await client.query(
      'update public.player_evaluation_contributions set evaluator_user_id=null where id=$1',
      [id],
    );
    const anonymous = await read(c);
    assert.equal(anonymous.source_revision, original.source_revision);
    assert.equal(dimension(anonymous, 'saque').value, 6);
    await client.query(
      'update public.player_evaluation_dimension_scores set value=7 where contribution_id=$1',
      [id],
    );
    const changed = await read(c);
    assert.notEqual(changed.source_revision, original.source_revision);
    assert.equal(dimension(changed, 'saque').value, 7);
    await record(c, { saque: 7 });
    const added = await read(c);
    assert.notEqual(added.source_revision, changed.source_revision);
    assert.equal(added.contribution_count, 2);
    await client.query(
      `update public.skill_rubric_dimensions set is_required=true where rubric_version=$1 and dimension_key='saque'`,
      [VERSION],
    );
    assert.notEqual((await read(c)).source_revision, added.source_revision);
    await client.query(
      `update public.skill_rubric_dimensions set is_required=false where rubric_version=$1 and dimension_key='saque'`,
      [VERSION],
    );
    assert.equal((await read(c)).source_revision, added.source_revision);
  });

  test('denies anonymous, rank-only, member and cross-Community callers before existence disclosure', async () => {
    const c = await context();
    const other = await context();
    await rejects(null, [c.communityId, c.playerId, VERSION], '42501');
    for (const role of ['owner', 'admin', 'member']) {
      const actor = role === 'owner' ? c.ownerId : await user();
      if (role !== 'owner') {
        await client.query(
          `insert into public.community_memberships (community_id, user_id, role, status)
           values ($1, $2, $3, 'active')`,
          [c.communityId, actor, role],
        );
      }
      await rejects(
        actor,
        [c.communityId, c.playerId, VERSION],
        '42501',
        'Not authorized to read skill profiles in this Community',
      );
      await rejects(
        actor,
        [c.communityId, randomUUID(), 'unknown'],
        '42501',
        'Not authorized to read skill profiles in this Community',
      );
    }
    await rejects(other.evaluatorId, [c.communityId, c.playerId, VERSION], '42501');
    await rejects(c.evaluatorId, [randomUUID(), randomUUID(), 'unknown'], '42501');
    await asIdentityCommitting(client, c.evaluatorId, async () => {
      await client.query("select set_config('request.jwt.claim.sub', '', true)");
      await assert.rejects(
        client.query(READ, [c.communityId, c.playerId, VERSION]),
        /Not authenticated/,
      );
    });
  });

  test('validates inputs after authorization and rejects lost standing or capability immediately', async () => {
    const c = await context();
    await rejects(
      c.evaluatorId,
      [null, c.playerId, VERSION],
      '23514',
      'Community and Player are required',
    );
    await rejects(
      c.evaluatorId,
      [c.communityId, null, VERSION],
      '23514',
      'Community and Player are required',
    );
    for (const version of [null, '', '  ', 'unknown']) {
      await rejects(
        c.evaluatorId,
        [c.communityId, c.playerId, version],
        '23514',
        'Rubric version is not registered',
      );
    }
    await rejects(
      c.evaluatorId,
      [c.communityId, randomUUID(), VERSION],
      '23514',
      'Player has no living roster standing in this Community',
    );
    await read(c);
    await client.query(
      'update public.community_players set active=false where community_id=$1 and player_id=$2',
      [c.communityId, c.playerId],
    );
    await rejects(
      c.evaluatorId,
      [c.communityId, c.playerId, VERSION],
      '23514',
      'Player has no living roster standing in this Community',
    );
    await client.query(
      'update public.community_players set active=true where community_id=$1 and player_id=$2',
      [c.communityId, c.playerId],
    );
    await client.query(
      'update public.community_responsibilities set revoked_at=now() where community_id=$1 and user_id=$2',
      [c.communityId, c.evaluatorId],
    );
    await rejects(c.evaluatorId, [c.communityId, c.playerId, VERSION], '42501');
  });

  test('exposes only a stable authenticated read function and keeps source tables inaccessible', async () => {
    const c = await context();
    const { rows } = await client.query(`select p.provolatile, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_catalog.pg_proc p where p.oid='public.get_community_player_skill_profile(uuid,uuid,text)'::regprocedure`);
    assert.deepEqual(rows, [
      {
        provolatile: 's',
        prosecdef: true,
        proconfig: ['search_path=""'],
        anon_execute: false,
        authenticated_execute: true,
      },
    ]);
    for (const table of ['player_evaluation_contributions', 'player_evaluation_dimension_scores']) {
      await assert.rejects(
        call(c.evaluatorId, `select * from public.${table}`, []),
        (e: unknown) => {
          assert.equal((e as { code: string }).code, '42501');
          return true;
        },
      );
    }
  });
}
