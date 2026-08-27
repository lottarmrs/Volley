import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerEditView } from './PlayerEditView';
import { buildPlayerEditViewContract } from '../../application/screens/playerEditView/playerEditViewContract';
import type { PlayerEditViewContractInput } from '../../application/screens/playerEditView/playerEditViewContract';
import { submitSelfEvaluation } from '../../application/selfEvaluationUseCases';
import { makePlayer } from '../../test/fixtures';
import type { Community, Player } from '../../types';

vi.mock('../../application/selfEvaluationUseCases', () => ({
  submitSelfEvaluation: vi.fn(),
}));

const NOW = '2026-01-01T12:00:00.000Z';

function makeCommunity(overrides: Partial<Community> = {}): Community {
  return {
    id: 'community-1',
    name: 'Comunidade Teste',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function renderPlayerEditView(
  overrides: Partial<PlayerEditViewContractInput> = {},
  player?: Player,
) {
  const editingPlayer = player ?? makePlayer('p1');
  const defaults: PlayerEditViewContractInput = {
    editingPlayer,
    setEditingPlayer: vi.fn(),
    players: [editingPlayer],
    games: [],
    pointEvents: [],
    teams: [],
    communities: [],
    sessions: [],
    onBack: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    validationErrors: {},
    showDeleteConfirm: false,
    setShowDeleteConfirm: vi.fn(),
    permissions: { canEditPlayerProfile: true, canEvaluatePlayer: true },
    currentUserId: null,
  };
  const contract = buildPlayerEditViewContract({ ...defaults, ...overrides });
  return render(<PlayerEditView contract={contract} />);
}

describe('PlayerEditView evaluation community gate', () => {
  it('disables the evaluation attribute sliders when the player has no community', () => {
    const player = makePlayer('p1', { communityIds: [] });
    renderPlayerEditView({ communities: [] }, player);

    expect(
      screen.getByText('Avaliação indisponível: este atleta não pertence a nenhuma comunidade.'),
    ).toBeTruthy();

    const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
    // slider[0] is the "Forma" slider, gated by canEditPlayerProfile, not the
    // evaluation-community gate — the rest (11 technical attributes) must be
    // disabled since there is no valid community to attach an evaluation to.
    expect(sliders[0].disabled).toBe(false);
    expect(sliders.slice(1).every((slider) => slider.disabled)).toBe(true);
  });

  it('enables the evaluation attribute sliders when the player belongs to a community', () => {
    const community = makeCommunity();
    const player = makePlayer('p1', { communityIds: [community.id] });
    renderPlayerEditView({ communities: [community] }, player);

    expect(
      screen.queryByText('Avaliação indisponível: este atleta não pertence a nenhuma comunidade.'),
    ).toBeNull();

    const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
    expect(sliders.slice(1).every((slider) => !slider.disabled)).toBe(true);
  });
});

describe('PlayerEditView self-evaluation surface', () => {
  beforeEach(() => {
    vi.mocked(submitSelfEvaluation).mockReset();
    vi.mocked(submitSelfEvaluation).mockResolvedValue({ ok: true, value: undefined });
  });

  it('does not render for a player that is not the current user', () => {
    const player = makePlayer('p1', { userId: 'someone-else' });
    renderPlayerEditView({ currentUserId: 'user-1' }, player);

    expect(screen.queryByText('Minha Autoavaliação')).toBeNull();
  });

  it('does not render when the player has no linked account at all', () => {
    const player = makePlayer('p1');
    renderPlayerEditView({ currentUserId: 'user-1' }, player);

    expect(screen.queryByText('Minha Autoavaliação')).toBeNull();
  });

  it('renders and submits through submitSelfEvaluation for the player editing themselves', async () => {
    const player = makePlayer('p1', { userId: 'user-1', cloudId: 'cloud-p1' });
    renderPlayerEditView({ currentUserId: 'user-1' }, player);

    expect(screen.getByText('Minha Autoavaliação')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Salvar Minha Autoavaliação/i }));

    expect(submitSelfEvaluation).toHaveBeenCalledTimes(1);
    const [playerId, attributes] = vi.mocked(submitSelfEvaluation).mock.calls[0];
    expect(playerId).toBe('cloud-p1');
    expect(attributes).toEqual(player.atributos);

    expect(await screen.findByText('Autoavaliação salva.')).toBeTruthy();
  });
});
