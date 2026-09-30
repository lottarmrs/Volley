import test from 'node:test';
import assert from 'node:assert/strict';
import type { Game, PointEvent, Session, Team } from '@shared/types';
import { emptySessionBundle, type SessionBundle } from './sessionDataQueries';
import { persistSessionBundleChanges, type SessionWriteGateway } from './sessionWrites';

function pelada(extra: Partial<Session> = {}): Session {
  return {
    id: 's1',
    communityId: 'c1',
    name: 'Pelada',
    date: '2026-10-01',
    status: 'teams_generated',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '',
    updatedAt: '',
    type: 'free_play',
    cloudId: 's1',
    authorityModel: 'target',
    ...extra,
  };
}

function jogo(extra: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    sessionId: 's1',
    type: 'free_play',
    sequenceNumber: 1,
    teamAId: 't1',
    teamBId: 't2',
    scoreA: 0,
    scoreB: 0,
    status: 'active',
    pointIds: [],
    cloudId: 'g1',
    ...extra,
  } as Game;
}

function gateway() {
  const chamadas: string[] = [];
  const g: SessionWriteGateway = {
    upsertSession: async (s, owner) => {
      chamadas.push(`upsertSession ${s.id} ${owner}`);
    },
    softDelete: async (table, cloudId) => {
      chamadas.push(`softDelete ${table} ${cloudId}`);
    },
    bulkUpsertTeams: async (items) => {
      chamadas.push(`teams ${items.map((i) => i.id).join(',')}`);
    },
    bulkUpsertGames: async (items) => {
      chamadas.push(`games ${items.map((i) => `${i.id}:${i.status}`).join(',')}`);
    },
    bulkUpsertPointEvents: async (items, owner, sessionsById) => {
      const communityId = sessionsById.get(items[0].sessionId)?.communityId;
      chamadas.push(`points ${items.map((i) => i.id).join(',')} ${owner} ${communityId}`);
    },
    bulkUpsertGameReports: async () => {
      chamadas.push('gameReports');
    },
    bulkUpsertSessionReports: async () => {
      chamadas.push('sessionReports');
    },
    createTargetSession: async (input) => {
      chamadas.push(`createTarget ${input.sessionId} ${input.communityId}`);
      return { id: input.sessionId };
    },
    lifecycle: {
      readRevision: async () => 1,
      freezeRules: async (id, payload) => {
        chamadas.push(`freeze ${id} ${JSON.stringify(payload)}`);
      },
      schedule: async (id) => {
        chamadas.push(`schedule ${id}`);
      },
      start: async (id) => {
        chamadas.push(`start ${id}`);
      },
      finish: async (id) => {
        chamadas.push(`finish ${id}`);
      },
      cancel: async (id) => {
        chamadas.push(`cancel ${id}`);
      },
    },
  };
  return { g, chamadas };
}

const ctx = { userId: 'u1', communityCloudId: (id?: string | null) => (id ? `nuvem-${id}` : null) };

function pacote(extra: Partial<SessionBundle>): SessionBundle {
  return { ...emptySessionBundle(), ...extra };
}

test('ponto novo grava so o ponto, com a comunidade da nuvem', async () => {
  const { g, chamadas } = gateway();
  const antes = pacote({ sessions: [pelada()] });
  const ponto = { id: 'p1', sessionId: 's1', gameId: 'g1' } as PointEvent;
  await persistSessionBundleChanges(antes, { ...antes, pointEvents: [ponto] }, ctx, g);
  assert.deepEqual(chamadas, ['points p1 u1 nuvem-c1']);
});

test('pelada legacy nova ou alterada vai por upsert com o dono dela', async () => {
  const { g, chamadas } = gateway();
  const legacy = pelada({ authorityModel: 'legacy', cloudOwnerId: 'dono' });
  await persistSessionBundleChanges(
    pacote({ sessions: [legacy] }),
    pacote({ sessions: [{ ...legacy, name: 'Outro nome' }] }),
    ctx,
    g,
  );
  assert.deepEqual(chamadas, ['upsertSession s1 dono']);
});

test('pelada nova de comunidade nasce target', async () => {
  const { g, chamadas } = gateway();
  const nova = pelada({ cloudId: undefined, authorityModel: undefined, status: 'draft' });
  await persistSessionBundleChanges(emptySessionBundle(), pacote({ sessions: [nova] }), ctx, g);
  assert.deepEqual(chamadas, ['createTarget s1 nuvem-c1']);
});

test('target sorteada para em andamento congela, agenda e inicia nessa ordem', async () => {
  const { g, chamadas } = gateway();
  const antes = pelada({ config: { type: 'free_play' } as Session['config'] });
  await persistSessionBundleChanges(
    pacote({ sessions: [antes] }),
    pacote({ sessions: [{ ...antes, status: 'active' }] }),
    ctx,
    g,
  );
  assert.deepEqual(chamadas, [
    'freeze s1 {"type":"free_play","config":{"type":"free_play"}}',
    'schedule s1',
    'start s1',
  ]);
});

test('encerrar cancela antes os jogos que nao terminaram', async () => {
  const { g, chamadas } = gateway();
  const antes = pacote({ sessions: [pelada({ status: 'active' })], games: [jogo()] });
  await persistSessionBundleChanges(
    antes,
    { ...antes, sessions: [pelada({ status: 'finished' })] },
    ctx,
    g,
  );
  assert.deepEqual(chamadas, ['games g1:cancelled', 'finish s1']);
});

test('target com so o nome trocado nao grava nada', async () => {
  const { g, chamadas } = gateway();
  await persistSessionBundleChanges(
    pacote({ sessions: [pelada()] }),
    pacote({ sessions: [pelada({ name: 'Outra' })] }),
    ctx,
    g,
  );
  assert.deepEqual(chamadas, []);
});

test('time removido com id da nuvem e apagado; target excluida e cancelada', async () => {
  const { g, chamadas } = gateway();
  const time = { id: 't1', sessionId: 's1', cloudId: 't1' } as Team;
  await persistSessionBundleChanges(
    pacote({ sessions: [pelada()], teams: [time] }),
    pacote({ sessions: [pelada({ deletedAt: '2026-10-01T00:00:00Z' })] }),
    ctx,
    g,
  );
  assert.deepEqual(chamadas, ['cancel s1', 'softDelete teams t1']);
});

test('o erro do gateway sobe', async () => {
  const { g } = gateway();
  g.bulkUpsertPointEvents = async () => {
    throw { code: '42501', message: 'nao' };
  };
  const antes = pacote({ sessions: [pelada()] });
  await assert.rejects(
    () =>
      persistSessionBundleChanges(
        antes,
        { ...antes, pointEvents: [{ id: 'p1', sessionId: 's1' } as PointEvent] },
        ctx,
        g,
      ),
    { code: '42501' },
  );
});
