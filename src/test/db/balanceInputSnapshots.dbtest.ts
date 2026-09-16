import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentity,
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

interface Participant {
  participant_id: string;
  identity_kind: 'PLAYER' | 'GUEST';
  display_name_at_time: string;
  attribute_vector: Record<string, number>;
  estimated_dimensions: string[];
  is_estimated: boolean;
  source_profile_revision: string | null;
  height_cm: number | null;
  gender: string | null;
  primary_position: string | null;
  secondary_positions: string[];
  is_injured: boolean;
}

interface Snapshot {
  snapshot_id: string;
  session_id: string;
  roster_revision_id: string;
  rubric_version: string;
  resolver_version: string;
  global_policy_version: string;
  community_policy_version: string;
  captured_at: string;
  input_fingerprint: string;
  participants: Participant[];
}

const RUBRIC = 'v0-legacy-11';
const MIGRATION = '20260908170000_balance_input_snapshots.sql';

interface RosterEntry {
  playerId?: string;
  displayName: string;
}

if (!isTestDatabaseConfigured()) {
  test(`balance input snapshots require ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function newCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [name]),
    );
    await client.query(
      'delete from app_private.community_evaluation_cutovers where community_id = $1',
      [rows[0].id],
    );
    return rows[0].id;
  }

  async function activeMembership(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [communityId, userId],
    );
  }

  async function grantResponsibility(
    communityId: string,
    userId: string,
    responsibility: string,
  ): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, $3)
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, userId, responsibility],
    );
  }

  async function activateEvaluationModel(ownerId: string, communityId: string): Promise<void> {
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select public.activate_community_evaluation_model($1)', [communityId]),
    );
  }

  async function newPlayer(
    ownerId: string,
    communityId: string,
    input: {
      name?: string;
      height?: number | null;
      gender?: string | null;
      primaryPosition?: string | null;
      secondaryPositions?: string[];
      status?: Record<string, unknown>;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (
         id, owner_id, name, height, gender, primary_position, secondary_positions, status,
         has_account_identity_history
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, false)`,
      [
        id,
        ownerId,
        input.name ?? 'Atleta',
        input.height ?? null,
        input.gender ?? null,
        input.primaryPosition ?? null,
        input.secondaryPositions ?? [],
        JSON.stringify(input.status ?? {}),
      ],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, id, ownerId],
    );
    return id;
  }

  async function newEvaluator(ownerId: string, communityId: string): Promise<string> {
    const id = await newUser('evaluator');
    await activeMembership(communityId, id);
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select public.set_community_evaluator($1, $2, true)', [communityId, id]),
    );
    return id;
  }

  // Concede EVALUATOR sem passar por set_community_evaluator, que exige a comunidade ja
  // ativada. E o unico jeito de montar uma origem em sombra: avaliacao gravada numa
  // comunidade que nunca ativou o modelo novo.
  async function rawEvaluator(communityId: string): Promise<string> {
    const id = await newUser('shadow-evaluator');
    await activeMembership(communityId, id);
    await grantResponsibility(communityId, id, 'EVALUATOR');
    return id;
  }

  async function recordEvaluation(
    evaluatorId: string,
    communityId: string,
    playerId: string,
    dimensions: Record<string, number>,
  ): Promise<void> {
    await asIdentityCommitting(client, evaluatorId, () =>
      client.query('select * from public.record_player_evaluation($1,$2,$3,$4,$5,$6)', [
        randomUUID(),
        randomUUID(),
        communityId,
        playerId,
        RUBRIC,
        JSON.stringify(dimensions),
      ]),
    );
  }

  async function newSession(organizerId: string, communityId: string): Promise<string> {
    await grantResponsibility(communityId, organizerId, 'ORGANIZER');
    const sessionId = randomUUID();
    await asIdentityCommitting(client, organizerId, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessionId, communityId, 'Sessao de formacao'],
      ),
    );
    return sessionId;
  }

  let rosterSourceRevision = 0;
  // session_participants tem indice unico por (session_id, player_id): uma revisao nova do
  // mesmo elenco reaproveita o participante, nao cria outro. O caminho de producao
  // (finalize_session_roster) faz exatamente isso com um left join em session_participants.
  const participantsBySession = new Map<string, string>();

  async function newRosterRevision(
    sessionId: string,
    createdBy: string,
    entries: RosterEntry[],
  ): Promise<string> {
    const rosterRevisionId = randomUUID();
    rosterSourceRevision += 1;
    const payload = entries.map((entry, index) => {
      const key = `${sessionId}:${entry.playerId ?? `guest-${index}`}`;
      const participantId = participantsBySession.get(key) ?? randomUUID();
      participantsBySession.set(key, participantId);
      return {
        entry_order: index,
        participant_id: participantId,
        identity_kind: entry.playerId ? 'PLAYER' : 'GUEST',
        player_id: entry.playerId ?? null,
        display_name: entry.displayName,
      };
    });
    await client.query(
      `select app_private.materialize_target_session_roster(
         $1, $2, 'REGISTRATION', null, $3::bigint, null, $4, $5::jsonb
       )`,
      [rosterRevisionId, sessionId, rosterSourceRevision, createdBy, JSON.stringify(payload)],
    );
    return rosterRevisionId;
  }

  async function capture(
    actorId: string,
    sessionId: string,
    rosterRevisionId: string,
    commandId = randomUUID(),
  ): Promise<Snapshot> {
    const { rows } = await asIdentityCommitting(client, actorId, () =>
      client.query<{ snapshot: Snapshot }>(
        'select public.capture_balance_input_snapshot($1, $2, $3) as snapshot',
        [commandId, sessionId, rosterRevisionId],
      ),
    );
    return rows[0].snapshot;
  }

  test('capture resolves observed zero, estimates the missing entry from the roster mean, and falls back to 5 without observations', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Formacao ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const evaluatorId = await newEvaluator(ownerId, communityId);

    const evaluated = await newPlayer(ownerId, communityId, { name: 'Avaliada' });
    const unevaluated = await newPlayer(ownerId, communityId, { name: 'Sem avaliacao' });
    await recordEvaluation(evaluatorId, communityId, evaluated, { saque: 0 });

    const sessionId = await newSession(ownerId, communityId);
    const rosterRevisionId = await newRosterRevision(sessionId, ownerId, [
      { playerId: evaluated, displayName: 'Avaliada' },
      { playerId: unevaluated, displayName: 'Sem avaliacao' },
    ]);

    const snapshot = await capture(ownerId, sessionId, rosterRevisionId);

    assert.equal(snapshot.participants[0].attribute_vector.saque, 0);
    assert.equal(snapshot.participants[1].attribute_vector.saque, 0);
    assert.equal(snapshot.participants[1].attribute_vector.defesa, 5);
    assert.ok(snapshot.participants[1].estimated_dimensions.includes('saque'));
  });

  test('a media de referencia ignora estimativas e nunca sobrescreve um valor observado', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Media ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const evaluatorId = await newEvaluator(ownerId, communityId);

    const high = await newPlayer(ownerId, communityId, { name: 'Alta' });
    const low = await newPlayer(ownerId, communityId, { name: 'Baixa' });
    const missing = await newPlayer(ownerId, communityId, { name: 'Ausente' });
    await recordEvaluation(evaluatorId, communityId, high, { ataque: 9 });
    await recordEvaluation(evaluatorId, communityId, low, { ataque: 4 });

    const sessionId = await newSession(ownerId, communityId);
    const rosterRevisionId = await newRosterRevision(sessionId, ownerId, [
      { playerId: high, displayName: 'Alta' },
      { playerId: low, displayName: 'Baixa' },
      { playerId: missing, displayName: 'Ausente' },
    ]);

    const snapshot = await capture(ownerId, sessionId, rosterRevisionId);

    assert.equal(snapshot.participants[0].attribute_vector.ataque, 9);
    assert.equal(snapshot.participants[1].attribute_vector.ataque, 4);
    // (9 + 4) / 2 = 6.5. Se a estimativa entrasse na media, o proximo ausente veria 6.33.
    assert.equal(snapshot.participants[2].attribute_vector.ataque, 6.5);
    assert.equal(snapshot.participants[0].is_estimated, true);
    assert.deepEqual(
      snapshot.participants[0].estimated_dimensions.includes('ataque'),
      false,
      'a dimensao observada nao pode aparecer como estimada',
    );
    assert.equal(snapshot.participants[2].estimated_dimensions.length, 11);
  });

  test('cada comunidade de origem pesa igual, independentemente de quantos avaliaram nela', async () => {
    const ownerId = await newUser('owner');
    const communityA = await newCommunity(ownerId, `Peso A ${randomUUID()}`);
    const communityB = await newCommunity(ownerId, `Peso B ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityA);
    await activateEvaluationModel(ownerId, communityB);

    const playerId = await newPlayer(ownerId, communityA, { name: 'Compartilhada' });
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityB, playerId, ownerId],
    );

    const firstA = await newEvaluator(ownerId, communityA);
    const secondA = await newEvaluator(ownerId, communityA);
    const onlyB = await newEvaluator(ownerId, communityB);
    await recordEvaluation(firstA, communityA, playerId, { bloqueio: 10 });
    await recordEvaluation(secondA, communityA, playerId, { bloqueio: 10 });
    await recordEvaluation(onlyB, communityB, playerId, { bloqueio: 2 });

    const sessionId = await newSession(ownerId, communityA);
    const rosterRevisionId = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Compartilhada' },
    ]);

    const snapshot = await capture(ownerId, sessionId, rosterRevisionId);

    // Peso por comunidade: (10 + 2) / 2 = 6. Peso por avaliador daria 7.3. O valor
    // esperado nao pode ser 5, que e tambem o fallback de "nenhuma observacao" -- a
    // assercao deixaria de distinguir as duas coisas.
    assert.equal(snapshot.participants[0].attribute_vector.bloqueio, 6);
    assert.equal(snapshot.participants[0].is_estimated, true);
    assert.equal(snapshot.participants[0].estimated_dimensions.includes('bloqueio'), false);
  });

  test('um Guest entra no elenco inteiramente estimado, sem perfil e sem metadado fisico', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Convidado ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const evaluatorId = await newEvaluator(ownerId, communityId);

    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    await recordEvaluation(evaluatorId, communityId, playerId, { saque: 8 });

    const sessionId = await newSession(ownerId, communityId);
    const rosterRevisionId = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
      { displayName: 'Convidado da vez' },
    ]);

    const snapshot = await capture(ownerId, sessionId, rosterRevisionId);
    const guest = snapshot.participants[1];

    assert.equal(guest.identity_kind, 'GUEST');
    assert.equal(guest.display_name_at_time, 'Convidado da vez');
    assert.equal(guest.source_profile_revision, null);
    assert.equal(guest.height_cm, null);
    assert.equal(guest.gender, null);
    assert.equal(guest.primary_position, null);
    assert.deepEqual(guest.secondary_positions, []);
    assert.equal(guest.is_injured, false);
    assert.equal(guest.is_estimated, true);
    assert.equal(guest.estimated_dimensions.length, 11);
    // O Guest recebe a media do elenco -- e nao contribui para ela.
    assert.equal(guest.attribute_vector.saque, 8);
  });

  test('metadados fisicos e de posicao vem congelados do atleta, com altura invalida virando desconhecida', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Metadados ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);

    const complete = await newPlayer(ownerId, communityId, {
      name: 'Completa',
      height: 178,
      gender: 'F',
      primaryPosition: 'oposto',
      secondaryPositions: ['ponteiro', 'libero'],
      status: { lesionado: true },
    });
    const invalid = await newPlayer(ownerId, communityId, {
      name: 'Altura invalida',
      height: 0,
      status: { lesionado: 'sim' },
    });

    const sessionId = await newSession(ownerId, communityId);
    const rosterRevisionId = await newRosterRevision(sessionId, ownerId, [
      { playerId: complete, displayName: 'Completa' },
      { playerId: invalid, displayName: 'Altura invalida' },
    ]);

    const snapshot = await capture(ownerId, sessionId, rosterRevisionId);

    assert.equal(snapshot.participants[0].height_cm, 178);
    assert.equal(snapshot.participants[0].gender, 'F');
    assert.equal(snapshot.participants[0].primary_position, 'oposto');
    assert.deepEqual(snapshot.participants[0].secondary_positions, ['ponteiro', 'libero']);
    assert.equal(snapshot.participants[0].is_injured, true);

    assert.equal(snapshot.participants[1].height_cm, null);
    assert.equal(
      snapshot.participants[1].is_injured,
      false,
      'somente o booleano JSON true marca lesao; "sim" nao e status estruturado',
    );
  });

  test('somente o Organizer designado captura: governanca, avaliador, estranho e anonimo recebem 42501', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Autorizacao ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);

    const admin = await newUser('admin');
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'admin', 'active')`,
      [communityId, admin],
    );
    const evaluatorId = await newEvaluator(ownerId, communityId);
    const outsider = await newUser('outsider');

    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    const sessionId = await newSession(ownerId, communityId);
    const rosterRevisionId = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);

    for (const actor of [admin, evaluatorId, outsider, null]) {
      const error = await asIdentity(client, actor, () =>
        client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
          randomUUID(),
          sessionId,
          rosterRevisionId,
        ]),
      ).catch((thrown: Error) => thrown);
      assert.equal(
        (error as { code?: string }).code,
        '42501',
        `ator ${actor ?? 'anonimo'} nao pode capturar entradas de formacao`,
      );
    }

    const snapshot = await capture(ownerId, sessionId, rosterRevisionId);
    assert.equal(snapshot.participants.length, 1);
  });

  test('a revisao precisa ser a corrente e da propria Session: cruzada 23514, antiga 40001', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Revisao ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });

    const sessionId = await newSession(ownerId, communityId);
    const otherSessionId = await newSession(ownerId, communityId);
    const stale = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);
    const current = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);
    const foreign = await newRosterRevision(otherSessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);

    const crossed = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        foreign,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((crossed as { code?: string }).code, '23514');

    const old = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        stale,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((old as { code?: string }).code, '40001');

    const snapshot = await capture(ownerId, sessionId, current);
    assert.equal(snapshot.roster_revision_id, current);
  });

  test('elenco vazio e atleta sem vinculo vivo interrompem a captura', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Elegibilidade ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);

    const sessionId = await newSession(ownerId, communityId);
    const emptyRevision = await newRosterRevision(sessionId, ownerId, []);
    const empty = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        emptyRevision,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((empty as { code?: string }).code, '23514');

    const inactive = await newPlayer(ownerId, communityId, { name: 'Inativa' });
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId: inactive, displayName: 'Inativa' },
    ]);
    await client.query('update public.players set active = false where id = $1', [inactive]);

    const blocked = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        revision,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((blocked as { code?: string }).code, '23514');

    await client.query('update public.players set active = true where id = $1', [inactive]);
    await client.query('update public.players set deleted_at = now() where id = $1', [inactive]);
    const softDeleted = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        revision,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((softDeleted as { code?: string }).code, '23514');

    await client.query('update public.players set deleted_at = null where id = $1', [inactive]);
    await client.query(
      'update public.community_players set deleted_at = now() where player_id = $1',
      [inactive],
    );
    const softUnlinked = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        revision,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal(
      (softUnlinked as { code?: string }).code,
      '23514',
      'vinculo removido em soft delete tambem interrompe',
    );

    await client.query(
      'update public.community_players set deleted_at = null where player_id = $1',
      [inactive],
    );
    await client.query('update public.community_players set active = false where player_id = $1', [
      inactive,
    ]);
    const unlinked = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        revision,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((unlinked as { code?: string }).code, '23514');
  });

  test('comunidade em sombra interrompe a captura, tanto a da Session quanto a de origem', async () => {
    const ownerId = await newUser('owner');
    const shadowCommunity = await newCommunity(ownerId, `Sombra ${randomUUID()}`);
    const playerId = await newPlayer(ownerId, shadowCommunity, { name: 'Titular' });
    const sessionId = await newSession(ownerId, shadowCommunity);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);

    const notActivated = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        revision,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((notActivated as { code?: string }).code, '23514');

    // A Session ativa, mas o atleta traz avaliacao de uma comunidade que nunca ativou:
    // a origem em sombra nao pode ser promovida a entrada confiavel nem omitida em silencio.
    await activateEvaluationModel(ownerId, shadowCommunity);
    const otherCommunity = await newCommunity(ownerId, `Origem sombra ${randomUUID()}`);
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [otherCommunity, playerId, ownerId],
    );
    const shadowEvaluator = await rawEvaluator(otherCommunity);
    await recordEvaluation(shadowEvaluator, otherCommunity, playerId, { saque: 7 });

    const mixed = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        revision,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((mixed as { code?: string }).code, '23514');

    await activateEvaluationModel(ownerId, otherCommunity);
    const snapshot = await capture(ownerId, sessionId, revision);
    assert.equal(snapshot.participants[0].attribute_vector.saque, 7);
  });

  test('o replay do mesmo comando devolve o snapshot congelado mesmo depois das origens mudarem', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Replay ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const evaluatorId = await newEvaluator(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular', height: 180 });
    await recordEvaluation(evaluatorId, communityId, playerId, { defesa: 3 });

    const sessionId = await newSession(ownerId, communityId);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);

    const commandId = randomUUID();
    const original = await capture(ownerId, sessionId, revision, commandId);
    assert.equal(original.participants[0].attribute_vector.defesa, 3);
    assert.equal(original.snapshot_id, commandId);

    await recordEvaluation(evaluatorId, communityId, playerId, { defesa: 10 });
    await client.query('update public.players set height = 191 where id = $1', [playerId]);

    const replay = await capture(ownerId, sessionId, revision, commandId);
    assert.deepEqual(replay, original, 'o replay nao pode recalcular nada');

    const fresh = await capture(ownerId, sessionId, revision);
    assert.equal(fresh.participants[0].attribute_vector.defesa, 10);
    assert.equal(fresh.participants[0].height_cm, 191);
    assert.notEqual(fresh.input_fingerprint, original.input_fingerprint);
  });

  test('a impressao digital iguala entradas logicamente identicas e separa origens diferentes', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Digital ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const evaluatorId = await newEvaluator(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    await recordEvaluation(evaluatorId, communityId, playerId, { saque: 6 });

    const sessionId = await newSession(ownerId, communityId);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);

    const first = await capture(ownerId, sessionId, revision);
    const second = await capture(ownerId, sessionId, revision);
    assert.equal(second.input_fingerprint, first.input_fingerprint);
    assert.notEqual(second.snapshot_id, first.snapshot_id);
    assert.notEqual(second.captured_at, first.captured_at);

    // Mesma nota, origem nova: a revisao de origem muda, entao a entrada nao e a mesma.
    await recordEvaluation(evaluatorId, communityId, playerId, { saque: 6 });
    const third = await capture(ownerId, sessionId, revision);
    assert.equal(third.participants[0].attribute_vector.saque, 6);
    assert.notEqual(third.input_fingerprint, first.input_fingerprint);
  });

  test('reusar o comando para outro elenco e 23505, e nao reescreve o snapshot original', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Reuso ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });

    const sessionId = await newSession(ownerId, communityId);
    const first = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);
    const commandId = randomUUID();
    const original = await capture(ownerId, sessionId, first, commandId);

    const second = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular renomeada' },
    ]);
    const reused = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        commandId,
        sessionId,
        second,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((reused as { code?: string }).code, '23505');

    const { rows } = await client.query<{ payload: Snapshot }>(
      'select payload from app_private.balance_input_snapshots where id = $1',
      [commandId],
    );
    assert.deepEqual(rows[0].payload, original);
  });

  test('duas capturas simultaneas do mesmo comando produzem uma linha e um recibo', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Concorrencia ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    const sessionId = await newSession(ownerId, communityId);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);

    const commandId = randomUUID();
    const pool = createPool(2);
    try {
      const race = async () => {
        const connection = await pool.connect();
        try {
          const { rows } = await asIdentityCommitting(connection, ownerId, () =>
            connection.query<{ snapshot: Snapshot }>(
              'select public.capture_balance_input_snapshot($1, $2, $3) as snapshot',
              [commandId, sessionId, revision],
            ),
          );
          return rows[0].snapshot;
        } finally {
          connection.release();
        }
      };
      const [left, right] = await Promise.all([race(), race()]);
      assert.deepEqual(left, right);
    } finally {
      await pool.end();
    }

    const { rows } = await client.query<{ snapshots: number; receipts: number }>(
      `select
         (select count(*)::integer from app_private.balance_input_snapshots where id = $1)
           as snapshots,
         (select count(*)::integer from app_private.command_receipts
           where command_id = $1 and command_type = 'capture_balance_input_snapshot')
           as receipts`,
      [commandId],
    );
    assert.deepEqual(rows[0], { snapshots: 1, receipts: 1 });
  });

  test('um comando recusado nao deixa snapshot nem recibo para tras', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Atomicidade ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    const sessionId = await newSession(ownerId, communityId);
    const otherSessionId = await newSession(ownerId, communityId);
    const foreign = await newRosterRevision(otherSessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);

    const commandId = randomUUID();
    const rejected = await asIdentityCommitting(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        commandId,
        sessionId,
        foreign,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((rejected as { code?: string }).code, '23514');

    const { rows } = await client.query<{ snapshots: number; receipts: number }>(
      `select
         (select count(*)::integer from app_private.balance_input_snapshots where id = $1)
           as snapshots,
         (select count(*)::integer from app_private.command_receipts where command_id = $1)
           as receipts`,
      [commandId],
    );
    assert.deepEqual(rows[0], { snapshots: 0, receipts: 0 });

    // O mesmo command_id continua utilizavel: nada foi consumido pela recusa.
    const snapshot = await capture(ownerId, sessionId, revision, commandId);
    assert.equal(snapshot.snapshot_id, commandId);
  });

  test('o artefato e privado ao navegador e imutavel ate para quem administra o banco', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Imutavel ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    const sessionId = await newSession(ownerId, communityId);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);
    const snapshot = await capture(ownerId, sessionId, revision);

    for (const statement of [
      'select * from app_private.balance_input_snapshots',
      "insert into app_private.balance_input_snapshots (id, session_id, roster_revision_id, payload, provenance) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '{}'::jsonb, '[]'::jsonb)",
      'delete from app_private.balance_input_snapshots',
    ]) {
      const denied = await asIdentity(client, ownerId, () => client.query(statement)).catch(
        (thrown: Error) => thrown,
      );
      assert.equal(
        (denied as { code?: string }).code,
        '42501',
        `nenhum papel de navegador alcanca: ${statement}`,
      );
    }

    const updated = await client
      .query(
        `update app_private.balance_input_snapshots
            set payload = payload || '{"input_fingerprint":"forjada"}'::jsonb
          where id = $1`,
        [snapshot.snapshot_id],
      )
      .catch((thrown: Error) => thrown);
    assert.equal((updated as { code?: string }).code, '55000');

    const deleted = await client
      .query('delete from app_private.balance_input_snapshots where id = $1', [
        snapshot.snapshot_id,
      ])
      .catch((thrown: Error) => thrown);
    assert.equal((deleted as { code?: string }).code, '55000');

    // O apagamento de conta precisa continuar possivel: created_by -> null e a unica
    // transicao aceita, e nao pode levar o conteudo do snapshot junto. A transicao e
    // exercitada diretamente porque `delete from auth.users` ainda esbarra na guarda do
    // Player canonico, divida anterior registrada em authCascadeSafety.dbtest.ts -- quando
    // ela cair, e este `set null` que a FK vai disparar.
    await client.query(
      'update app_private.balance_input_snapshots set created_by = null where id = $1',
      [snapshot.snapshot_id],
    );
    const { rows } = await client.query<{ created_by: string | null; payload: Snapshot }>(
      'select created_by, payload from app_private.balance_input_snapshots where id = $1',
      [snapshot.snapshot_id],
    );
    assert.equal(rows[0].created_by, null);
    assert.deepEqual(rows[0].payload, snapshot);
  });

  test('a leitura reconfere a permissao corrente e devolve o snapshot sem expor avaliacao ou avaliador', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Leitura ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const evaluatorId = await newEvaluator(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    await recordEvaluation(evaluatorId, communityId, playerId, { recepcao: 7 });

    const sessionId = await newSession(ownerId, communityId);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);
    const snapshot = await capture(ownerId, sessionId, revision);

    const outsider = await newUser('outsider');
    for (const actor of [evaluatorId, outsider, null]) {
      const denied = await asIdentity(client, actor, () =>
        client.query('select public.read_balance_input_snapshot($1)', [snapshot.snapshot_id]),
      ).catch((thrown: Error) => thrown);
      assert.equal((denied as { code?: string }).code, '42501');
    }

    const { rows } = await asIdentity(client, ownerId, () =>
      client.query<{ snapshot: Snapshot }>(
        'select public.read_balance_input_snapshot($1) as snapshot',
        [snapshot.snapshot_id],
      ),
    );
    assert.deepEqual(rows[0].snapshot, snapshot);

    const serialized = JSON.stringify(rows[0].snapshot);
    assert.equal(serialized.includes(evaluatorId), false, 'nenhuma identidade de avaliador');
    assert.equal(serialized.includes(communityId), false, 'nenhuma identidade de comunidade');
    assert.equal(serialized.includes(playerId), false, 'nenhum player_id global');
  });

  test('deriva no registro de dimensoes interrompe a captura', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Deriva ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    const sessionId = await newSession(ownerId, communityId);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);

    await client.query(
      `insert into public.skill_rubric_dimensions (
         rubric_version, dimension_key, kind, is_required, display_order
       ) values ($1, 'sacadaNova', 'SOURCE', false, 12)`,
      [RUBRIC],
    );
    try {
      const drifted = await asIdentity(client, ownerId, () =>
        client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
          randomUUID(),
          sessionId,
          revision,
        ]),
      ).catch((thrown: Error) => thrown);
      assert.equal(
        (drifted as { code?: string }).code,
        '23514',
        'o resolver e casado com uma rubric concreta; chave nova nao pode virar atributo',
      );
    } finally {
      await client.query(
        'delete from public.skill_rubric_dimensions where rubric_version = $1 and dimension_key = $2',
        [RUBRIC, 'sacadaNova'],
      );
    }

    const snapshot = await capture(ownerId, sessionId, revision);
    assert.equal(Object.keys(snapshot.participants[0].attribute_vector).length, 11);
  });

  test('capturar nao e mutacao de elenco: a revisao da Session nao muda e o recibo traz a retencao certa', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Sem bump ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    const sessionId = await newSession(ownerId, communityId);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);

    const before = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessionId],
    );
    const commandId = randomUUID();
    await capture(ownerId, sessionId, revision, commandId);
    const after = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessionId],
    );

    assert.equal(after.rows[0].revision, before.rows[0].revision);

    const { rows } = await client.query<{ retention_class: string; aggregate_id: string }>(
      `select retention_class, aggregate_id from app_private.command_receipts
        where command_id = $1`,
      [commandId],
    );
    assert.deepEqual(rows, [
      { retention_class: 'BALANCE_INPUT_SNAPSHOT', aggregate_id: sessionId },
    ]);
  });

  test('argumento nulo e contexto inexistente falham antes de qualquer leitura de origem', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Contexto ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const sessionId = await newSession(ownerId, communityId);

    const nullArgument = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        null,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((nullArgument as { code?: string }).code, '23514');

    const unknownSession = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((unknownSession as { code?: string }).code, 'P0002');

    const unknownSnapshot = await asIdentity(client, ownerId, () =>
      client.query('select public.read_balance_input_snapshot($1)', [randomUUID()]),
    ).catch((thrown: Error) => thrown);
    assert.equal((unknownSnapshot as { code?: string }).code, 'P0002');

    const nullSnapshot = await asIdentity(client, ownerId, () =>
      client.query('select public.read_balance_input_snapshot($1)', [null]),
    ).catch((thrown: Error) => thrown);
    assert.equal((nullSnapshot as { code?: string }).code, '23514');
  });

  test('altura nao finita vira desconhecida em vez de virar string no JSON', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Infinita ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Altura infinita' });
    await client.query(`update public.players set height = 'Infinity'::numeric where id = $1`, [
      playerId,
    ]);
    const sessionId = await newSession(ownerId, communityId);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Altura infinita' },
    ]);

    // to_jsonb de um numeric nao finito emite STRING JSON ("Infinity"), que quebraria
    // `height_cm: number | null` no cliente -- e `<= 0` nao pega NaN nem +Infinity.
    const snapshot = await capture(ownerId, sessionId, revision);
    assert.equal(snapshot.participants[0].height_cm, null);

    await client.query(`update public.players set height = 'NaN'::numeric where id = $1`, [
      playerId,
    ]);
    const nextRevision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Altura infinita' },
    ]);
    const withNan = await capture(ownerId, sessionId, nextRevision);
    assert.equal(withNan.participants[0].height_cm, null);
  });

  test('depois de cancelar a Session a captura para, mas o snapshot ja capturado continua legivel', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Terminal ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    const sessionId = await newSession(ownerId, communityId);
    const revision = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);
    const snapshot = await capture(ownerId, sessionId, revision);

    const { rows: sessionRows } = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessionId],
    );
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select * from public.cancel_target_session($1, $2, $3, $4)', [
        randomUUID(),
        sessionId,
        sessionRows[0].revision,
        'Chuva',
      ]),
    );

    const blocked = await asIdentity(client, ownerId, () =>
      client.query('select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        sessionId,
        revision,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((blocked as { code?: string }).code, '23514');

    const { rows } = await asIdentity(client, ownerId, () =>
      client.query<{ snapshot: Snapshot }>(
        'select public.read_balance_input_snapshot($1) as snapshot',
        [snapshot.snapshot_id],
      ),
    );
    assert.deepEqual(rows[0].snapshot, snapshot);
  });
}
