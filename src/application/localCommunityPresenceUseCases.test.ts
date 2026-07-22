import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLocalPresenceGuest,
  applyLocalPresenceStatus,
  clearLocalPresence,
  createLocalPresence,
  reuseLastLocalPresence,
  selectLocalPresence,
  selectFrequentLocalPresencePlayers,
  selectPresentLocalPresencePlayers,
  upsertLocalPresence,
} from './localCommunityPresenceUseCases';
import type { CommunityPresence, Player } from '../types';

const now = '2026-07-20T12:00:00.000Z';
const today = '2026-07-20';

function presence(
  communityId: string,
  date: string,
  items: CommunityPresence['items'] = [],
): CommunityPresence {
  return {
    communityId,
    date,
    items,
    updatedAt: now,
    syncStatus: 'synced',
  };
}

function player(id: string, ativo = true, presencaFrequente = true): Player {
  return {
    id,
    nome: id,
    apelido: id,
    genero: 'M',
    ativo,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    maoDominante: 'direita',
    atributos: {
      saque: 5,
      recepcao: 5,
      levantamento: 5,
      ataque: 5,
      bloqueio: 5,
      defesa: 5,
      velocidade: 5,
      resistencia: 5,
      leituraDeJogo: 5,
      regularidade: 5,
      controleEmocional: 5,
    },
    perfil: { nivel: 1, classe: '', arquetipo: '', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente },
    metadata: { criadoEm: now, atualizadoEm: now },
  };
}

test('createLocalPresence creates an empty pending presence for the given date', () => {
  const result = createLocalPresence({
    communityId: 'community-1',
    date: today,
    now,
  });

  assert.deepEqual(result, {
    communityId: 'community-1',
    date: today,
    items: [],
    updatedAt: now,
    syncStatus: 'pending',
  });
});

test('upsertLocalPresence replaces only the same community and date as pending', () => {
  const next = {
    ...presence('community-1', today, [{ playerId: 'player-1', status: 'present' }]),
    updatedAt: '2026-07-20T11:00:00.000Z',
  };

  const result = upsertLocalPresence({
    records: [
      presence('community-1', '2026-07-19', [{ playerId: 'old', status: 'present' }]),
      presence('community-1', today, [{ playerId: 'player-1', status: 'absent' }]),
      presence('community-2', today, [{ playerId: 'other', status: 'present' }]),
    ],
    presence: next,
    now,
  });

  assert.equal(result.length, 3);
  assert.deepEqual(result[0].items, [{ playerId: 'old', status: 'present' }]);
  assert.deepEqual(result[1], {
    ...next,
    updatedAt: now,
    syncStatus: 'pending',
  });
  assert.equal(result[2].communityId, 'community-2');
});

test('upsertLocalPresence appends a missing presence as pending', () => {
  const result = upsertLocalPresence({
    records: [presence('community-1', '2026-07-19')],
    presence: presence('community-1', today),
    now,
  });

  assert.equal(result.length, 2);
  assert.equal(result[1].date, today);
  assert.equal(result[1].syncStatus, 'pending');
});

test('selectLocalPresence returns only the requested community and date', () => {
  const records = [
    presence('community-1', '2026-07-19'),
    presence('community-2', today),
    presence('community-1', today, [{ playerId: 'player-1', status: 'present' }]),
  ];

  assert.deepEqual(selectLocalPresence(records, 'community-1', today), records[2]);
  assert.equal(selectLocalPresence(records, 'missing', today), null);
});

test('selectPresentLocalPresencePlayers returns active player records marked present', () => {
  const records = [
    presence('community-1', today, [
      { playerId: 'present', status: 'present' },
      { playerId: 'absent', status: 'absent' },
      { temporaryName: 'Visitante', status: 'guest' },
    ]),
  ];

  assert.deepEqual(
    selectPresentLocalPresencePlayers({
      records,
      communityId: 'community-1',
      date: today,
      players: [player('present'), player('absent'), player('unmarked')],
    }).map((presentPlayer) => presentPlayer.id),
    ['present'],
  );
});

test('applyLocalPresenceStatus marks a player in today presence', () => {
  const result = applyLocalPresenceStatus({
    records: [],
    communityId: 'community-1',
    playerId: 'player-1',
    status: 'present',
    date: today,
    now,
  });

  assert.deepEqual(result[0], {
    communityId: 'community-1',
    date: today,
    items: [{ playerId: 'player-1', status: 'present' }],
    updatedAt: now,
    syncStatus: 'pending',
  });
});

test('clearLocalPresence replaces today presence with an empty pending record', () => {
  const result = clearLocalPresence({
    records: [presence('community-1', today, [{ playerId: 'player-1', status: 'present' }])],
    communityId: 'community-1',
    date: today,
    now,
  });

  assert.deepEqual(result[0].items, []);
  assert.equal(result[0].syncStatus, 'pending');
});

test('addLocalPresenceGuest trims guest names and ignores blank names', () => {
  const withGuest = addLocalPresenceGuest({
    records: [],
    communityId: 'community-1',
    temporaryName: '  Visitante  ',
    date: today,
    now,
  });
  const unchanged = addLocalPresenceGuest({
    records: withGuest,
    communityId: 'community-1',
    temporaryName: '   ',
    date: today,
    now,
  });

  assert.deepEqual(withGuest[0].items, [{ temporaryName: 'Visitante', status: 'guest' }]);
  assert.deepEqual(unchanged, withGuest);
});

test('selectFrequentLocalPresencePlayers marks only active frequent players as present', () => {
  const result = selectFrequentLocalPresencePlayers({
    records: [
      presence('community-1', today, [
        { playerId: 'existing', status: 'maybe' },
        { temporaryName: 'Visitante', status: 'guest' },
      ]),
    ],
    communityId: 'community-1',
    players: [player('frequent'), player('inactive', false), player('rare', true, false)],
    date: today,
    now,
  });

  assert.deepEqual(result[0].items, [
    { playerId: 'existing', status: 'maybe' },
    { temporaryName: 'Visitante', status: 'guest' },
    { playerId: 'frequent', status: 'present' },
  ]);
  assert.equal(result[0].syncStatus, 'pending');
});

test('reuseLastLocalPresence copies the latest previous presence to today', () => {
  const result = reuseLastLocalPresence({
    records: [
      presence('community-1', '2026-07-18', [{ playerId: 'old', status: 'present' }]),
      presence('community-1', today, [{ playerId: 'today', status: 'absent' }]),
      presence('community-2', '2026-07-19', [{ playerId: 'other', status: 'present' }]),
      presence('community-1', '2026-07-19', [
        { playerId: 'latest', status: 'maybe' },
        { temporaryName: 'Visitante', status: 'guest' },
      ]),
    ],
    communityId: 'community-1',
    date: today,
    now,
  });

  assert.equal(result.length, 4);
  assert.deepEqual(result[1], {
    communityId: 'community-1',
    date: today,
    items: [
      { playerId: 'latest', status: 'maybe' },
      { temporaryName: 'Visitante', status: 'guest' },
    ],
    updatedAt: now,
    syncStatus: 'pending',
  });
});

test('reuseLastLocalPresence keeps records unchanged when there is no previous presence', () => {
  const records = [presence('community-1', today, [{ playerId: 'today', status: 'present' }])];

  assert.equal(
    reuseLastLocalPresence({
      records,
      communityId: 'community-1',
      date: today,
      now,
    }),
    records,
  );
});
