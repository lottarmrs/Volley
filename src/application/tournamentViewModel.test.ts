import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTournamentCardViewModel,
  buildTournamentListViewModel,
  getTournamentStatusView,
} from './tournamentViewModel';
import { makeGame, makeSession, makeTeam } from '../test/fixtures';
import type { SessionReport } from '../types';

test('getTournamentStatusView maps product labels and classes', () => {
  assert.deepEqual(getTournamentStatusView('active'), {
    label: 'Ativo',
    className: 'bg-success-muted text-success',
  });
  assert.deepEqual(getTournamentStatusView('finished'), {
    label: 'Finalizado',
    className: 'bg-primary/15 text-primary',
  });
  assert.deepEqual(getTournamentStatusView('teams_generated'), {
    label: 'Pronto',
    className: 'bg-success/15 text-success',
  });
  assert.deepEqual(getTournamentStatusView('draft'), {
    label: 'Rascunho',
    className: 'bg-surface-strong text-text-muted',
  });
});

test('buildTournamentCardViewModel counts finished games and resolves champion', () => {
  const tournament = makeSession('tournament-1', {
    type: 'tournament',
    status: 'finished',
    date: '2026-07-17',
  });
  const team = makeTeam('team-1', 'tournament-1', [], { name: 'Time Azul' });
  const report = {
    sessionId: 'tournament-1',
    teamStandings: [{ teamId: 'team-1' }],
  } as SessionReport;

  const card = buildTournamentCardViewModel({
    tournament,
    games: [
      makeGame('game-1', 'tournament-1', { status: 'finished' }),
      makeGame('game-2', 'tournament-1', { status: 'active' }),
      makeGame('game-3', 'other-session', { status: 'finished' }),
    ],
    teams: [team],
    sessionReports: [report],
  });

  assert.equal(card.finishedGames, 1);
  assert.equal(card.dateLabel, '17/07/2026');
  assert.equal(card.winnerName, 'Time Azul');
  assert.equal(card.status.label, 'Finalizado');
  assert.equal(card.shouldOpenLive, false);
});

test('buildTournamentCardViewModel opens live for active or ready tournaments only', () => {
  assert.equal(
    buildTournamentCardViewModel({
      tournament: makeSession('tournament-1', { type: 'tournament', status: 'active' }),
      games: [],
      teams: [],
      sessionReports: [],
    }).shouldOpenLive,
    true,
  );
  assert.equal(
    buildTournamentCardViewModel({
      tournament: makeSession('tournament-2', { type: 'tournament', status: 'teams_generated' }),
      games: [],
      teams: [],
      sessionReports: [],
    }).shouldOpenLive,
    true,
  );
});

test('buildTournamentListViewModel filters non-tournament sessions', () => {
  const cards = buildTournamentListViewModel({
    sessions: [
      makeSession('free-1', { type: 'free_play' }),
      makeSession('tournament-1', { type: 'tournament' }),
    ],
    games: [],
    teams: [],
    sessionReports: [],
  });

  assert.deepEqual(
    cards.map((card) => card.tournament.id),
    ['tournament-1'],
  );
});
