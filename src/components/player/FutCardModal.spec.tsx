import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
