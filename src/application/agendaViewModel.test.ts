import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgendaItems } from './agendaViewModel';
import type {
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
  Community,
  Session,
} from '@shared/types';

const community = { id: 'c1', name: 'Panelinha' } as Community;

function session(overrides: Partial<Session>): Session {
  return {
    id: 's1',
    communityId: 'c1',
    name: 'Sessão de quarta',
    date: '2026-08-20',
    status: 'draft',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  } as Session;
}

test('lista sessões futuras e ignora passadas, encerradas e canceladas', () => {
  const items = buildAgendaItems({
    today: '2026-08-12',
    communities: [community],
    sessions: [
      session({ id: 's1', date: '2026-08-20' }),
      session({ id: 's2', date: '2026-08-01' }),
      session({ id: 's3', date: '2026-08-25', status: 'finished' }),
      session({ id: 's4', date: '2026-08-26', status: 'cancelled' }),
      session({ id: 's5', date: '2026-08-13', communityId: null }),
    ],
    championships: [],
    championshipTeams: [],
    championshipRounds: [],
  });

  assert.deepEqual(
    items.map((item) => item.refId),
    ['s1'],
  );
  assert.equal(items[0].communityName, 'Panelinha');
  assert.equal(items[0].kind, 'session');
});

test('inclui a sessão de hoje', () => {
  const items = buildAgendaItems({
    today: '2026-08-12',
    communities: [community],
    sessions: [session({ id: 's1', date: '2026-08-12' })],
    championships: [],
    championshipTeams: [],
    championshipRounds: [],
  });
  assert.equal(items.length, 1);
});

test('ignora sessão cuja comunidade não existe mais na lista', () => {
  const items = buildAgendaItems({
    today: '2026-08-12',
    communities: [community],
    sessions: [
      session({ id: 's1', date: '2026-08-20' }),
      session({ id: 's2', date: '2026-08-21', communityId: 'orfa' }),
    ],
    championships: [],
    championshipTeams: [],
    championshipRounds: [],
  });

  assert.deepEqual(
    items.map((item) => item.refId),
    ['s1'],
  );
});

test('ignora rodada cujo campeonato pertence a comunidade ausente', () => {
  const championship = {
    id: 'ch1',
    communityId: 'orfa',
    name: 'Liga de Verão',
  } as Championship;
  const teams = [
    { id: 't1', championshipId: 'ch1', name: 'Time A' },
    { id: 't2', championshipId: 'ch1', name: 'Time B' },
  ] as ChampionshipTeam[];
  const rounds = [
    {
      id: 'r1',
      championshipId: 'ch1',
      round: 1,
      teamAId: 't1',
      teamBId: 't2',
      scheduledDate: '2026-08-15',
      skipped: false,
    },
  ] as ChampionshipRound[];

  const items = buildAgendaItems({
    today: '2026-08-12',
    communities: [community],
    sessions: [],
    championships: [championship],
    championshipTeams: teams,
    championshipRounds: rounds,
  });

  assert.deepEqual(items, []);
});

test('lista rodadas de liga pendentes e ordena tudo por data', () => {
  const championship = {
    id: 'ch1',
    communityId: 'c1',
    name: 'Liga de Verão',
  } as Championship;
  const teams = [
    { id: 't1', championshipId: 'ch1', name: 'Time A' },
    { id: 't2', championshipId: 'ch1', name: 'Time B' },
  ] as ChampionshipTeam[];
  const rounds = [
    {
      id: 'r1',
      championshipId: 'ch1',
      round: 1,
      teamAId: 't1',
      teamBId: 't2',
      scheduledDate: '2026-08-15',
      skipped: false,
    },
    {
      id: 'r2',
      championshipId: 'ch1',
      round: 2,
      teamAId: 't1',
      teamBId: 't2',
      scheduledDate: '2026-08-18',
      skipped: true,
    },
    {
      id: 'r3',
      championshipId: 'ch1',
      round: 3,
      teamAId: 't1',
      teamBId: 't2',
      scheduledDate: '2026-08-19',
      skipped: false,
      sessionId: 's9',
    },
  ] as ChampionshipRound[];

  const items = buildAgendaItems({
    today: '2026-08-12',
    communities: [community],
    sessions: [session({ id: 's1', date: '2026-08-20' })],
    championships: [championship],
    championshipTeams: teams,
    championshipRounds: rounds,
  });

  assert.deepEqual(
    items.map((item) => item.refId),
    ['r1', 's1'],
  );
  assert.equal(items[0].kind, 'round');
  assert.equal(items[0].title, 'Time A x Time B');
});
