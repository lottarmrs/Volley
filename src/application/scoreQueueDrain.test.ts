import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySessionBundle } from './sessionDataQueries';
import { makeSession } from '../test/fixtures';
import type { ScoreQueueEntry, ScoreQueueState } from './scoreQueue';
import { drainScoreQueue } from './scoreQueueDrain';

const pelada = makeSession('s1');

function entrada(seq: number, pontoId: string): ScoreQueueEntry {
  return {
    seq,
    at: 'x',
    sessionId: 's1',
    sessionBefore: pelada,
    sessionAfter: null,
    upserts: {
      games: [],
      pointEvents: [{ id: pontoId, sessionId: 's1', gameId: 'g1' } as never],
      gameReports: [],
    },
    removals: { games: [], pointEvents: [], gameReports: [] },
  };
}

function fila(...entries: ScoreQueueEntry[]): ScoreQueueState {
  return {
    userId: 'u1',
    sessionId: 's1',
    base: emptySessionBundle(),
    knownPointIds: [],
    entries,
  };
}

const semConflito = async () => ({
  controlledByUserId: 'u1',
  controllerName: null,
  pointIds: [],
  sessionEnded: false,
});

test('envia em ordem e zera', async () => {
  const enviados: number[] = [];
  const progresso: (ScoreQueueState | null)[] = [];
  const r = await drainScoreQueue({
    state: fila(entrada(1, 'p1'), entrada(2, 'p2')),
    force: false,
    sessionCloudId: 's1',
    fetchLive: semConflito,
    send: async (e) => {
      enviados.push(e.seq);
    },
    onProgress: (s) => {
      progresso.push(s);
    },
  });
  assert.deepEqual(r, { kind: 'done' });
  assert.deepEqual(enviados, [1, 2]);
  assert.deepEqual(progresso[0]?.knownPointIds, ['p1']);
  assert.equal(progresso[1], null);
});

test('conflito nao envia nada; com force envia sem conferir', async () => {
  let conferiu = false;
  const enviados: number[] = [];

  const send = async (e: ScoreQueueEntry) => {
    enviados.push(e.seq);
  };

  const r = await drainScoreQueue({
    state: fila(entrada(1, 'p1')),
    force: false,
    sessionCloudId: 's1',
    fetchLive: async () => ({
      controlledByUserId: 'u2',
      controllerName: 'Bia',
      pointIds: ['x'],
      sessionEnded: false,
    }),
    send,
    onProgress: () => {},
  });
  assert.equal(r.kind, 'conflict');
  assert.deepEqual(enviados, []);

  const forcado = await drainScoreQueue({
    state: fila(entrada(1, 'p1')),
    force: true,
    sessionCloudId: 's1',
    fetchLive: async () => {
      conferiu = true;
      return semConflito();
    },
    send,
    onProgress: () => {},
  });
  assert.deepEqual(forcado, { kind: 'done' });
  assert.equal(conferiu, false);
  assert.deepEqual(enviados, [1]);
});

test('falha de rede no meio para e guarda o resto', async () => {
  const progresso: (ScoreQueueState | null)[] = [];
  const r = await drainScoreQueue({
    state: fila(entrada(1, 'p1'), entrada(2, 'p2')),
    force: false,
    sessionCloudId: 's1',
    fetchLive: semConflito,
    send: async (e) => {
      if (e.seq === 2) throw new TypeError('Failed to fetch');
    },
    onProgress: (s) => {
      progresso.push(s);
    },
  });
  assert.equal(r.kind, 'stopped');
  assert.equal((r as { refused: boolean }).refused, false);
  assert.deepEqual(
    progresso.at(-1)?.entries.map((e) => e.seq),
    [2],
  );
});

test('recusa definitiva do servidor para com refused', async () => {
  const r = await drainScoreQueue({
    state: fila(entrada(1, 'p1')),
    force: false,
    sessionCloudId: 's1',
    fetchLive: semConflito,
    send: async () => {
      throw { code: '42501', message: 'new row violates row-level security policy' };
    },
    onProgress: () => {},
  });
  assert.equal(r.kind, 'stopped');
  assert.equal((r as { refused: boolean }).refused, true);
});

test('erro 5xx ao enviar ou falha ao ler o placar e parada temporaria', async () => {
  const envio = await drainScoreQueue({
    state: fila(entrada(1, 'p1')),
    force: false,
    sessionCloudId: 's1',
    fetchLive: semConflito,
    send: async () => {
      throw { code: '', message: 'Internal Server Error' };
    },
    onProgress: () => {},
  });
  assert.equal(envio.kind, 'stopped');
  assert.equal((envio as { refused: boolean }).refused, false);

  const leitura = await drainScoreQueue({
    state: fila(entrada(1, 'p1')),
    force: false,
    sessionCloudId: 's1',
    fetchLive: async () => {
      throw { code: '42501', message: 'leitura recusada' };
    },
    send: async () => {},
    onProgress: () => {},
  });
  assert.equal(leitura.kind, 'stopped');
  assert.equal((leitura as { refused: boolean }).refused, false);
});
