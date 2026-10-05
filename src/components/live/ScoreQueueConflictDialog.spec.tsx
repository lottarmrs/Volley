import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScoreQueueConflictDialog } from './ScoreQueueConflictDialog';

describe('ScoreQueueConflictDialog', () => {
  it('sem conflito nao mostra nada', () => {
    render(<ScoreQueueConflictDialog conflict={null} onSendAnyway={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('conflito pergunta e cada botao faz o que diz', () => {
    const onSendAnyway = vi.fn();
    const onDiscard = vi.fn();
    render(
      <ScoreQueueConflictDialog
        conflict={{ takenOverBy: 'Bia', foreignPoints: 3, myPoints: 4, sessionEnded: false }}
        onSendAnyway={onSendAnyway}
        onDiscard={onDiscard}
      />,
    );
    expect(screen.getByRole('dialog').textContent).toContain(
      'Enquanto você estava sem sinal, Bia assumiu o placar e marcou 3 pontos. Você tem 4 pontos guardados.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enviar os meus mesmo assim' }));
    expect(onSendAnyway).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar os meus' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('pelada encerrada em outro lugar so oferece descartar', () => {
    const onDiscard = vi.fn();
    render(
      <ScoreQueueConflictDialog
        conflict={{ takenOverBy: null, foreignPoints: 0, myPoints: 1, sessionEnded: true }}
        onSendAnyway={vi.fn()}
        onDiscard={onDiscard}
      />,
    );
    expect(screen.getByRole('dialog').textContent).toContain(
      'A pelada foi encerrada enquanto você estava sem sinal. Você tem 1 ponto guardado.',
    );
    expect(screen.queryByRole('button', { name: 'Enviar os meus mesmo assim' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar os meus' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
