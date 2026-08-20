import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import type { Player, Team } from '../../types';
import { TeamScoreCard } from './TeamScoreCard';

const team = {
  id: 't1',
  sessionId: 's1',
  name: 'Time Azul',
  playerIds: ['p1'],
} as Team;

const players = [{ id: 'p1', nome: 'Rafa', posicaoPrincipal: 'ponteiro' }] as Player[];

function scoreCard(score: number) {
  return (
    <MotionConfig reducedMotion="user">
      <TeamScoreCard
        team={team}
        score={score}
        isWinner={false}
        onCourtStreak={0}
        color="#2563eb"
        isGameActive
        scoringRanking={[]}
        players={players}
        isTeamA
        onRegisterPoint={vi.fn()}
        onOpenDetailModal={vi.fn()}
      />
    </MotionConfig>
  );
}

describe('TeamScoreCard — confirmação do ponto', () => {
  beforeEach(() => {
    // Força a preferência de movimento reduzido. Tem de ser stubGlobal: uma
    // atribuição crua em window vaza para os outros arquivos da suíte.
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra o placar mesmo com movimento reduzido', () => {
    render(scoreCard(14));

    // A confirmação do ponto não pode sumir junto com a animação: sem ela o
    // organizador não sabe se o toque entrou.
    const placar = screen.getByText('14');
    expect(placar).toBeTruthy();
    expect(placar.className).toContain('font-mono');
  });

  it('remonta o número a cada ponto para repetir a confirmação', () => {
    const { rerender } = render(scoreCard(14));
    const antes = screen.getByText('14');

    rerender(scoreCard(15));

    const depois = screen.getByText('15');
    expect(depois).toBeTruthy();
    expect(depois).not.toBe(antes);
  });
});
