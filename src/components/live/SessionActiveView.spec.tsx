import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { buildSessionActiveViewContract } from '@app/screens/sessionActiveView/sessionActiveViewContract';
import { SessionActiveView } from './SessionActiveView';
import type { PointEvent } from '@shared/types';
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

function renderPlacar(
  offline: boolean,
  readOnly = false,
  pointEvents: PointEvent[] = [],
  scoreQueue?: Parameters<typeof buildSessionActiveViewContract>[0]['scoreQueue'],
) {
  const noop = () => {};
  return render(
    <MemoryRouter>
      <SessionActiveView
        contract={buildSessionActiveViewContract({
          activeSession: pelada,
          games: [jogo],
          pointEvents,
          players: [],
          sessionTeams: [teamA, teamB],
          gameReports: [],
          currentDeviceId: 'aparelho',
          offline,
          readOnly,
          scoreQueue,
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

const fila = (over: Partial<NonNullable<Parameters<typeof renderPlacar>[3]>> = {}) => ({
  pending: 0,
  queued: false,
  sending: false,
  conflict: null,
  sendAnyway: vi.fn(),
  discard: vi.fn(),
  ...over,
});

describe('SessionActiveView sem sinal', () => {
  it('marca e desfaz sem sinal, mostra quantos pontos estao guardados e trava so o encerrar', () => {
    renderPlacar(true, false, [], fila({ pending: 4, queued: true }));
    expect(screen.getByText('Sem sinal · 4 pontos guardados no aparelho')).toBeTruthy();
    expect(
      screen.getByText('Encerre quando o sinal voltar e os pontos forem enviados.'),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /desfazer ponto/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
    for (const botao of screen.getAllByRole('button', { name: /encerrar pelada/i })) {
      expect((botao as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('com sinal e fila, mostra Enviando e ainda trava o encerrar', () => {
    renderPlacar(false, false, [], fila({ pending: 2, queued: true, sending: true }));
    expect(screen.getByText('Enviando…')).toBeTruthy();
    for (const botao of screen.getAllByRole('button', { name: /encerrar pelada/i })) {
      expect((botao as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('com sinal e sem fila, nada trava', () => {
    renderPlacar(false, false, [], fila());
    expect(screen.queryByText(/sem sinal/i)).toBeNull();
    for (const botao of screen.getAllByRole('button', { name: /encerrar pelada/i })) {
      expect((botao as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('conflito pergunta e cada botao faz o que diz', () => {
    const q = fila({
      pending: 4,
      queued: true,
      conflict: { takenOverBy: 'Bia', foreignPoints: 3, myPoints: 4 },
    });
    renderPlacar(false, false, [], q);
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.textContent).toContain(
      'Enquanto você estava sem sinal, Bia assumiu o placar e marcou 3 pontos. Você tem 4 pontos guardados.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enviar os meus mesmo assim' }));
    expect(q.sendAnyway).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar os meus' }));
    expect(q.discard).toHaveBeenCalledTimes(1);
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

describe('SessionActiveView eventos', () => {
  const ponto = (id: string, segundos: number, antes: number, deletedAt?: string): PointEvent => ({
    id,
    sessionId: 's1',
    gameId: 'g1',
    sequenceNumber: antes + 1,
    scoringTeamId: 'ta',
    concedingTeamId: 'tb',
    scoreBefore: { teamA: antes, teamB: 0 },
    scoreAfter: { teamA: antes + 1, teamB: 0 },
    timestamp: new Date(Date.UTC(2026, 9, 5, 20, 0, segundos)).toISOString(),
    deletedAt,
  });

  it('o ponto desfeito aparece marcado e fica fora da contagem', () => {
    renderPlacar(false, false, [
      ponto('p1', 1, 0),
      ponto('p2', 2, 1, '2026-10-05T20:00:03.000Z'),
      ponto('p3', 4, 1),
    ]);
    expect(screen.getByRole('button', { name: /eventos \(2\)/i })).toBeDefined();
    expect(screen.getAllByText('Desfeito')).toHaveLength(1);
  });
});
