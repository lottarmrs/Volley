import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionOrganizerPanel } from './SessionOrganizerPanel';

const membros = [
  { userId: 'u-ana', nome: 'Ana Prado' },
  { userId: 'u-bia', nome: 'Bianca Ferraz' },
];

function renderPanel(overrides: Partial<Parameters<typeof SessionOrganizerPanel>[0]> = {}) {
  const onTransfer = vi.fn().mockResolvedValue({ ok: true, value: undefined });
  const onClose = vi.fn();
  render(
    <SessionOrganizerPanel
      membros={membros}
      currentUserId="u-dono"
      organizadorAtual="Caio Medeiros"
      podeTransferir
      onTransfer={onTransfer}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onTransfer, onClose };
}

describe('SessionOrganizerPanel', () => {
  it('diz quem organiza hoje', () => {
    renderPanel();
    expect(screen.getByText(/caio medeiros/i)).toBeDefined();
  });

  it('assumir a pelada não pede seletor: um toque e a pessoa é ela mesma', async () => {
    const { onTransfer } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /assumir esta pelada/i }));

    await waitFor(() => expect(onTransfer).toHaveBeenCalledTimes(1));
    expect(onTransfer.mock.calls[0][0]).toBe('u-dono');
  });

  it('passar para outra pessoa usa o seletor, e só age no botão', async () => {
    const { onTransfer } = renderPanel();

    fireEvent.change(screen.getByLabelText(/quem vai organizar/i), {
      target: { value: 'u-bia' },
    });
    expect(onTransfer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^passar a organização$/i }));
    await waitFor(() => expect(onTransfer).toHaveBeenCalledWith('u-bia'));
  });

  it('sem saber quem organiza, não inventa que não há ninguém', () => {
    renderPanel({ organizadorAtual: null });
    expect(screen.queryByText(/ninguém ainda/i)).toBeNull();
    expect(screen.getByRole('button', { name: /assumir esta pelada/i })).toBeDefined();
  });

  it('avisa que a responsabilidade vale para a comunidade inteira', () => {
    renderPanel();
    expect(screen.getByText(/qualquer pelada desta comunidade/i)).toBeDefined();
  });

  it('quem não pode transferir só vê quem organiza', () => {
    renderPanel({ podeTransferir: false });
    expect(screen.queryByRole('button', { name: /assumir esta pelada/i })).toBeNull();
    expect(screen.queryByLabelText(/quem vai organizar/i)).toBeNull();
    expect(screen.getByText(/caio medeiros/i)).toBeDefined();
  });

  it('mostra o erro que o servidor devolveu', async () => {
    const onTransfer = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'permission_denied', message: 'Esta ação pede verificação em duas etapas.' },
    });
    renderPanel({ onTransfer });

    fireEvent.click(screen.getByRole('button', { name: /assumir esta pelada/i }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/duas etapas/i));
  });
});
