import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityEvaluationEditor } from './CommunityEvaluationEditor';
import {
  loadCommunityEvaluationEditor,
  submitCommunityEvaluation,
} from '@app/communityEvaluationUseCases';

vi.mock('@app/communityEvaluationUseCases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/communityEvaluationUseCases')>()),
  loadCommunityEvaluationEditor: vi.fn(),
  submitCommunityEvaluation: vi.fn(),
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
  });

  it('starts every fundamento without a score and sends only actual scores including zero', async () => {
    render(<CommunityEvaluationEditor {...props} />);
    const saque = await screen.findByLabelText('Saque');
    expect(saque.getAttribute('aria-valuetext')).toBe('sem nota');
    expect(screen.getByText('0 de 11')).toBeTruthy();
    fireEvent.change(saque, { target: { value: '0' } });
    expect(saque.getAttribute('aria-valuetext')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
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
    expect(await screen.findByText('Avaliação salva.')).toBeTruthy();
  });

  it('shows half points with a comma and clears a score back to no score', async () => {
    render(<CommunityEvaluationEditor {...props} />);
    const saque = await screen.findByLabelText('Saque');
    fireEvent.change(saque, { target: { value: '7.5' } });
    expect(saque.getAttribute('aria-valuetext')).toBe('7,5');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar Saque' }));
    expect(saque.getAttribute('aria-valuetext')).toBe('sem nota');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe pelo menos uma nota.')).toBeTruthy();
    expect(submitCommunityEvaluation).not.toHaveBeenCalled();
  });

  it('uses the save label the caller gives, naming the next athlete', async () => {
    render(<CommunityEvaluationEditor {...props} saveLabel="Salvar · próximo: Bia" />);
    expect(await screen.findByRole('button', { name: 'Salvar · próximo: Bia' })).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Avaliação alterada. Recarregue.');
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(props.onSaved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar avaliação' }));
    await waitFor(() => expect(loadCommunityEvaluationEditor).toHaveBeenCalledTimes(2));
  });

  it('explains an unactivated model and a person who does not evaluate', async () => {
    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: { ...context, authority_model: 'legacy', can_evaluate: false },
    });
    const legacy = render(<CommunityEvaluationEditor {...props} />);
    expect(
      await screen.findByText('Este modelo ainda não foi ativado nesta comunidade.'),
    ).toBeDefined();
    expect(screen.queryByLabelText('Saque')).toBeNull();
    legacy.unmount();

    vi.mocked(loadCommunityEvaluationEditor).mockResolvedValue({
      ok: true,
      value: { ...context, can_evaluate: false },
    });
    render(<CommunityEvaluationEditor {...props} />);
    expect(await screen.findByText(/Você não avalia nesta comunidade/)).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    view.unmount();
    await act(async () => {
      finish({ ok: true, value: undefined });
    });
    expect(props.onSaved).not.toHaveBeenCalled();
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
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
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
});
