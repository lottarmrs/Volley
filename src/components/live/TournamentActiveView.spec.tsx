import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentActiveView } from './TournamentActiveView';
import { makeSession, makeTeam } from '../../test/fixtures';

const teamA = makeTeam('team-a', 'tournament-1', []);
const teamB = makeTeam('team-b', 'tournament-1', []);

const noop = () => {};
const noopAsync = async () => false;

const baseProps = {
  sessionGames: [],
  sessionPoints: [],
  currentGame: undefined,
  standings: [],
  sessionTeams: [teamA, teamB],
  players: [],
  scoringRanking: [],
  pointModalTeamId: null,
  setPointModalTeamId: noop,
  registerPoint: noop,
  registerHighlight: noop,
  deleteHighlight: noop,
  finishCurrentGameManually: noop,
  startNextGame: noop,
  undoLastPoint: noop,
  registerWalkover: noop,
  pauseGame: noop,
  reopenGame: noop,
  cancelGame: noop,
  updateFinalScore: noop,
  reorderScheduledGame: noop,
  onFinishSession: noop,
  onExit: noop,
  setActiveSession: noop,
  shareGameToWhatsApp: noop,
  copyGameToClipboard: noopAsync,
  games: [],
};

describe('TournamentActiveView por fase', () => {
  it('torneio ativo sem jogo algum (pronta): mostra Pausar e Encerrar, Iniciar torneio habilitado', () => {
    const activeSession = makeSession('tournament-1', { type: 'tournament', status: 'active' });
    render(<TournamentActiveView {...baseProps} activeSession={activeSession} />);

    expect(screen.getByRole('button', { name: /pausar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /encerrar/i })).toBeTruthy();

    const iniciar = screen.getByRole('button', { name: /começar o torneio/i });
    expect((iniciar as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /^retomar$/i })).toBeNull();
  });

  it('torneio pausado (pausada): mostra Retomar, Iniciar torneio desabilitado', () => {
    const activeSession = makeSession('tournament-1', { type: 'tournament', status: 'paused' });
    render(<TournamentActiveView {...baseProps} activeSession={activeSession} />);

    expect(screen.getByRole('button', { name: /^retomar$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^pausar$/i })).toBeNull();

    const iniciar = screen.getByRole('button', { name: /começar o torneio/i });
    expect((iniciar as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('TournamentActiveView encerrar travado', () => {
  it('com finishLocked, o botao de encerrar do torneio fica desabilitado', () => {
    const onFinishSession = vi.fn();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      const activeSession = makeSession('tournament-1', { type: 'tournament', status: 'active' });
      render(
        <TournamentActiveView
          {...baseProps}
          activeSession={activeSession}
          onFinishSession={onFinishSession}
          finishLocked
        />,
      );
      const encerrar = screen.getByRole('button', { name: /encerrar/i }) as HTMLButtonElement;
      expect(encerrar.disabled).toBe(true);
      fireEvent.click(encerrar);
      expect(onFinishSession).not.toHaveBeenCalled();
    } finally {
      confirmar.mockRestore();
    }
  });

  it('sem finishLocked, encerrar segue habilitado', () => {
    const activeSession = makeSession('tournament-1', { type: 'tournament', status: 'active' });
    render(<TournamentActiveView {...baseProps} activeSession={activeSession} />);
    const encerrar = screen.getByRole('button', { name: /encerrar/i }) as HTMLButtonElement;
    expect(encerrar.disabled).toBe(false);
  });
});
