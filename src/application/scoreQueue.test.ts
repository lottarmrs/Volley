import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeSession } from '../test/fixtures';
import type { PointEvent } from '@shared/types';
import { emptySessionBundle, type SessionBundle } from './sessionDataQueries';
import {
  applyQueue,
  bundlesForEntry,
  conflictMessage,
  detectQueueConflict,
  entryFromChange,
  isScoringChange,
  pendingLabel,
  pushEntry,
  queuedPointCount,
  startScoreQueue,
} from './scoreQueue';

const pelada = makeSession('s1', { status: 'active', controlledByUserId: 'u1' });
const outra = makeSession('s2', { status: 'active' });
const jogo = makeGame('g1', 's1');

function ponto(id: string, antes: number, extra: Partial<PointEvent> = {}): PointEvent {
  return {
    id,
    sessionId: 's1',
    gameId: 'g1',
    sequenceNumber: antes + 1,
    scoringTeamId: 'team-a',
    concedingTeamId: 'team-b',
    scoreBefore: { teamA: antes, teamB: 0 },
    scoreAfter: { teamA: antes + 1, teamB: 0 },
    timestamp: `2026-10-05T20:00:0${antes}.000Z`,
    ...extra,
  };
}

function bundle(over: Partial<SessionBundle> = {}): SessionBundle {
  return { ...emptySessionBundle(), sessions: [pelada, outra], games: [jogo], ...over };
}

function marcar(antes: SessionBundle, p: PointEvent): SessionBundle {
  return {
    ...antes,
    pointEvents: [...antes.pointEvents, p],
    games: antes.games.map((g) =>
      g.id === 'g1' ? { ...g, scoreA: p.scoreAfter.teamA, pointIds: [...g.pointIds, p.id] } : g,
    ),
  };
}

const filaDe = (s?: { config?: unknown } | null) =>
  (s?.config as { initialQueue?: string[] } | undefined)?.initialQueue;

const roundtrip = <T>(valor: T): T => JSON.parse(JSON.stringify(valor)) as T;

test('ponto e jogo da pelada ativa sao mudanca do placar', () => {
  const antes = bundle();
  assert.equal(isScoringChange(antes, marcar(antes, ponto('p1', 0)), 's1'), true);
});

test('encerrar, mexer em times ou em outra pelada nao entra na fila', () => {
  const antes = bundle();
  const encerrada = { ...antes, sessions: [{ ...pelada, status: 'finished' as const }, outra] };
  assert.equal(isScoringChange(antes, encerrada, 's1'), false);
  const times = { ...antes, teams: [{ id: 't', sessionId: 's1', name: 'T', playerIds: [] }] };
  assert.equal(isScoringChange(antes, times as unknown as SessionBundle, 's1'), false);
  const alheio = { ...antes, games: [...antes.games, makeGame('g9', 's2')] };
  assert.equal(isScoringChange(antes, alheio, 's1'), false);
});

test('rodizio na raiz, com o mesmo status, entra na fila', () => {
  const antes = bundle();
  const rodizio = {
    ...antes,
    sessions: [{ ...pelada, config: { ...pelada.config!, initialQueue: ['x'] } }, outra],
  } as SessionBundle;
  assert.equal(isScoringChange(antes, rodizio, 's1'), true);
});

test('a entrada guarda so o que mudou e sobrevive ao JSON', () => {
  const antes = bundle();
  const depois = marcar(antes, ponto('p1', 0));
  const entrada = roundtrip(entryFromChange(antes, depois, 's1', 1, 'agora'));
  assert.deepEqual(
    entrada.upserts.pointEvents.map((p) => p.id),
    ['p1'],
  );
  assert.deepEqual(
    entrada.upserts.games.map((g) => g.id),
    ['g1'],
  );
  assert.equal(entrada.sessionAfter, null);
  const { prev, next } = bundlesForEntry(entrada);
  assert.equal(prev.sessions[0], next.sessions[0]);
  assert.deepEqual(prev.pointEvents, []);
  assert.deepEqual(
    next.pointEvents.map((p) => p.id),
    ['p1'],
  );
});

