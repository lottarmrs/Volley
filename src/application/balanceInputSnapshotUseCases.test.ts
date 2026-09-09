import assert from 'node:assert/strict';
import test from 'node:test';
import type { BalanceInputSnapshot, BalanceInputSnapshotCaptureRequest } from '@shared/types';
import {
  captureBalanceInputSnapshot,
  readBalanceInputSnapshot,
  type BalanceInputSnapshotGateway,
} from './balanceInputSnapshotUseCases';

const COMMAND_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const ROSTER_REVISION_ID = '33333333-3333-4333-8333-333333333333';

const snapshot: BalanceInputSnapshot = {
  snapshot_id: COMMAND_ID,
  session_id: SESSION_ID,
  roster_revision_id: ROSTER_REVISION_ID,
  rubric_version: 'v0-legacy-11',
  resolver_version: 'v0-global-roster-mean-5',
  global_policy_version: 'v0-equal-community-mean',
  community_policy_version: 'v0-legacy-mad-mean',
  captured_at: '2026-09-08T18:00:00.000Z',
  input_fingerprint: 'abc',
  participants: [],
};

const request: BalanceInputSnapshotCaptureRequest = {
  commandId: COMMAND_ID,
  sessionId: SESSION_ID,
  rosterRevisionId: ROSTER_REVISION_ID,
};

function gatewayThatFails(code: string): BalanceInputSnapshotGateway {
  return {
    capture: async () => {
      throw Object.assign(new Error(code), { code });
    },
    read: async () => {
      throw Object.assign(new Error(code), { code });
    },
  };
}

test('captura encaminha exatamente os identificadores recebidos, sem gerar nenhum', async () => {
  const seen: BalanceInputSnapshotCaptureRequest[] = [];
  const gateway: BalanceInputSnapshotGateway = {
    capture: async (input) => {
      seen.push(input);
      return snapshot;
    },
    read: async () => snapshot,
  };

  const result = await captureBalanceInputSnapshot(request, gateway);

  assert.equal(result.ok, true);
  assert.deepEqual(seen, [request]);
});

test('o retry do mesmo comando continua sendo o mesmo comando', async () => {
  const seen: string[] = [];
  const gateway: BalanceInputSnapshotGateway = {
    capture: async (input) => {
      seen.push(input.commandId);
      return snapshot;
    },
    read: async () => snapshot,
  };

  await captureBalanceInputSnapshot(request, gateway);
  await captureBalanceInputSnapshot(request, gateway);

  assert.deepEqual(seen, [COMMAND_ID, COMMAND_ID]);
});

test('identificador ausente para antes de chamar o servidor', async () => {
  let called = false;
  const gateway: BalanceInputSnapshotGateway = {
    capture: async () => {
      called = true;
      return snapshot;
    },
    read: async () => snapshot,
  };

  const result = await captureBalanceInputSnapshot({ ...request, rosterRevisionId: '  ' }, gateway);

  assert.equal(result.ok, false);
  assert.equal(called, false);
  if (!result.ok) assert.equal(result.error.kind, 'validation');
});

test('cada código do servidor vira um erro classificado', async () => {
  const expectations: Array<[string, string]> = [
    ['42501', 'product'],
    ['40001', 'conflict'],
    ['23505', 'conflict'],
    ['23514', 'product'],
    ['P0002', 'product'],
    ['42883', 'technical'],
    ['PGRST202', 'technical'],
    ['CLOUD_UNAVAILABLE', 'product'],
  ];

  for (const [code, kind] of expectations) {
    const result = await captureBalanceInputSnapshot(request, gatewayThatFails(code));
    assert.equal(result.ok, false, `${code} não pode ser tratado como sucesso`);
    if (!result.ok) assert.equal(result.error.kind, kind, `código ${code}`);
  }

  // 42501 vira erro de produto, como no resto da camada, mas precisa continuar
  // distinguível de um contexto inválido — é a diferença entre "você não pode" e
  // "isto não existe assim".
  const denied = await captureBalanceInputSnapshot(request, gatewayThatFails('42501'));
  assert.equal(denied.ok, false);
  if (!denied.ok && denied.error.kind === 'product') {
    assert.equal(denied.error.code, 'permission_denied');
  }
});

test('o conflito de comando reutilizado se distingue do conflito de elenco vencido', async () => {
  const reused = await captureBalanceInputSnapshot(request, gatewayThatFails('23505'));
  const stale = await captureBalanceInputSnapshot(request, gatewayThatFails('40001'));

  assert.equal(reused.ok, false);
  assert.equal(stale.ok, false);
  if (!reused.ok && !stale.ok) {
    assert.equal(reused.error.kind, 'conflict');
    assert.equal(stale.error.kind, 'conflict');
    if (reused.error.kind === 'conflict' && stale.error.kind === 'conflict') {
      assert.notEqual(reused.error.resource, stale.error.resource);
    }
  }
});

test('a leitura fala na própria voz: negar leitura não pode falar em capturar', async () => {
  const denied = await readBalanceInputSnapshot(COMMAND_ID, gatewayThatFails('42501'));
  const offline = await readBalanceInputSnapshot(COMMAND_ID, gatewayThatFails('ECONNRESET'));

  assert.equal(denied.ok, false);
  assert.equal(offline.ok, false);
  if (!denied.ok) assert.equal(denied.error.message.includes('capturar'), false);
  if (!offline.ok) assert.equal(offline.error.message.includes('capturar'), false);

  const capturing = await captureBalanceInputSnapshot(request, gatewayThatFails('42501'));
  assert.equal(capturing.ok, false);
  if (!capturing.ok) assert.ok(capturing.error.message.includes('capturar'));
});

test('a leitura devolve o snapshot e recusa identificador em branco antes da rede', async () => {
  let called = false;
  const gateway: BalanceInputSnapshotGateway = {
    capture: async () => snapshot,
    read: async () => {
      called = true;
      return snapshot;
    },
  };

  const blank = await readBalanceInputSnapshot('   ', gateway);
  assert.equal(blank.ok, false);
  assert.equal(called, false);

  const found = await readBalanceInputSnapshot(COMMAND_ID, gateway);
  assert.equal(found.ok, true);
  if (found.ok) assert.deepEqual(found.value, snapshot);
});
