import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionOwnershipNotice } from './SessionOwnershipNotice';

const base = { canScore: true, reason: 'mine' as const, message: '', holderName: null };

describe('SessionOwnershipNotice', () => {
  it('nao mostra nada quando a sessao e minha neste aparelho', () => {
    const { container } = render(<SessionOwnershipNotice control={base} onTakeControl={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('nomeia quem esta com a sessao e oferece assumir', () => {
    render(
      <SessionOwnershipNotice
        control={{
          canScore: false,
          reason: 'held_by_other',
          message: 'Ana está com o controle desta sessão.',
          holderName: 'Ana',
        }}
        onTakeControl={vi.fn()}
      />,
    );
    expect(screen.getByText(/Ana está com o controle/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /assumir controle/i })).toBeTruthy();
  });

  it('pede confirmacao antes de assumir', () => {
    // Tomar o controle de quem esta marcando placar nao pode ser um clique so.
    const onTakeControl = vi.fn();
    render(
      <SessionOwnershipNotice
        control={{
          canScore: false,
          reason: 'held_by_other',
          message: 'Ana está com o controle desta sessão.',
          holderName: 'Ana',
        }}
        onTakeControl={onTakeControl}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /assumir controle/i }));
    expect(onTakeControl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(onTakeControl).toHaveBeenCalledTimes(1);
  });

  it('avisa sobre outro aparelho sem oferecer assumir', () => {
    // Ja e minha: nao ha o que assumir, so avisar.
    render(
      <SessionOwnershipNotice
        control={{
          canScore: true,
          reason: 'mine_other_device',
          message: 'Você está com esta sessão aberta em outro aparelho.',
          holderName: 'Eu',
        }}
        onTakeControl={vi.fn()}
      />,
    );
    expect(screen.getByText(/outro aparelho/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /assumir controle/i })).toBeNull();
  });
});
