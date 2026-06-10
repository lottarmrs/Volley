import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeGame, makePlayer, makeSession, makeTeam } from '../test/fixtures';
import { Game, GameReport, Player, PointEvent, Session, Team } from '../types';
import { useLiveSession } from './useLiveSession';

interface HarnessInput {
  session: Session | null;
  initialGames: Game[];
  players: Player[];
  teams: Team[];
}

function useHarness({ session, initialGames, players, teams }: HarnessInput) {
  const [games, setGames] = useState(initialGames);
  const [pointEvents, setPointEvents] = useState<PointEvent[]>([]);
  const [gameReports, setGameReports] = useState<GameReport[]>([]);
  const live = useLiveSession(
    session,
    games,
    setGames,
    pointEvents,
    setPointEvents,
    players,
    teams,
    gameReports,
    setGameReports,
  );
  return { live, games, pointEvents, gameReports };
}

function buildFixture(sessionOverrides: Partial<Session> = {}, gameOverrides: Partial<Game> = {}) {
  const session = makeSession('s1', sessionOverrides);
  const players = [makePlayer('p1'), makePlayer('p2')];
  const teams = [makeTeam('team-a', 's1', ['p1']), makeTeam('team-b', 's1', ['p2'])];
  const initialGames = [makeGame('g1', 's1', gameOverrides)];
  return { session, players, teams, initialGames };
}

describe('useLiveSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expõe o jogo ativo da sessão como currentGame', () => {
    const { result } = renderHook(() => useHarness(buildFixture()));
    expect(result.current.live.currentGame?.id).toBe('g1');
    expect(result.current.live.sessionGames).toHaveLength(1);
  });

  it('registerPoint cria o PointEvent e incrementa o placar', () => {
    const { result } = renderHook(() => useHarness(buildFixture()));
    act(() => {
      result.current.live.registerPoint('team-a', 'p1', 'attack');
    });
    expect(result.current.pointEvents).toHaveLength(1);
    expect(result.current.pointEvents[0]).toMatchObject({
      scoringTeamId: 'team-a',
      concedingTeamId: 'team-b',
      playerId: 'p1',
      reason: 'attack',
      scoreBefore: { teamA: 0, teamB: 0 },
      scoreAfter: { teamA: 1, teamB: 0 },
    });
    expect(result.current.games[0].scoreA).toBe(1);
    expect(result.current.games[0].status).toBe('active');
  });

  it('finaliza o jogo e gera relatório ao atingir maxPoints com 2 de vantagem', () => {
    const { result } = renderHook(() => useHarness(buildFixture({}, { scoreA: 14, scoreB: 10 })));
    act(() => {
      result.current.live.registerPoint('team-a');
    });
    const game = result.current.games[0];
    expect(game.status).toBe('finished');
    expect(game.winnerTeamId).toBe('team-a');
    expect(game.loserTeamId).toBe('team-b');
    expect(game.finishReason).toBe('auto');
    expect(result.current.gameReports).toHaveLength(1);
    expect(result.current.gameReports[0].winnerTeamId).toBe('team-a');
  });

  it('não finaliza em maxPoints sem 2 de vantagem (win_by_2)', () => {
    const { result } = renderHook(() => useHarness(buildFixture({}, { scoreA: 14, scoreB: 14 })));
    act(() => {
      result.current.live.registerPoint('team-a');
    });
    expect(result.current.games[0].scoreA).toBe(15);
    expect(result.current.games[0].status).toBe('active');
    expect(result.current.gameReports).toHaveLength(0);
  });

  it('ignora o segundo ponto dentro da janela de 200ms (guard anti-duplo-clique)', () => {
    const { result } = renderHook(() => useHarness(buildFixture()));
    act(() => {
      result.current.live.registerPoint('team-a');
      result.current.live.registerPoint('team-a');
    });
    expect(result.current.pointEvents).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.live.registerPoint('team-a');
    });
    expect(result.current.pointEvents).toHaveLength(2);
  });

  it('rejeita ponto de jogador que não pertence ao time que pontuou', () => {
    const { result } = renderHook(() => useHarness(buildFixture()));
    act(() => {
      result.current.live.registerPoint('team-a', 'p2', 'attack');
    });
    expect(result.current.pointEvents).toHaveLength(0);
    expect(result.current.games[0].scoreA).toBe(0);
  });

  it('não registra ponto com a sessão pausada', () => {
    const { result } = renderHook(() => useHarness(buildFixture({ status: 'paused' })));
    act(() => {
      result.current.live.registerPoint('team-a');
    });
    expect(result.current.pointEvents).toHaveLength(0);
  });
});
