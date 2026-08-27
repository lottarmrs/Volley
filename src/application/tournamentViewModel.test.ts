import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTournamentCardViewModel,
  buildTournamentListViewModel,
  getTournamentStatusView,
} from './tournamentViewModel';
import { makeGame, makeSession, makeTeam } from '../test/fixtures';
import type { SessionReport } from '../types';

test('getTournamentStatusView usa a fase operacional para rotulo e classe', () => {
  assert.deepEqual(getTournamentStatusView(makeSession('t1', { status: 'active' }), []), {
    label: 'Pronta para Começar',
    className: 'bg-success-muted text-success',
  });
  assert.deepEqual(getTournamentStatusView(makeSession('t2', { status: 'finished' }), []), {
    label: 'Encerrada',
    className: 'bg-primary/15 text-primary',
  });
  assert.deepEqual(getTournamentStatusView(makeSession('t3', { status: 'teams_generated' }), []), {
    label: 'Times Prontos',
    className: 'bg-success/15 text-success',
  });
  assert.deepEqual(getTournamentStatusView(makeSession('t4', { status: 'draft' }), []), {
    label: 'Rascunho',
    className: 'bg-surface-strong text-text-muted',
  });
  assert.deepEqual(getTournamentStatusView(makeSession('t5', { status: 'paused' }), []), {
    label: 'Pausada',
    className: 'bg-warning/15 text-warning',
  });
});

test('buildTournamentCardViewModel conta finished e walkover, exclui cancelled', () => {
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
      makeGame('game-2', 'tournament-1', { status: 'walkover' }),
      makeGame('game-3', 'tournament-1', { status: 'cancelled' }),
      makeGame('game-4', 'tournament-1', { status: 'active' }),
      makeGame('game-5', 'other-session', { status: 'finished' }),
    ],
    teams: [team],
    sessionReports: [report],
  });

  assert.equal(card.finishedGames, 2);
  assert.equal(card.dateLabel, '17/07/2026');
  assert.equal(card.winnerName, 'Time Azul');
  assert.equal(card.status.label, 'Encerrada');
  assert.equal(card.shouldOpenLive, false);
});

test('buildTournamentCardViewModel abre ao vivo para qualquer fase entre rascunho e encerrada', () => {
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
  assert.equal(
    buildTournamentCardViewModel({
      tournament: makeSession('tournament-3', { type: 'tournament', status: 'paused' }),
      games: [],
      teams: [],
      sessionReports: [],
    }).shouldOpenLive,
    true,
  );
  assert.equal(
    buildTournamentCardViewModel({
      tournament: makeSession('tournament-4', { type: 'tournament', status: 'draft' }),
      games: [],
      teams: [],
      sessionReports: [],
    }).shouldOpenLive,
    false,
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
