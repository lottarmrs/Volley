import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Championship, ChampionshipRound, ChampionshipTeam } from '../../types';
import {
  mapChampionshipRoundToDb,
  mapChampionshipTeamToDb,
  mapChampionshipToDb,
  mapDbToChampionship,
  mapDbToChampionshipRound,
  mapDbToChampionshipTeam,
} from './championshipCloudService';

const championship: Championship = {
  id: 'local-champ-1',
  communityId: 'community-1',
  name: 'Liga de Terça',
  format: 'double_round_robin',
  classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
  recurrenceRule: {
    daysOfWeek: [2],
    time: '20:00',
    startDate: '2026-08-04',
    endDate: '2026-12-15',
  },
  createdAt: '2026-07-26T12:00:00.000Z',
  updatedAt: '2026-07-26T12:00:00.000Z',
};

const championshipTeam: ChampionshipTeam = {
  id: 'local-team-1',
  championshipId: 'local-champ-1',
  name: 'Time A',
  playerIds: ['player-1', 'player-2'],
  updatedAt: '2026-07-26T12:00:00.000Z',
};

const championshipRound: ChampionshipRound = {
  id: 'local-round-1',
  championshipId: 'local-champ-1',
  round: 1,
  teamAId: 'local-team-1',
  teamBId: 'local-team-2',
  scheduledDate: '2026-08-04T20:00',
  skipped: false,
  updatedAt: '2026-07-26T12:00:00.000Z',
};

test('mapChampionshipToDb maps every recurrence and classification field to snake_case', () => {
  const db = mapChampionshipToDb(championship, 'owner-1');

  assert.equal(db.owner_id, 'owner-1');
  assert.equal(db.community_id, 'community-1');
  assert.equal(db.name, 'Liga de Terça');
  assert.equal(db.format, 'double_round_robin');
  assert.deepEqual(db.classification_points, championship.classificationPoints);
  assert.deepEqual(db.recurrence_days_of_week, [2]);
  assert.equal(db.recurrence_time, '20:00');
  assert.equal(db.recurrence_start_date, '2026-08-04');
  assert.equal(db.recurrence_end_date, '2026-12-15');
  assert.equal(db.local_id, 'local-champ-1');
  assert.equal(db.deleted_at, null);
  assert.equal(db.created_at, championship.createdAt);
  assert.equal(db.updated_at, championship.updatedAt);
});

test('mapChampionshipToDb omits id when there is no cloudId yet (insert path)', () => {
  const db = mapChampionshipToDb(championship, 'owner-1');
  assert.equal(db.id, undefined);
});

test('mapChampionshipToDb uses cloudId as id when present (update path)', () => {
  const db = mapChampionshipToDb({ ...championship, cloudId: 'cloud-champ-1' }, 'owner-1');
  assert.equal(db.id, 'cloud-champ-1');
});

test('mapDbToChampionship round-trips the recurrence rule and classification points', () => {
  const db = mapChampionshipToDb(championship, 'owner-1');
  db.id = 'cloud-champ-1';

  const mapped = mapDbToChampionship(db);

  assert.equal(mapped.id, 'local-champ-1');
  assert.equal(mapped.communityId, 'community-1');
  assert.equal(mapped.name, championship.name);
  assert.equal(mapped.format, championship.format);
  assert.deepEqual(mapped.classificationPoints, championship.classificationPoints);
  assert.deepEqual(mapped.recurrenceRule, championship.recurrenceRule);
  assert.equal(mapped.cloudId, 'cloud-champ-1');
  assert.equal(mapped.syncStatus, 'synced');
  assert.equal(mapped.createdAt, championship.createdAt);
  assert.equal(mapped.updatedAt, championship.updatedAt);
});

test('mapDbToChampionship defaults endDate to null when the db column is null', () => {
  const db = mapChampionshipToDb({ ...championship, recurrenceRule: { ...championship.recurrenceRule, endDate: null } }, 'owner-1');
  const mapped = mapDbToChampionship(db);
  assert.equal(mapped.recurrenceRule.endDate, null);
});

test('mapChampionshipTeamToDb maps playerIds and the championship_id foreign key', () => {
  const db = mapChampionshipTeamToDb(championshipTeam, 'cloud-champ-1');

  assert.equal(db.championship_id, 'cloud-champ-1');
  assert.equal(db.name, 'Time A');
  assert.deepEqual(db.player_ids, ['player-1', 'player-2']);
  assert.equal(db.local_id, 'local-team-1');
  assert.equal(db.id, undefined);
});

test('mapDbToChampionshipTeam round-trips a championship team', () => {
  const db = mapChampionshipTeamToDb(championshipTeam, 'cloud-champ-1');
  db.id = 'cloud-team-1';

  const mapped = mapDbToChampionshipTeam(db);

  assert.equal(mapped.id, 'local-team-1');
  assert.equal(mapped.championshipId, 'cloud-champ-1');
  assert.equal(mapped.name, 'Time A');
  assert.deepEqual(mapped.playerIds, ['player-1', 'player-2']);
  assert.equal(mapped.cloudId, 'cloud-team-1');
  assert.equal(mapped.syncStatus, 'synced');
});

test('mapChampionshipRoundToDb maps round, team foreign keys, and scheduling fields', () => {
  const db = mapChampionshipRoundToDb(championshipRound, 'cloud-champ-1', 'cloud-team-a', 'cloud-team-b');

  assert.equal(db.championship_id, 'cloud-champ-1');
  assert.equal(db.round, 1);
  assert.equal(db.team_a_id, 'cloud-team-a');
  assert.equal(db.team_b_id, 'cloud-team-b');
  assert.equal(db.scheduled_date, '2026-08-04T20:00');
  assert.equal(db.skipped, false);
  assert.equal(db.session_id, null);
  assert.equal(db.local_id, 'local-round-1');
  assert.equal(db.id, undefined);
});

test('mapChampionshipRoundToDb carries a materialized sessionId through', () => {
  const db = mapChampionshipRoundToDb(
    { ...championshipRound, sessionId: 'session-1' },
    'cloud-champ-1',
    'cloud-team-a',
    'cloud-team-b',
  );
  assert.equal(db.session_id, 'session-1');
});

test('mapDbToChampionshipRound round-trips a championship round', () => {
  const db = mapChampionshipRoundToDb(championshipRound, 'cloud-champ-1', 'cloud-team-a', 'cloud-team-b');
  db.id = 'cloud-round-1';

  const mapped = mapDbToChampionshipRound(db);

  assert.equal(mapped.id, 'local-round-1');
  assert.equal(mapped.championshipId, 'cloud-champ-1');
  assert.equal(mapped.round, 1);
  assert.equal(mapped.teamAId, 'cloud-team-a');
  assert.equal(mapped.teamBId, 'cloud-team-b');
  assert.equal(mapped.scheduledDate, championshipRound.scheduledDate);
  assert.equal(mapped.skipped, false);
  assert.equal(mapped.sessionId, undefined);
  assert.equal(mapped.cloudId, 'cloud-round-1');
  assert.equal(mapped.syncStatus, 'synced');
});

test('championship cloud service calls supabase against the expected tables and conflict targets', () => {
  const source = readFileSync(new URL('./championshipCloudService.ts', import.meta.url), 'utf8');

  assert.match(source, /\.from\('championships'\)/);
  assert.match(source, /\.from\('championship_teams'\)/);
  assert.match(source, /\.from\('championship_rounds'\)/);
  assert.match(source, /onConflict:\s*'id'/);
  assert.match(source, /onConflict:\s*'championship_id,local_id'/);
  assert.match(source, /\.eq\('championship_id', championshipCloudId\)/);
});
