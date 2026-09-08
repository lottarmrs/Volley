import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunitySkillProfilePanel } from './CommunitySkillProfilePanel';
import { loadCommunitySkillProfile } from '@app/communitySkillProfileUseCases';

vi.mock('@app/communitySkillProfileUseCases', () => ({ loadCommunitySkillProfile: vi.fn() }));

const props = {
  currentUserId: 'user-1',
  playerCloudId: 'player-1',
  communities: [
    { id: 'community-1', name: 'Vôlei terça' },
    { id: 'community-2', name: 'Vôlei sábado' },
  ],
};
const profile = {
  community_id: 'community-1',
  player_id: 'player-1',
  rubric_version: 'v0-legacy-11',
  aggregation_policy_version: 'v0-legacy-mad-mean' as const,
  status: 'EXPERIMENTAL' as const,
  source_revision: 'checkpoint',
  calculated_at: '2026-09-06T00:00:00Z',
  contribution_count: 4,
  dimensions: [
    { dimension_key: 'saque', value: 5, sample_count: 4, included_count: 3, excluded_count: 1 },
    { dimension_key: 'defesa', value: null, sample_count: 0, included_count: 0, excluded_count: 0 },
    { dimension_key: 'ataque', value: 0, sample_count: 1, included_count: 1, excluded_count: 0 },
  ],
};

function requestProfile() {
  fireEvent.change(screen.getByLabelText('Comunidade do perfil'), {
    target: { value: 'community-1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar perfil' }));
}

describe('Community skill profile preview', () => {
  beforeEach(() => {
    vi.mocked(loadCommunitySkillProfile).mockReset();
    vi.mocked(loadCommunitySkillProfile).mockResolvedValue({ ok: true, value: profile });
  });

  it('waits for explicit Community selection and request, then displays coverage and missing versus zero', async () => {
    render(<CommunitySkillProfilePanel {...props} />);
    expect(loadCommunitySkillProfile).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Consultar perfil' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    requestProfile();
    expect(await screen.findByText('Sem avaliação')).toBeTruthy();
    expect(screen.getByText('0,0')).toBeTruthy();
    expect(screen.getByText('5,0')).toBeTruthy();
    expect(screen.getByText('3 de 4')).toBeTruthy();
    expect(loadCommunitySkillProfile).toHaveBeenCalledWith({
      communityId: 'community-1',
      playerId: 'player-1',
      rubricVersion: 'v0-legacy-11',
    });
  });

  it('shows a permission refusal as an error and allows another request', async () => {
    vi.mocked(loadCommunitySkillProfile).mockResolvedValueOnce({
      ok: false,
      error: {
        kind: 'product',
        code: 'permission_denied',
        recoverable: false,
        message: 'É preciso ser avaliador autorizado nesta comunidade.',
      },
    });
    render(<CommunitySkillProfilePanel {...props} />);
    requestProfile();
    expect((await screen.findByRole('alert')).textContent).toContain('avaliador autorizado');
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar perfil' }));
    expect(await screen.findByText('5,0')).toBeTruthy();
  });

  it('clears an old result immediately when Community selection changes', async () => {
    render(<CommunitySkillProfilePanel {...props} />);
    requestProfile();
    await screen.findByText('5,0');
    fireEvent.change(screen.getByLabelText('Comunidade do perfil'), {
      target: { value: 'community-2' },
    });
    expect(screen.queryByText('5,0')).toBeNull();
    expect(loadCommunitySkillProfile).toHaveBeenCalledTimes(1);
  });

  it.each(['playerCloudId', 'currentUserId'] as const)(
    'ignores a late result after %s changes',
    async (field) => {
      let finish!: (value: Awaited<ReturnType<typeof loadCommunitySkillProfile>>) => void;
      vi.mocked(loadCommunitySkillProfile).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const view = render(<CommunitySkillProfilePanel {...props} />);
      requestProfile();
      await waitFor(() => expect(loadCommunitySkillProfile).toHaveBeenCalledTimes(1));
      view.rerender(<CommunitySkillProfilePanel {...props} {...{ [field]: 'new-context' }} />);
      await act(async () => {
        finish({ ok: true, value: profile });
      });
      expect(screen.queryByText('5,0')).toBeNull();
      expect((screen.getByLabelText('Comunidade do perfil') as HTMLSelectElement).value).toBe('');
    },
  );

  it('ignores a pending response when another Community is selected', async () => {
    let finish!: (value: Awaited<ReturnType<typeof loadCommunitySkillProfile>>) => void;
    vi.mocked(loadCommunitySkillProfile).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<CommunitySkillProfilePanel {...props} />);
    requestProfile();
    fireEvent.change(screen.getByLabelText('Comunidade do perfil'), {
      target: { value: 'community-2' },
    });
    await act(async () => {
      finish({ ok: true, value: profile });
    });
    expect(screen.queryByText('5,0')).toBeNull();
    expect(loadCommunitySkillProfile).toHaveBeenCalledTimes(1);
  });

  it('requires a new selection after the selected Community disappears and returns', async () => {
    const view = render(<CommunitySkillProfilePanel {...props} />);
    requestProfile();
    await screen.findByText('5,0');
    view.rerender(<CommunitySkillProfilePanel {...props} communities={[props.communities[1]]} />);
    expect(screen.queryByText('5,0')).toBeNull();
    view.rerender(<CommunitySkillProfilePanel {...props} />);
    expect((screen.getByLabelText('Comunidade do perfil') as HTMLSelectElement).value).toBe('');
    expect(loadCommunitySkillProfile).toHaveBeenCalledTimes(1);
  });

  it('does not offer cloud profile reads without an account or cloud Player', () => {
    const view = render(<CommunitySkillProfilePanel {...props} currentUserId={null} />);
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<CommunitySkillProfilePanel {...props} playerCloudId={undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(loadCommunitySkillProfile).not.toHaveBeenCalled();
  });
  it('refreshes the selected profile after an evaluation is saved', async () => {
    const view = render(<CommunitySkillProfilePanel {...props} refreshVersion={0} />);
    requestProfile();
    await screen.findByText('5,0');
    view.rerender(<CommunitySkillProfilePanel {...props} refreshVersion={1} />);
    await waitFor(() => expect(loadCommunitySkillProfile).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText('Comunidade do perfil') as HTMLSelectElement).value).toBe(
      'community-1',
    );
  });

  it('does not automatically read another community after a saved evaluation refresh', async () => {
    const view = render(<CommunitySkillProfilePanel {...props} refreshVersion={0} />);
    requestProfile();
    await screen.findByText('5,0');
    view.rerender(<CommunitySkillProfilePanel {...props} refreshVersion={1} />);
    await waitFor(() => expect(loadCommunitySkillProfile).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('Comunidade do perfil'), {
      target: { value: 'community-2' },
    });
    expect(screen.queryByText('5,0')).toBeNull();
    expect(loadCommunitySkillProfile).toHaveBeenCalledTimes(2);
  });
});
