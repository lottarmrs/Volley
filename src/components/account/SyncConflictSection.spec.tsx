import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SyncConflictSection } from './SyncConflictSection';

const conflito = {
  sessionId: 's-1', sessionName: 'Terça 19h', localEventCount: 21,
  holderUserId: 'u-2', holderName: 'Ana', holderEventCount: 19,
};

describe('SyncConflictSection', () => {
  it('nao aparece quando nao ha conflito', () => {
    const { container } = render(
      <SyncConflictSection conflicts={[]} onKeepMine={vi.fn()} onKeepTheirs={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  it('mostra as DUAS contagens, com nome', () => {
    // Sem os dois numeros a pessoa nao tem como decidir.
    render(<SyncConflictSection conflicts={[conflito]} onKeepMine={vi.fn()} onKeepTheirs={vi.fn()} />);
    expect(screen.getByText(/21/)).toBeTruthy();
    expect(screen.getByText(/19/)).toBeTruthy();
    expect(screen.getByText(/Ana/)).toBeTruthy();
  });

  it('deixa escolher qual versao vale', () => {
    const onKeepMine = vi.fn();
    const onKeepTheirs = vi.fn();
    render(
      <SyncConflictSection conflicts={[conflito]} onKeepMine={onKeepMine} onKeepTheirs={onKeepTheirs} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /manter o meu/i }));
    expect(onKeepMine).toHaveBeenCalledWith('s-1');
    fireEvent.click(screen.getByRole('button', { name: /manter o de ana/i }));
    expect(onKeepTheirs).toHaveBeenCalledWith('s-1');
  });

  it('avisa que nada e apagado', () => {
    // Regra do plano: nenhum descarte silencioso. A pessoa precisa saber disso
    // ANTES de escolher.
    render(<SyncConflictSection conflicts={[conflito]} onKeepMine={vi.fn()} onKeepTheirs={vi.fn()} />);
    expect(screen.getByText(/pode ser recuperad/i)).toBeTruthy();
  });
});
