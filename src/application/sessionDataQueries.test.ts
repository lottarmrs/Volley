import test from 'node:test';
import assert from 'node:assert/strict';
import type { Community } from '@shared/types';
import { assembleSessionBundle, type SessionRows } from './sessionDataQueries';

const comunidades = [{ id: 'app-c1', cloudId: 'nuvem-c1' } as Community];

function sessao(extra: Record<string, unknown>) {
  return {
    id: 'nuvem-s',
    local_id: null,
    community_id: 'nuvem-c1',
    name: 'Pelada',
    date: '2026-10-01',
    status: 'draft',
    type: 'free_play',
    selected_player_ids: [],
    team_ids: [],
    config: {},
    authority_model: 'legacy',
    lifecycle_status: null,
    created_at: '',
    updated_at: '',
    ...extra,
  };
}

function time(id: string, sessionId: string, playerIds: string[]) {
  return { id, local_id: id, session_id: sessionId, name: id, player_ids: playerIds };
}

function linhas(extra: Partial<SessionRows> = {}): SessionRows {
  return {
    sessions: [],
    teams: [],
    games: [],
    point_events: [],
    game_reports: [],
    session_reports: [],
    ...extra,
  };
}

test('pelada legacy passa como veio, com a comunidade traduzida', () => {
  const bundle = assembleSessionBundle({
    rows: linhas({ sessions: [sessao({ status: 'finished', local_id: 'app-s' })] }),
    snapshots: [],
    communities: comunidades,
  });
  assert.equal(bundle.sessions[0].id, 'app-s');
  assert.equal(bundle.sessions[0].status, 'finished');
  assert.equal(bundle.sessions[0].communityId, 'app-c1');
  assert.equal(bundle.sessions[0].authorityModel, 'legacy');
});

test('pelada target em andamento vira active, com times e atletas reconstruidos', () => {
  const bundle = assembleSessionBundle({
    rows: linhas({
      sessions: [sessao({ authority_model: 'target', lifecycle_status: 'IN_PROGRESS' })],
      teams: [time('t1', 'nuvem-s', ['a', 'b']), time('t2', 'nuvem-s', ['b', 'c'])],
    }),
    snapshots: [
      { session_id: 'nuvem-s', rules_payload: { config: { type: 'free_play', teamCount: 2 } } },
    ],
    communities: comunidades,
  });
  const pelada = bundle.sessions[0];
  assert.equal(pelada.status, 'active');
  assert.deepEqual(pelada.teamIds, ['t1', 't2']);
  assert.deepEqual(pelada.selectedPlayerIds, ['a', 'b', 'c']);
  assert.deepEqual(pelada.config, { type: 'free_play', teamCount: 2 });
  assert.equal(pelada.authorityModel, 'target');
});

test('pelada target sem times fica em rascunho; com times, sorteada', () => {
  const semTimes = assembleSessionBundle({
    rows: linhas({ sessions: [sessao({ authority_model: 'target', lifecycle_status: 'DRAFT' })] }),
    snapshots: [],
    communities: comunidades,
  });
  assert.equal(semTimes.sessions[0].status, 'draft');
  const comTimes = assembleSessionBundle({
    rows: linhas({
      sessions: [sessao({ authority_model: 'target', lifecycle_status: 'SCHEDULED' })],
      teams: [time('t1', 'nuvem-s', ['a'])],
    }),
    snapshots: [],
    communities: comunidades,
  });
  assert.equal(comTimes.sessions[0].status, 'teams_generated');
});

test('pelada target encerrada e cancelada', () => {
  const bundle = assembleSessionBundle({
    rows: linhas({
      sessions: [
        sessao({ id: 's1', authority_model: 'target', lifecycle_status: 'COMPLETED' }),
        sessao({ id: 's2', authority_model: 'target', lifecycle_status: 'CANCELLED' }),
      ],
    }),
    snapshots: [],
    communities: comunidades,
  });
  assert.deepEqual(
    bundle.sessions.map((s) => s.status),
    ['finished', 'cancelled'],
  );
});

test('horario e local da pelada vem do banco', () => {
  const bundle = assembleSessionBundle({
    rows: linhas({
      sessions: [
        sessao({
          planned_start_at: '2026-10-02T23:00:00+00:00',
          location: 'Bolão da Breves',
        }),
      ],
    }),
    snapshots: [],
    communities: comunidades,
  });
  assert.equal(bundle.sessions[0].plannedStartAt, '2026-10-02T23:00:00+00:00');
  assert.equal(bundle.sessions[0].location, 'Bolão da Breves');
});
