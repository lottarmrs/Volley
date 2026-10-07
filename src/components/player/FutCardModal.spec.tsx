import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Attributes, Game, Session, Team } from '@shared/types';
import { formHistoryFromSessions } from '@logic/futCards';
import { makePlayer } from '../../test/fixtures';
import { FutCardModal } from './FutCardModal';

vi.mock('../../hooks/usePlayerCareer', () => ({
  usePlayerCareer: () => ({ status: 'idle' }),
}));

vi.mock('@app/communitySkillProfileUseCases', () => ({
  loadCommunitySkillProfile: vi.fn(async () => ({
    ok: true,
    value: {
      contribution_count: 2,
      dimensions: [],
      calculated_at: '2026-09-29T00:00:00.000Z',
    },
  })),
}));

function renderCarta(props: {
  cloudId?: string;
  communityId?: string | null;
  canSeeEvaluation?: boolean;
  skillValues?: Map<string, Partial<Attributes>>;
}) {
  const player = makePlayer('p1', { cloudId: props.cloudId });
  return render(
    <FutCardModal
      isOpen
      onClose={vi.fn()}
      player={player}
      players={[player]}
      sessions={[]}
      teams={[]}
      games={[]}
      pointEvents={[]}
      communityId={props.communityId}
      canSeeEvaluation={props.canSeeEvaluation}
      skillValues={props.skillValues}
    />,
  );
}

describe('FutCardModal, aba Avaliação', () => {
  it('mostra a avaliacao da comunidade para quem pode ver', async () => {
    renderCarta({ cloudId: 'cp1', communityId: 'cc1', canSeeEvaluation: true });
    fireEvent.click(screen.getAllByRole('button', { name: /avaliação/i })[0]);
    expect(
      (await screen.findAllByText('2 avaliações compõem este perfil.')).length,
    ).toBeGreaterThan(0);
  });

  it('sem permissao, nao ha a aba', () => {
    renderCarta({ cloudId: 'cp1', communityId: 'cc1', canSeeEvaluation: false });
    expect(screen.queryAllByRole('button', { name: /avaliação/i })).toHaveLength(0);
    expect(screen.queryAllByRole('tab', { name: /avaliação/i })).toHaveLength(0);
  });

  it('ficha sem nuvem nao tem a aba', () => {
    renderCarta({ communityId: 'cc1', canSeeEvaluation: true });
    expect(screen.queryAllByRole('button', { name: /avaliação/i })).toHaveLength(0);
    expect(screen.queryAllByRole('tab', { name: /avaliação/i })).toHaveLength(0);
  });
});

describe('FutCardModal, carta sem avaliacao', () => {
  it('o texto de exportar nao revela OVR quando o atleta nao tem avaliacao', () => {
    renderCarta({ skillValues: new Map() });
    fireEvent.click(screen.getAllByRole('button', { name: /exportar/i })[0]);
    expect(screen.getAllByText(/OVR: \?/).length).toBeGreaterThan(0);
  });
});

describe('FutCardModal, forma de quem tem conta', () => {
  it('evolucao e texto exportado leem a forma reconstruida pelo historico, nao a da ficha', () => {
    const player = makePlayer('p1', {
      userId: 'conta-1',
      formaAtual: { valor: 0, observacao: '', ultimasPartidas: [1.1, 1.2] },
    });
    const sessions = [
      { id: 's1', name: 's1', date: '2026-06-01', status: 'finished' },
    ] as unknown as Session[];
    const teams = [
      { id: 't1', sessionId: 's1', name: 'A', playerIds: ['p1'] },
      { id: 't2', sessionId: 's1', name: 'B', playerIds: ['p2'] },
    ] as unknown as Team[];
    const games = [
      {
        id: 'g1',
        sessionId: 's1',
        teamAId: 't1',
        teamBId: 't2',
        scoreA: 25,
        scoreB: 20,
        winnerTeamId: 't1',
        status: 'finished',
      },
    ] as unknown as Game[];
    const nota = formHistoryFromSessions(player, { sessions, teams, games, pointEvents: [] });
    expect(nota).toHaveLength(1);
    render(
      <FutCardModal
        isOpen
        onClose={vi.fn()}
        player={player}
        players={[player]}
        sessions={sessions}
        teams={teams}
        games={games}
        pointEvents={[]}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /exportar/i })[0]);
    expect(screen.getAllByText(new RegExp(`Notas: ${nota[0]} `)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Notas: 1\.1, 1\.2/)).toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: /evolu/i })[0]);
    expect(screen.getAllByText(`Agora ${nota[0].toFixed(1)}`).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Agora 1.2')).toHaveLength(0);
  });
});
