import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryView } from './HistoryView';
import { buildHistoryViewContract } from '../../application/screens/historyView/historyViewContract';
import type { HistoryViewContractInput } from '../../application/screens/historyView/historyViewContract';
import { Game, Player, PointEvent, Session, Team } from '../../types';

vi.mock('recharts', () => {
  const Chart = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    BarChart: Chart,
    Bar: Chart,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    ResponsiveContainer: Chart,
    Cell: () => null,
    LineChart: Chart,
    Line: () => null,
    CartesianGrid: () => null,
    Legend: () => null,
  };
});

const finishedSession: Session = {
  id: 'session-1',
  name: 'Noite de teste',
  date: '2026-07-17',
  status: 'finished',
  type: 'free_play',
  selectedPlayerIds: ['player-1'],
  teamIds: ['team-1', 'team-2'],
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
};

const finishedGame: Game = {
  id: 'game-1',
  sessionId: 'session-1',
  type: 'free_play',
  sequenceNumber: 1,
  teamAId: 'team-1',
  teamBId: 'team-2',
  scoreA: 1,
  scoreB: 0,
  winnerTeamId: 'team-1',
  loserTeamId: 'team-2',
  status: 'finished',
  pointIds: ['point-1'],
};

const teams = [
  { id: 'team-1', sessionId: 'session-1', name: 'Time 1', playerIds: ['player-1'] },
  { id: 'team-2', sessionId: 'session-1', name: 'Time 2', playerIds: [] },
] as Team[];

const players = [
  { id: 'player-1', nome: 'Maria Silva', apelido: 'Maria', ativo: true },
] as Player[];

const modernPoint: PointEvent = {
  id: 'point-1',
  sessionId: 'session-1',
  gameId: 'game-1',
  sequenceNumber: 1,
  scoringTeamId: 'team-1',
  concedingTeamId: 'team-2',
  playerId: 'player-1',
  pointType: 'winner',
  skill: 'saque',
  scoreBefore: { teamA: 0, teamB: 0 },
  scoreAfter: { teamA: 1, teamB: 0 },
  timestamp: '2026-07-17T20:00:00.000Z',
};

function renderHistoryView(overrides: Partial<HistoryViewContractInput> = {}) {
  const defaults: HistoryViewContractInput = {
    sessions: [finishedSession],
    games: [finishedGame],
    pointEvents: [modernPoint],
    teams,
    players,
    sessionReports: [],
    selectedHistorySessionId: null,
    setSelectedHistorySessionId: vi.fn(),
    onDeleteSession: vi.fn(),
    onBackToDashboard: vi.fn(),
    initialTab: 'stats',
    hideTabs: true,
    ...overrides,
  };
  const contract = buildHistoryViewContract(defaults);
  return render(<HistoryView contract={contract} />);
}

describe('HistoryView', () => {
  it('shows modern taxonomy winners in global top scorers', () => {
    renderHistoryView();

    expect(screen.getByText(/Top Artilheiros/i)).toBeTruthy();
  });

  it('counts W.O. games and points in both the quick stats and Resumo do Torneio cards', () => {
    const tournamentSession: Session = {
      ...finishedSession,
      id: 'session-tournament',
      type: 'tournament',
    };
    const games: Game[] = [
      {
        ...finishedGame,
        id: 'game-normal',
        sessionId: 'session-tournament',
        sequenceNumber: 1,
        scoreA: 2,
        scoreB: 1,
        status: 'finished',
        pointIds: [],
      },
      {
        ...finishedGame,
        id: 'game-wo-1',
        sessionId: 'session-tournament',
        sequenceNumber: 2,
        scoreA: 12,
        scoreB: 0,
        status: 'walkover',
        finishReason: 'walkover',
        pointIds: [],
      },
      {
        ...finishedGame,
        id: 'game-wo-2',
        sessionId: 'session-tournament',
        sequenceNumber: 3,
        scoreA: 0,
        scoreB: 12,
        winnerTeamId: 'team-2',
        loserTeamId: 'team-1',
        status: 'walkover',
        finishReason: 'walkover',
        pointIds: [],
      },
    ];
    const tournamentTeams = teams.map((t) => ({ ...t, sessionId: 'session-tournament' }));

    renderHistoryView({
      sessions: [tournamentSession],
      games,
      pointEvents: [],
      teams: tournamentTeams,
      sessionReports: [],
      selectedHistorySessionId: 'session-tournament',
    });

    const totalGamesLabels = screen.getAllByText('Total de Jogos');
    expect(totalGamesLabels).toHaveLength(2);
    totalGamesLabels.forEach((label) => {
      expect(label.nextElementSibling?.textContent).toBe('3');
    });

    const quickStatsPoints = screen.getByText('Pontos Marcados');
    expect(quickStatsPoints.nextElementSibling?.textContent).toBe('27');

    const resumoPoints = screen.getByText('Total de Pontos');
    expect(resumoPoints.nextElementSibling?.textContent).toBe('27');
  });
});