test('a releitura do banco com a fila por cima nao volta o placar', () => {
  const base = bundle();
  const um = marcar(base, ponto('p1', 0));
  const dois = marcar(um, ponto('p2', 1));
  const entradas = roundtrip([
    entryFromChange(base, um, 's1', 1, 'a'),
    entryFromChange(um, dois, 's1', 2, 'b'),
  ]);
  const visto = applyQueue(base, entradas);
  assert.equal(visto.games.find((g) => g.id === 'g1')?.scoreA, 2);
  assert.deepEqual(
    visto.pointEvents.map((p) => p.id),
    ['p1', 'p2'],
  );
  assert.deepEqual(
    visto.sessions.map((s) => s.id),
    ['s1', 's2'],
  );
});

test('desfazer depois de marcar, os dois na fila, termina com o ponto marcado como desfeito', () => {
  const base = bundle();
  const um = marcar(base, ponto('p1', 0));
  const desfeito = {
    ...um,
    pointEvents: um.pointEvents.map((p) => ({ ...p, deletedAt: 'x' })),
    games: um.games.map((g) => ({ ...g, scoreA: 0, pointIds: [] })),
  };
  const entradas = [
    entryFromChange(base, um, 's1', 1, 'a'),
    entryFromChange(um, desfeito, 's1', 2, 'b'),
  ];
  const visto = applyQueue(base, entradas);
  assert.equal(visto.games[0].scoreA, 0);
  assert.equal(visto.pointEvents[0].deletedAt, 'x');
});

test('conta os pontos guardados sem os desfeitos', () => {
  const base = bundle();
  const um = marcar(base, ponto('p1', 0));
  const dois = marcar(um, ponto('p2', 1));
  const desfeito = {
    ...dois,
    pointEvents: dois.pointEvents.map((p) => (p.id === 'p2' ? { ...p, deletedAt: 'x' } : p)),
  };
  let fila = startScoreQueue({ userId: 'u1', sessionId: 's1', base });
  fila = pushEntry(fila, entryFromChange(base, um, 's1', 1, 'a'));
  fila = pushEntry(fila, entryFromChange(um, dois, 's1', 2, 'b'));
  fila = pushEntry(fila, entryFromChange(dois, desfeito, 's1', 3, 'c'));
  assert.equal(queuedPointCount(fila), 1);
});

test('conflito quando outra pessoa assumiu ou marcou; sem conflito com so os meus', () => {
  const base = bundle({ pointEvents: [ponto('p0', 0)] });
  const um = marcar(base, ponto('p1', 1));
  let fila = startScoreQueue({ userId: 'u1', sessionId: 's1', base });
  fila = pushEntry(fila, entryFromChange(base, um, 's1', 1, 'a'));

  assert.equal(
    detectQueueConflict({
      state: fila,
      live: {
        controlledByUserId: 'u1',
        controllerName: null,
        pointIds: ['p0', 'p1'],
        sessionEnded: false,
      },
    }),
    null,
  );
  assert.deepEqual(
    detectQueueConflict({
      state: fila,
      live: {
        controlledByUserId: 'u2',
        controllerName: 'Bia',
        pointIds: ['p0', 'x1', 'x2', 'x3'],
        sessionEnded: false,
      },
    }),
    { takenOverBy: 'Bia', foreignPoints: 3, myPoints: 1, sessionEnded: false },
  );
  assert.deepEqual(
    detectQueueConflict({
      state: fila,
      live: {
        controlledByUserId: 'u1',
        controllerName: null,
        pointIds: ['p0', 'x1'],
        sessionEnded: false,
      },
    }),
    { takenOverBy: null, foreignPoints: 1, myPoints: 1, sessionEnded: false },
  );
});

