import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { buildSessionActiveViewContract } from '@app/screens/sessionActiveView/sessionActiveViewContract';
import { SessionActiveView } from './SessionActiveView';
import { makeFreePlayConfig, makeGame, makeSession, makeTeam } from '../../test/fixtures';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isSupabaseConfigured: true }),
}));

const teamA = makeTeam('ta', 's1', []);
const teamB = makeTeam('tb', 's1', []);
const pelada = makeSession('s1', {
  status: 'active',
  type: 'free_play',
  teamIds: ['ta', 'tb'],
  config: makeFreePlayConfig(),
});
const jogo = makeGame('g1', 's1', { teamAId: 'ta', teamBId: 'tb', status: 'active' });

function renderPlacar(offline: boolean, readOnly = false) {
  const noop = () => {};
  return render(
    <MemoryRouter>
      <SessionActiveView
        contract={buildSessionActiveViewContract({
          activeSession: pelada,
          games: [jogo],
          pointEvents: [],
          players: [],
          sessionTeams: [teamA, teamB],
          gameReports: [],
          currentDeviceId: 'aparelho',
          offline,
          readOnly,
          setGames: noop,
          setPointEvents: noop,
          setGameReports: noop,
          setActiveSession: noop,
          onExit: noop,
          onFinishSession: noop,
        })}
      />
    </MemoryRouter>,
  );
}

describe('SessionActiveView sem sinal', () => {
  it('trava desfazer e encerrar e diz por que', () => {
    renderPlacar(true);
    expect(screen.getByRole('alert').textContent).toContain(
      'Sem conexão. O placar volta quando o sinal voltar.',
    );
    expect(
      (screen.getByRole('button', { name: /desfazer ponto/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    for (const botao of screen.getAllByRole('button', { name: /encerrar/i })) {
      expect((botao as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('com sinal, nada trava por conexao', () => {
    renderPlacar(false);
    expect(screen.queryByText(/O placar volta quando o sinal voltar/)).toBeNull();
    expect(
      (screen.getByRole('button', { name: /desfazer ponto/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe('SessionActiveView para quem acompanha', () => {
  it('membro ve o placar sem os botoes de marcar, e sabe por que', () => {
    renderPlacar(false, true);
    expect(screen.getByRole('status').textContent).toContain(
      'Você está acompanhando ao vivo. Só quem organiza marca o placar.',
    );
    expect(
      (screen.getByRole('button', { name: /desfazer ponto/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    for (const botao of screen.getAllByRole('button', { name: /encerrar/i })) {
      expect((botao as HTMLButtonElement).disabled).toBe(true);
    }
    const marcar = screen.getAllByRole('button', { name: /\+1/ });
    expect(marcar.length).toBeGreaterThan(0);
    for (const botao of marcar) {
      expect((botao as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
