import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinishedSessionResult,
  buildFreePlayConfigFromCommunityRules,
  buildManualSessionDraft,
  buildManualSessionStartResult,
  buildSessionFromCommunity,
  buildTournamentConfigFromCommunityRules,
} from './sessionLifecycleUseCases';
import type { Community, CommunityRules } from '../types';
import { makePlayer, makeSession, makeTeam } from '../test/fixtures';

const community = {
  id: 'community-1',
  name: 'Domingo',
  defaultFormat: 'free_play',
  defaultLocation: 'Quadra A',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as Community;

test('buildFreePlayConfigFromCommunityRules applies scalable defaults', () => {
  const config = buildFreePlayConfigFromCommunityRules({
    communityId: 'community-1',
    defaultFormat: 'free_play',
    updatedAt: '2026-01-01T00:00:00.000Z',
    freePlay: { teamCount: 2, maxPoints: 21, balanceSpeed: 'fast' },
  } as CommunityRules);

  assert.equal(config.type, 'free_play');
  assert.equal(config.teamCount, 3);
  assert.equal(config.maxPoints, 21);
  assert.equal(config.balanceSpeed, 'fast');
  assert.deepEqual(config.initialCourtTeams, ['', '']);
});

test('buildTournamentConfigFromCommunityRules applies tournament defaults', () => {
  const config = buildTournamentConfigFromCommunityRules({
    communityId: 'community-1',
    defaultFormat: 'tournament',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tournament: { teamCount: 1, maxPoints: 12, hasFinal: false },
  } as CommunityRules);

  assert.equal(config.type, 'tournament');
  assert.equal(config.teamCount, 2);
  assert.equal(config.maxPoints, 12);
  assert.equal(config.hasFinal, false);
  assert.deepEqual(config.standingsRules, [
    'classificationPoints',
    'wins',
    'pointDifference',
    'pointsFor',
    'headToHead',
    'pointsAgainst',
  ]);
});

test('buildSessionFromCommunity creates a draft session and next wizard step', () => {
  const result = buildSessionFromCommunity({
    community,
    playerIds: ['p1', '', 'p1', 'p2'],
    rules: {
      communityId: 'community-1',
      defaultFormat: 'free_play',
      defaultLocation: 'Quadra B',
      notes: 'Levar bola',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as CommunityRules,
    now: new Date('2026-07-13T12:00:00.000Z'),
    createId: () => 'session-1',
  });

  assert.equal(result.nextWizardStep, 2);
  assert.equal(result.session.id, 'session-1');
  assert.equal(result.session.name, 'Domingo - 13/07/2026');
  assert.equal(result.session.date, '2026-07-13');
  assert.equal(result.session.location, 'Quadra B');
  assert.equal(result.session.notes, 'Levar bola');
  assert.deepEqual(result.session.selectedPlayerIds, ['p1', 'p2']);
});

test('buildSessionFromCommunity starts at details step when no players are selected', () => {
  const result = buildSessionFromCommunity({
    community,
    playerIds: [],
    rules: {
      communityId: 'community-1',
      defaultFormat: 'tournament',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as CommunityRules,
    now: new Date('2026-07-13T12:00:00.000Z'),
    createId: () => 'session-2',
  });

  assert.equal(result.nextWizardStep, 0);
  assert.equal(result.session.type, 'tournament');
  assert.equal(result.session.config?.type, 'tournament');
});

test('buildManualSessionDraft creates a default free-play draft', () => {
  const session = buildManualSessionDraft({
    now: new Date('2026-07-14T12:00:00.000Z'),
    createId: () => 'session-1',
  });

  assert.equal(session.id, 'session-1');
  assert.equal(session.name, 'Sessão — 14/07/2026');
  assert.equal(session.date, '2026-07-14');
  assert.equal(session.status, 'draft');
  assert.deepEqual(session.selectedPlayerIds, []);
  assert.deepEqual(session.teamIds, []);
  assert.equal(session.type, undefined);
  assert.equal(session.createdAt, '2026-07-14T12:00:00.000Z');
  assert.equal(session.updatedAt, '2026-07-14T12:00:00.000Z');
});

test('buildManualSessionDraft creates a tournament draft', () => {
  const session = buildManualSessionDraft({
    type: 'tournament',
    now: new Date('2026-07-14T12:00:00.000Z'),
    createId: () => 'session-2',
  });

  assert.equal(session.id, 'session-2');
  assert.equal(session.name, 'Torneio — 14/07/2026');
  assert.equal(session.type, 'tournament');
});

test('buildManualSessionStartResult creates a draft and resets the wizard', () => {
  const result = buildManualSessionStartResult({
    type: 'tournament',
    now: new Date('2026-07-14T12:00:00.000Z'),
    createId: () => 'session-3',
  });

  assert.equal(result.nextWizardStep, 0);
  assert.equal(result.session.id, 'session-3');
  assert.equal(result.session.type, 'tournament');
});

test('buildFinishedSessionResult marks active session finished and builds updated collections', () => {
  const activeSession = makeSession('session-1', {
    status: 'active',
    teamIds: ['team-1'],
  });
  const otherSession = makeSession('session-2', { status: 'draft' });
  const team = makeTeam('team-1', 'session-1', ['player-1']);
  const player = makePlayer('player-1');

  const result = buildFinishedSessionResult({
    activeSession,
    sessions: [activeSession, otherSession],
    games: [],
    pointEvents: [],
    teams: [team],
    players: [player],
    sessionReports: [],
    finishedAt: '2026-07-13T15:00:00.000Z',
  });

  assert.equal(result.finishedSession.status, 'finished');
  assert.equal(result.finishedSession.updatedAt, '2026-07-13T15:00:00.000Z');
  assert.deepEqual(
    result.participants.map((participant) => participant.id),
    ['player-1'],
  );
  assert.deepEqual(
    result.updatedSessions.map((session) => [session.id, session.status]),
    [
      ['session-1', 'finished'],
      ['session-2', 'draft'],
    ],
  );
  assert.equal(result.updatedPlayers[0].id, 'player-1');
  assert.equal(result.updatedReports.length, 1);
  assert.equal(result.updatedReports[0].sessionId, 'session-1');
});
