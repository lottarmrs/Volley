import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CreateCommunityModal } from './CreateCommunityModal';

describe('CreateCommunityModal', () => {
  it('não grava nada ao cancelar', () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    render(<CreateCommunityModal onClose={onClose} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText(/nome da comunidade/i), {
      target: { value: 'Pelada de quarta' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('recusa nome vazio com erro anunciado, sem criar', () => {
    const onCreate = vi.fn();
    render(<CreateCommunityModal onClose={vi.fn()} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: /criar comunidade/i }));

    expect(onCreate).not.toHaveBeenCalled();
    const erro = screen.getByRole('alert');
    expect(erro.textContent).toMatch(/nome/i);
    expect(screen.getByLabelText(/nome da comunidade/i).getAttribute('aria-invalid')).toBe('true');
  });

  it('cria com nome, local e dia escolhido', () => {
    const onCreate = vi.fn();
    render(<CreateCommunityModal onClose={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText(/nome da comunidade/i), {
      target: { value: '  Pelada de quarta  ' },
    });
    fireEvent.change(screen.getByLabelText(/onde vocês jogam/i), {
      target: { value: 'Quadra do clube' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quarta' }));
    fireEvent.click(screen.getByRole('button', { name: /criar comunidade/i }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      name: 'Pelada de quarta',
      defaultLocation: 'Quadra do clube',
      defaultDay: 'Quarta',
    });
  });

  it('o chip de dia alterna, então o dia continua opcional', () => {
    const onCreate = vi.fn();
    render(<CreateCommunityModal onClose={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText(/nome da comunidade/i), {
      target: { value: 'Sexta à noite' },
    });
    const chip = screen.getByRole('button', { name: 'Sexta' });
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /criar comunidade/i }));
    expect(onCreate.mock.calls[0][0].defaultDay).toBe('');
  });
});
