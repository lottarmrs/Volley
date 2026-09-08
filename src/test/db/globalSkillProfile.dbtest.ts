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

interface Dimension {
  dimension_key: string;
  value: number | null;
  community_count: number;
}

interface CommunitySource {
  community_id: string;
  source_revision: string;
  aggregation_policy_version: string;
}

interface GlobalProfile {
  player_id: string;
  rubric_version: string;
  aggregation_policy_version: string;
  community_aggregation_policy_version: string;
  status: string;
  source_revision: string;
  calculated_at: string;
  community_count: number;
  community_sources: CommunitySource[];
  dimensions: Dimension[];
}

const VERSION = 'v0-legacy-11';
const MIGRATION = '20260908031027_global_skill_profile.sql';
const READ = 'select app_private.compute_global_player_skill_profile($1, $2) as profile';

if (!isTestDatabaseConfigured()) {
  test(`global skill profile requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function user() {
    const email = `global-profile-${randomUUID()}@test.local`;
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

  async function community(ownerId: string, name: string) {
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [name]),
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

  async function record(
    evaluatorId: string,
    communityId: string,
    playerId: string,
    dimensions: Record<string, number>,
    version = VERSION,
    evaluationId = randomUUID(),
  ) {
    await asIdentityCommitting(client, evaluatorId, () =>
      client.query('select * from public.record_player_evaluation($1,$2,$3,$4,$5,$6)', [
        randomUUID(),
        evaluationId,
        communityId,
        playerId,
        version,
        JSON.stringify(dimensions),
      ]),
    );
    return evaluationId;
  }

  async function read(playerId: string, version: string | null = VERSION) {
    const { rows } = await client.query<{ profile: GlobalProfile }>(READ, [playerId, version]);
    return rows[0].profile;
  }

  function dimension(profile: GlobalProfile, key: string) {
    const result = profile.dimensions.find((item) => item.dimension_key === key);
    assert.ok(result);
    return result;
  }

  async function player(ownerId: string, name = 'Global profile player') {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active, has_account_identity_history)
       values ($1, $2, $3, true, false)`,
      [id, ownerId, name],
    );
    return id;
  }

  async function addPlayer(communityId: string, playerId: string, ownerId: string) {
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, playerId, ownerId],
    );
  }

  async function sourceSnapshot() {
    const { rows } = await client.query(`select
      (select jsonb_agg(to_jsonb(c) order by id) from public.player_evaluation_contributions c) as contributions,
      (select jsonb_agg(to_jsonb(s) order by contribution_id, dimension_key) from public.player_evaluation_dimension_scores s) as scores,
      (select jsonb_agg(to_jsonb(r) order by command_id) from app_private.command_receipts r) as receipts`);
    return rows;
  }

  test('weights each Community equally after Community filtering', async () => {
    const ownerId = await user();
    const playerId = await player(ownerId);
    const communityA = await community(ownerId, 'Many evaluators');
    const communityB = await community(ownerId, 'One evaluator');
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $3, $2, true, 'active'), ($4, $3, $2, true, 'active')`,
      [communityA, ownerId, playerId, communityB],
    );
    for (let index = 0; index < 10; index += 1) {
      await record(await evaluator(communityA), communityA, playerId, {
        saque: 2,
        ...(index < 4 ? { ataque: index === 3 ? 10 : 5 } : {}),
        ...(index < 2 ? { velocidade: 3.24 } : {}),
      });
    }
    await record(await evaluator(communityB), communityB, playerId, {
      saque: 8,
      ataque: 9,
      velocidade: 3.3,
    });

    const profile = await read(playerId);
    assert.equal(dimension(profile, 'saque').value, 5);
    assert.equal(dimension(profile, 'saque').community_count, 2);
    assert.equal(dimension(profile, 'defesa').value, null);
    assert.equal(dimension(profile, 'ataque').value, 7);
    assert.equal(dimension(profile, 'velocidade').value, 3.3);
    assert.equal(profile.aggregation_policy_version, 'v0-equal-community-mean');
  });

  test('returns the exact DTO with sorted provenance, per-dimension coverage and zero values', async () => {
    const ownerId = await user();
    const playerId = await player(ownerId);
    const communityA = await community(ownerId, 'Coverage A');
    const communityB = await community(ownerId, 'Coverage B');
    await addPlayer(communityA, playerId, ownerId);
    await addPlayer(communityB, playerId, ownerId);
    await record(await evaluator(communityA), communityA, playerId, { saque: 0, ataque: 4 });
    await record(await evaluator(communityB), communityB, playerId, { saque: 8 });

    const before = await sourceSnapshot();
    const profile = await read(playerId, ` ${VERSION} `);
    assert.deepEqual(Object.keys(profile).sort(), [
      'aggregation_policy_version',
      'calculated_at',
      'community_aggregation_policy_version',
      'community_count',
      'community_sources',
      'dimensions',
      'player_id',
      'rubric_version',
      'source_revision',
      'status',
    ]);
    assert.equal(profile.player_id, playerId);
    assert.equal(profile.rubric_version, VERSION);
    assert.equal(profile.community_aggregation_policy_version, 'v0-legacy-mad-mean');
    assert.equal(profile.status, 'EXPERIMENTAL');
    assert.ok(Number.isFinite(Date.parse(profile.calculated_at)));
    assert.equal(profile.community_count, 2);
    assert.match(profile.source_revision, /^[a-f0-9]{32,64}$/);
    assert.deepEqual(
      profile.community_sources.map((source) => source.community_id),
      [communityA, communityB].sort(),
    );
    assert.ok(
      profile.community_sources.every(
        (source) =>
          source.aggregation_policy_version === 'v0-legacy-mad-mean' &&
          /^[a-f0-9]{32,64}$/.test(source.source_revision),
      ),
    );
    assert.deepEqual(dimension(profile, 'saque'), {
      dimension_key: 'saque',
      value: 4,
      community_count: 2,
    });
    assert.deepEqual(dimension(profile, 'ataque'), {
      dimension_key: 'ataque',
      value: 4,
      community_count: 1,
    });
    assert.deepEqual(dimension(profile, 'defesa'), {
      dimension_key: 'defesa',
      value: null,
      community_count: 0,
    });
    assert.deepEqual(await sourceSnapshot(), before);
  });

  test('returns empty registered dimensions and isolates Player and rubric sources', async () => {
    const ownerId = await user();
    const playerId = await player(ownerId);
    const otherPlayerId = await player(ownerId, 'Other player');
    const communityId = await community(ownerId, 'Isolation');
    await addPlayer(communityId, playerId, ownerId);
    await addPlayer(communityId, otherPlayerId, ownerId);
    const evaluatorId = await evaluator(communityId);
    await record(evaluatorId, communityId, otherPlayerId, { saque: 10 });

    const empty = await read(playerId);
    assert.equal(empty.community_count, 0);
    assert.deepEqual(empty.community_sources, []);
    assert.equal(empty.dimensions.length, 11);
    assert.ok(empty.dimensions.every((item) => item.value === null && item.community_count === 0));

    const version = `global-profile-${randomUUID()}`;
    await client.query(
      `insert into public.skill_rubric_versions (rubric_version, status, provenance)
       values ($1, 'EXPERIMENTAL', 'Test fixture')`,
      [version],
    );
    await client.query(
      `insert into public.skill_rubric_dimensions
       (rubric_version, dimension_key, kind, is_required, display_order)
       values ($1, 'custom-zero', 'SOURCE', false, 1),
              ($1, 'custom-missing', 'SOURCE', false, 2)`,
      [version],
    );
    await record(evaluatorId, communityId, playerId, { 'custom-zero': 0 }, version);
    const custom = await read(playerId, version);
    assert.equal(custom.community_count, 1);
    assert.deepEqual(custom.dimensions, [
      { dimension_key: 'custom-zero', value: 0, community_count: 1 },
      { dimension_key: 'custom-missing', value: null, community_count: 0 },
    ]);
    assert.notEqual(custom.source_revision, empty.source_revision);
    assert.equal((await read(playerId)).source_revision, empty.source_revision);
  });

  test('revision changes on same-score replacement but ignores timestamps, standing and unrelated writes', async () => {
    const ownerId = await user();
    const playerId = await player(ownerId);
    const communityId = await community(ownerId, 'Revision');
    await addPlayer(communityId, playerId, ownerId);
    const evaluatorId = await evaluator(communityId);
    await record(evaluatorId, communityId, playerId, { saque: 6 });
    const original = await read(playerId);
    await client.query(
      'update public.community_players set active=false where community_id=$1 and player_id=$2',
      [communityId, playerId],
    );
    await client.query(
      'update public.community_responsibilities set revoked_at=now() where community_id=$1 and user_id=$2',
      [communityId, evaluatorId],
    );
    await client.query(
      "update public.players set name='Renamed', attributes='{\"overall\":10}' where id=$1",
      [playerId],
    );
    await client.query(
      `insert into public.player_evaluations
       (owner_id, player_id, community_id, attributes, profile)
       values ($1, $2, $3, '{"saque":1}', '{"overall":10}')`,
      [ownerId, playerId, communityId],
    );
    await client.query(
      `insert into public.self_evaluations (player_id, attributes)
       values ($1, '{"saque":10,"overall":10}')`,
      [playerId],
    );
    const afterLegacyWrite = await read(playerId);
    assert.equal(afterLegacyWrite.source_revision, original.source_revision);
    assert.deepEqual(afterLegacyWrite.dimensions, original.dimensions);

    const unrelatedPlayerId = await player(ownerId, 'Unrelated player');
    await addPlayer(communityId, unrelatedPlayerId, ownerId);

    await client.query(
      'update public.community_responsibilities set revoked_at=null where community_id=$1 and user_id=$2',
      [communityId, evaluatorId],
    );
    await client.query(
      'update public.community_players set active=true where community_id=$1 and player_id=$2',
      [communityId, playerId],
    );
    await record(evaluatorId, communityId, unrelatedPlayerId, { saque: 10 });
    assert.equal((await read(playerId)).source_revision, original.source_revision);
    assert.equal((await read(playerId)).source_revision, original.source_revision);
    const version = `replacement-${randomUUID()}`;
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
    await record(evaluatorId, communityId, playerId, { saque: 6 }, version);
    await record(evaluatorId, communityId, playerId, { saque: 6 });
    const replacement = await read(playerId);
    assert.equal(dimension(replacement, 'saque').value, 6);
    assert.notEqual(replacement.source_revision, original.source_revision);
  });

  test('validates private inputs and denies browser roles execution of both helpers', async () => {
    for (const [args, message] of [
      [[null, VERSION], 'Player is required and must exist'],
      [[randomUUID(), VERSION], 'Player is required and must exist'],
    ] as const) {
      await assert.rejects(client.query(READ, [...args]), (error: unknown) => {
        assert.equal((error as Error & { code: string }).code, '23514');
        assert.equal((error as Error).message, message);
        return true;
      });
    }
    const ownerId = await user();
    const playerId = await player(ownerId);
    for (const version of [null, '', '  ', 'unknown']) {
      await assert.rejects(client.query(READ, [playerId, version]), (error: unknown) => {
        assert.equal((error as Error & { code: string }).code, '23514');
        assert.equal((error as Error).message, 'Rubric version is not registered');
        return true;
      });
    }
    const { rows } = await client.query(
      `select p.proname, p.provolatile, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='app_private'
        and p.proname=any($1)
      order by p.proname`,
      [['compute_community_player_skill_profile', 'compute_global_player_skill_profile']],
    );
    assert.deepEqual(rows, [
      {
        proname: 'compute_community_player_skill_profile',
        provolatile: 's',
        prosecdef: false,
        proconfig: ['search_path=""'],
        anon_execute: false,
        authenticated_execute: false,
      },
      {
        proname: 'compute_global_player_skill_profile',
        provolatile: 's',
        prosecdef: false,
        proconfig: ['search_path=""'],
        anon_execute: false,
        authenticated_execute: false,
      },
    ]);
    for (const actor of [null, await user()]) {
      await assert.rejects(
        asIdentity(client, actor, () => client.query(READ, [playerId, VERSION])),
        (error: unknown) => {
          assert.equal((error as Error & { code: string }).code, '42501');
          return true;
        },
      );
      await assert.rejects(
        asIdentity(client, actor, () =>
          client.query('select app_private.compute_community_player_skill_profile($1,$2,$3)', [
            randomUUID(),
            playerId,
            VERSION,
          ]),
        ),
        (error: unknown) => {
          assert.equal((error as Error & { code: string }).code, '42501');
          return true;
        },
      );
    }
  });

  test('preserves the public Community profile output and authorization wrapper', async () => {
    const ownerId = await user();
    const playerId = await player(ownerId);
    const communityId = await community(ownerId, 'Compatibility');
    await addPlayer(communityId, playerId, ownerId);
    const evaluatorId = await evaluator(communityId);
    await record(evaluatorId, communityId, playerId, { saque: 7 });
    const expected = (
      await client.query<{ profile: Record<string, unknown> }>(
        'select app_private.compute_community_player_skill_profile($1,$2,$3) as profile',
        [communityId, playerId, VERSION],
      )
    ).rows[0].profile;
    const actual = (
      await asIdentity(client, evaluatorId, () =>
        client.query<{ profile: Record<string, unknown> }>(
          'select public.get_community_player_skill_profile($1,$2,$3) as profile',
          [communityId, playerId, VERSION],
        ),
      )
    ).rows[0].profile;
    assert.deepEqual({ ...actual, calculated_at: null }, { ...expected, calculated_at: null });
    await assert.rejects(
      asIdentity(client, ownerId, () =>
        client.query('select public.get_community_player_skill_profile($1,$2,$3)', [
          communityId,
          playerId,
          VERSION,
        ]),
      ),
      (error: unknown) => {
        assert.equal((error as Error & { code: string }).code, '42501');
        return true;
      },
    );
  });
}