test('textos da pergunta e da faixa', () => {
  assert.equal(
    conflictMessage({ takenOverBy: 'Bia', foreignPoints: 3, myPoints: 4, sessionEnded: false }),
    'Enquanto você estava sem sinal, Bia assumiu o placar e marcou 3 pontos. Você tem 4 pontos guardados.',
  );
  assert.equal(
    conflictMessage({ takenOverBy: null, foreignPoints: 1, myPoints: 1, sessionEnded: false }),
    'Enquanto você estava sem sinal, outra pessoa marcou 1 ponto. Você tem 1 ponto guardado.',
  );
  assert.equal(
    conflictMessage({ takenOverBy: 'Bia', foreignPoints: 0, myPoints: 2, sessionEnded: false }),
    'Enquanto você estava sem sinal, Bia assumiu o placar. Você tem 2 pontos guardados.',
  );
  assert.equal(pendingLabel(1), 'Sem sinal · 1 ponto guardado no aparelho');
  assert.equal(pendingLabel(4), 'Sem sinal · 4 pontos guardados no aparelho');
});

test('pelada encerrada em outro lugar vira conflito so de encerramento', () => {
  const base = bundle();
  const um = marcar(base, ponto('p1', 0));
  let fila = startScoreQueue({ userId: 'u1', sessionId: 's1', base });
  fila = pushEntry(fila, entryFromChange(base, um, 's1', 1, 'a'));
  const conflito = detectQueueConflict({
    state: fila,
    live: { controlledByUserId: 'u1', controllerName: null, pointIds: [], sessionEnded: true },
  });
  assert.deepEqual(conflito, {
    takenOverBy: null,
    foreignPoints: 0,
    myPoints: 1,
    sessionEnded: true,
  });
  assert.equal(
    conflictMessage(conflito!),
    'A pelada foi encerrada enquanto você estava sem sinal. Você tem 1 ponto guardado.',
  );
  assert.equal(
    conflictMessage({ takenOverBy: null, foreignPoints: 0, myPoints: 3, sessionEnded: true }),
    'A pelada foi encerrada enquanto você estava sem sinal. Você tem 3 pontos guardados.',
  );
});

test('rodizio na fila nao reabre a pelada que o banco ja encerrou', () => {
  const base = bundle();
  const rodizio = {
    ...base,
    sessions: [{ ...pelada, config: { ...pelada.config!, initialQueue: ['x'] } }, outra],
  } as SessionBundle;
  const entrada = roundtrip(entryFromChange(base, rodizio, 's1', 1, 'a'));
  const relido = bundle({
    sessions: [{ ...pelada, status: 'finished', deletedAt: '2026-10-05T21:00:00.000Z' }, outra],
  });
  const visto = applyQueue(relido, [entrada]);
  const raiz = visto.sessions.find((s) => s.id === 's1')!;
  assert.equal(raiz.status, 'finished');
  assert.equal(raiz.deletedAt, '2026-10-05T21:00:00.000Z');
  assert.deepEqual(filaDe(raiz), ['x']);
});

test('rodizio vira entrada com a raiz depois da mudanca e o envio grava a raiz nova', () => {
  const base = bundle();
  const depois = { ...pelada, config: { ...pelada.config!, initialQueue: ['x'] } };
  const rodizio = { ...base, sessions: [depois, outra] } as SessionBundle;
  const entrada = roundtrip(entryFromChange(base, rodizio, 's1', 1, 'a'));
  assert.deepEqual(filaDe(entrada.sessionAfter), ['x']);
  assert.equal(entrada.sessionBefore.id, 's1');
  const { prev, next } = bundlesForEntry(entrada);
  assert.deepEqual(filaDe(prev.sessions[0]), filaDe(pelada));
  assert.deepEqual(filaDe(next.sessions[0]), ['x']);
});

test('remocao na fila sai do bundle e vira remocao no envio', () => {
  const p1 = ponto('p1', 0);
  const base = bundle({ pointEvents: [p1] });
  const semPonto = { ...base, pointEvents: [] };
  const entrada = roundtrip(entryFromChange(base, semPonto, 's1', 1, 'a'));
  assert.deepEqual(
    entrada.removals.pointEvents.map((p) => p.id),
    ['p1'],
  );
  assert.deepEqual(entrada.upserts.pointEvents, []);
  const visto = applyQueue(base, [entrada]);
  assert.deepEqual(visto.pointEvents, []);
  const { prev, next } = bundlesForEntry(entrada);
  assert.deepEqual(
    prev.pointEvents.map((p) => p.id),
    ['p1'],
  );
  assert.deepEqual(next.pointEvents, []);
});
