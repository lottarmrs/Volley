import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityEvaluationEditor } from './CommunityEvaluationEditor';
import {
  loadCommunityEvaluationEditor,
  submitCommunityEvaluation,
  activateCommunityEvaluation,
  setCommunityEvaluator,
} from '@app/communityEvaluationUseCases';

vi.mock('@app/communityEvaluationUseCases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/communityEvaluationUseCases')>()),
  loadCommunityEvaluationEditor: vi.fn(),
  submitCommunityEvaluation: vi.fn(),
  activateCommunityEvaluation: vi.fn(),
  setCommunityEvaluator: vi.fn(),
}));
const context = {
  community_id: 'community',
  player_id: 'player',
  authority_model: 'target' as const,
  can_evaluate: true,
  can_manage_evaluators: false,
  rubric_version: 'v0-legacy-11',
  own_evaluation: null,
  members: [],
};
const props = { communityId: 'community', playerId: 'player', onSaved: vi.fn() };

describe('versioned Community evaluation editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({ ok: true, value: context });
    vi.mocked(submitCommunityEvaluation).mockResolvedValue({ ok: true, value: undefined });
    vi.mocked(activateCommunityEvaluation).mockResolvedValue({ ok: true, value: undefined });
    vi.mocked(setCommunityEvaluator).mockResolvedValue({ ok: true, value: undefined });
  });

  it('starts blank and sends only actual scores including zero, then refreshes the profile', async () => {
    render(<CommunityEvaluationEditor {...props} />);
    const saque = await screen.findByLabelText('Saque');
    expect((saque as HTMLInputElement).value).toBe('');
    fireEvent.change(saque, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(submitCommunityEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 'community',
        playerId: 'player',
        rubricVersion: 'v0-legacy-11',
        dimensions: { saque: 0 },
        expectedContributionId: null,
      }),
    );
    expect(await screen.findByText('Avaliação salva. Atualizando o perfil.')).toBeTruthy();
  });

  it('preserves command UUIDs and payload across uncertain retry and blocks edits meanwhile', async () => {
    vi.mocked(submitCommunityEvaluation).mockResolvedValueOnce({
      ok: false,
      error: {
        kind: 'technical',
        code: 'technical_error',
        recoverable: true,
        message: 'Falha de rede.',
      },
    });
    render(<CommunityEvaluationEditor {...props} />);
    fireEvent.change(await screen.findByLabelText('Saque'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    await screen.findByText('Falha de rede.');
    expect((screen.getByLabelText('Saque') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(submitCommunityEvaluation).toHaveBeenCalledTimes(2));
    expect(vi.mocked(submitCommunityEvaluation).mock.calls[0][0]).toBe(
      vi.mocked(submitCommunityEvaluation).mock.calls[1][0],
    );
  });

  it('requires reload after stale source and does not report success', async () => {
    vi.mocked(submitCommunityEvaluation).mockResolvedValueOnce({
      ok: false,
      error: {
        kind: 'product',
        code: 'conflict',
        recoverable: false,
        message: 'Avaliação alterada. Recarregue.',
      },
    });
    render(<CommunityEvaluationEditor {...props} />);
    fireEvent.change(await screen.findByLabelText('Saque'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    await screen.findByText('Avaliação alterada. Recarregue.');
    expect(
      (screen.getByRole('button', { name: 'Enviar avaliação' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(props.onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar avaliação' }));
    await waitFor(() => expect(loadCommunityEvaluationEditor).toHaveBeenCalledTimes(2));
  });

  it('requires separate acknowledgement and evaluator assignment for managers', async () => {
    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: {
        ...context,
        authority_model: 'legacy',
        can_evaluate: false,
        can_manage_evaluators: true,
        members: [{ user_id: 'member', label: 'Bia', is_evaluator: false }],
      },
    });
    render(<CommunityEvaluationEditor {...props} />);
    const activate = await screen.findByRole('button', { name: 'Ativar novo modelo' });
    expect((activate as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText('Saque')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: {
        ...context,
        can_evaluate: false,
        can_manage_evaluators: true,
        members: [{ user_id: 'member', label: 'Bia', is_evaluator: false }],
      },
    });
    fireEvent.click(activate);
    await waitFor(() => expect(activateCommunityEvaluation).toHaveBeenCalledWith('community'));
    expect(setCommunityEvaluator).not.toHaveBeenCalled();
    await waitFor(() => expect(loadCommunityEvaluationEditor).toHaveBeenCalledTimes(2));
    fireEvent.change(await screen.findByLabelText('Avaliador'), { target: { value: 'member' } });
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar avaliador' }));
    await waitFor(() =>
      expect(setCommunityEvaluator).toHaveBeenCalledWith('community', 'member', true),
    );
  });

  it('ignores a successful response after leaving the editor', async () => {
    let finish!: (value: Awaited<ReturnType<typeof submitCommunityEvaluation>>) => void;
    vi.mocked(submitCommunityEvaluation).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(<CommunityEvaluationEditor {...props} />);
    fireEvent.change(await screen.findByLabelText('Saque'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    view.unmount();
    await act(async () => {
      finish({ ok: true, value: undefined });
    });
    expect(props.onSaved).not.toHaveBeenCalled();
  });
  it('keeps evaluator management available after activation without evaluation capability', async () => {
    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: {
        ...context,
        can_evaluate: false,
        can_manage_evaluators: true,
        members: [{ user_id: 'member', label: 'Bia', is_evaluator: true }],
      },
    });
    render(<CommunityEvaluationEditor {...props} />);
    fireEvent.change(await screen.findByLabelText('Avaliador'), { target: { value: 'member' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revogar avaliador' }));
    await waitFor(() =>
      expect(setCommunityEvaluator).toHaveBeenCalledWith('community', 'member', false),
    );
  });

  it('does not reinterpret another rubric', async () => {
    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: {
        ...context,
        own_evaluation: {
          contribution_id: 'old',
          rubric_version: 'other',
          dimensions: { saque: 9 },
        },
      },
    });
    render(<CommunityEvaluationEditor {...props} />);
    expect(await screen.findByText(/outra versão/)).toBeTruthy();
    expect(screen.queryByLabelText('Saque')).toBeNull();
  });

  it.each([true, false])(
    'ignores stale save response after context changes: %s',
    async (success) => {
      let finish!: (value: Awaited<ReturnType<typeof submitCommunityEvaluation>>) => void;
      vi.mocked(submitCommunityEvaluation).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const view = render(<CommunityEvaluationEditor {...props} />);
      fireEvent.change(await screen.findByLabelText('Saque'), { target: { value: '6' } });
      fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
      view.rerender(<CommunityEvaluationEditor {...props} playerId="other" />);
      await screen.findByLabelText('Saque');
      await act(async () =>
        finish(
          success
            ? { ok: true, value: undefined }
            : {
                ok: false,
                error: {
                  kind: 'technical',
                  code: 'technical_error',
                  recoverable: true,
                  message: 'Old error',
                },
              },
        ),
      );
      expect(props.onSaved).not.toHaveBeenCalled();
      expect(screen.queryByText('Old error')).toBeNull();
    },
  );

  it('shows management failures and blocks duplicate pending clicks', async () => {
    let finish!: (value: Awaited<ReturnType<typeof setCommunityEvaluator>>) => void;
    vi.mocked(setCommunityEvaluator).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: {
        ...context,
        can_evaluate: false,
        can_manage_evaluators: true,
        members: [{ user_id: 'member', label: 'Bia', is_evaluator: false }],
      },
    });
    render(<CommunityEvaluationEditor {...props} />);
    fireEvent.change(await screen.findByLabelText('Avaliador'), { target: { value: 'member' } });
    const button = screen.getByRole('button', { name: 'Autorizar avaliador' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(setCommunityEvaluator).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () =>
      finish({
        ok: false,
        error: {
          kind: 'product',
          code: 'permission_denied',
          recoverable: false,
          message: 'Sem acesso',
        },
      }),
    );
    expect(screen.getByRole('alert').textContent).toBe('Sem acesso');
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(['community', 'account', 'unmount'])(
    'ignores late management success after %s change',
    async (change) => {
      let finish!: (value: Awaited<ReturnType<typeof activateCommunityEvaluation>>) => void;
      vi.mocked(activateCommunityEvaluation).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
        ok: true,
        value: {
          ...context,
          authority_model: 'legacy',
          can_evaluate: false,
          can_manage_evaluators: true,
        },
      });
      const view = render(<CommunityEvaluationEditor {...props} currentUserId="a" />);
      fireEvent.click(await screen.findByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Ativar novo modelo' }));
      if (change === 'unmount') view.unmount();
      else {
        view.rerender(
          <CommunityEvaluationEditor
            {...props}
            communityId={change === 'community' ? 'other' : props.communityId}
            currentUserId={change === 'account' ? 'b' : 'a'}
          />,
        );
        await screen.findByRole('checkbox');
      }
      const loads = vi.mocked(loadCommunityEvaluationEditor).mock.calls.length;
      await act(async () => finish({ ok: true, value: undefined }));
      expect(loadCommunityEvaluationEditor).toHaveBeenCalledTimes(loads);
    },
  );
});
