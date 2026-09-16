import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionCreationBlocked } from './SessionCreationBlocked';

describe('SessionCreationBlocked', () => {
  it('explains who can create sessions and returns to the Community', () => {
    const onBack = vi.fn();
    render(<SessionCreationBlocked onBack={onBack} />);

    expect(screen.getByRole('heading', { name: 'Nova sessão indisponível' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe(
      'Só dono, admin, moderador ou Organizador criam sessões nesta comunidade.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à comunidade' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
