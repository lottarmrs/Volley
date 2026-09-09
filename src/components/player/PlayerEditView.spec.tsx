import { loadCommunitySkillProfile } from '@app/communitySkillProfileUseCases';
import {
  loadCommunityEvaluationEditor,
  isCommunityEvaluationActivated,
  submitCommunityEvaluation,
} from '@app/communityEvaluationUseCases';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@app/communitySkillProfileUseCases', () => ({ loadCommunitySkillProfile: vi.fn() }));
vi.mock('@app/communityEvaluationUseCases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/communityEvaluationUseCases')>()),
  loadCommunityEvaluationEditor: vi.fn(),
  submitCommunityEvaluation: vi.fn(),
  isCommunityEvaluationActivated: vi.fn(),
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
  beforeEach(() => {
    // Padrao: comunidade ja migrada. Os testes deste bloco exercitam o editor novo; os
    // dois que tratam do gate em si declaram o valor que precisam.
    vi.mocked(isCommunityEvaluationActivated).mockReset();
    vi.mocked(isCommunityEvaluationActivated).mockResolvedValue(true);
  });

  it('offers the experimental profile only for cloud communities linked to this Player', () => {
    const community = makeCommunity({ cloudId: 'cloud-community' });
    const unrelated = makeCommunity({
      id: 'other',
      cloudId: 'other-cloud',
      name: 'Outra comunidade',
    });
    const player = makePlayer('p1', { cloudId: 'cloud-player', communityIds: [community.id] });
    renderPlayerEditView({ currentUserId: 'user', communities: [community, unrelated] }, player);
    const select = screen.getByLabelText('Comunidade do perfil') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      '',
      'cloud-community',
    ]);
    expect(
      (screen.getByRole('button', { name: 'Consultar perfil' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('refreshes the exact selected community after saving through the editor', async () => {
    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: {
        community_id: 'cloud-community',
        player_id: 'cloud-player',
        authority_model: 'target',
        can_evaluate: true,
        can_manage_evaluators: false,
        rubric_version: 'v0-legacy-11',
        own_evaluation: null,
        members: [],
      },
    });
    vi.mocked(submitCommunityEvaluation).mockResolvedValue({ ok: true, value: undefined });
    vi.mocked(loadCommunitySkillProfile).mockResolvedValue({
      ok: true,
      value: {
        community_id: 'cloud-community',
        player_id: 'cloud-player',
        rubric_version: 'v0-legacy-11',
        aggregation_policy_version: 'v0-legacy-mad-mean',
        status: 'EXPERIMENTAL',
        source_revision: 'r1',
        calculated_at: NOW,
        contribution_count: 1,
        dimensions: [],
      },
    });
    const community = makeCommunity({ cloudId: 'cloud-community' });
    const player = makePlayer('p1', { cloudId: 'cloud-player', communityIds: [community.id] });
    renderPlayerEditView({ currentUserId: 'user', communities: [community] }, player);
    fireEvent.change(screen.getByLabelText('Comunidade do perfil'), {
      target: { value: 'cloud-community' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Avaliar atleta' }));
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Saque' }), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    await waitFor(() =>
      expect(loadCommunitySkillProfile).toHaveBeenCalledWith({
        communityId: 'cloud-community',
        playerId: 'cloud-player',
        rubricVersion: 'v0-legacy-11',
      }),
    );
    expect((screen.getByLabelText('Comunidade do perfil') as HTMLSelectElement).value).toBe(
      'cloud-community',
    );
    expect(screen.queryByRole('spinbutton', { name: 'Saque' })).toBeNull();
  });

  it('mantem o formulario legado numa comunidade em nuvem que ainda nao migrou', async () => {
    // O gate e a migracao da COMUNIDADE, nao o atleta ter id de nuvem. Gatear por cloudId
    // deixava a comunidade legada sem superficie alguma: sliders desabilitados aqui e
    // `can_evaluate: false` no editor novo -- com o cutover irreversivel como unica saida.
    vi.mocked(isCommunityEvaluationActivated).mockResolvedValue(false);
    const community = makeCommunity({ cloudId: 'cloud-community' });
    const player = makePlayer('p1', { cloudId: 'cloud-player', communityIds: [community.id] });
    renderPlayerEditView({ currentUserId: 'user', communities: [community] }, player);

    await waitFor(() => {
      expect(
        screen.getAllByRole('slider').filter((slider) => !(slider as HTMLInputElement).disabled)
          .length,
      ).toBeGreaterThan(1);
    });
  });

  it('retira o formulario legado quando a comunidade migrou', async () => {
    vi.mocked(isCommunityEvaluationActivated).mockResolvedValue(true);
    const community = makeCommunity({ cloudId: 'cloud-community' });
    const player = makePlayer('p1', { cloudId: 'cloud-player', communityIds: [community.id] });
    renderPlayerEditView({ currentUserId: 'user', communities: [community] }, player);

    await waitFor(() => {
      expect(
        screen.getAllByRole('slider').filter((slider) => !(slider as HTMLInputElement).disabled),
      ).toHaveLength(1);
    });
  });

  it('closes the editor when the selected community is no longer linked to the player', async () => {
    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: {
        community_id: 'cloud-community',
        player_id: 'cloud-player',
        authority_model: 'target',
        can_evaluate: true,
        can_manage_evaluators: false,
        rubric_version: 'v0-legacy-11',
        own_evaluation: null,
        members: [],
      },
    });
    const community = makeCommunity({ cloudId: 'cloud-community' });
    const player = makePlayer('p1', { cloudId: 'cloud-player', communityIds: [community.id] });
    const view = renderPlayerEditView({ currentUserId: 'user', communities: [community] }, player);
    fireEvent.change(screen.getByLabelText('Comunidade do perfil'), {
      target: { value: 'cloud-community' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Avaliar atleta' }));
    expect(await screen.findByText('Avaliar atleta nesta comunidade')).toBeTruthy();

    const updatedContract = buildPlayerEditViewContract({
      editingPlayer: player,
      setEditingPlayer: vi.fn(),
      players: [player],
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
      currentUserId: 'user',
    });
    view.rerender(<PlayerEditView contract={updatedContract} />);
    expect(screen.queryByText('Avaliar atleta nesta comunidade')).toBeNull();
  });

  it('keeps cloud technical attributes read-only', () => {
    const community = makeCommunity({ cloudId: 'cloud-community' });
    const player = makePlayer('p1', { cloudId: 'cloud-player', communityIds: [community.id] });
    renderPlayerEditView({ communities: [community] }, player);
    expect(screen.getByText(/atributos técnicos antigos/)).toBeTruthy();
    expect(
      screen.getAllByRole('slider').filter((slider) => !(slider as HTMLInputElement).disabled),
    ).toHaveLength(1);
  });

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
