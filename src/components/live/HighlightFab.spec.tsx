import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Player, Team } from '../../types';
import { HighlightFab } from './HighlightFab';

const teams = [{ id: 't1', sessionId: 's1', name: 'Time Azul', playerIds: ['p1'] }] as Team[];
const players = [{ id: 'p1', nome: 'Rafa', posicaoPrincipal: 'libero' }] as Player[];

function renderFab() {
  return render(<HighlightFab teams={teams} players={players} onRegister={vi.fn()} />);
}

describe('HighlightFab — dica de lance de destaque', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('explica o botão na primeira vez', () => {
    renderFab();
    expect(screen.getByRole('note')).toBeTruthy();
  });

  it('some para sempre depois de dispensada', () => {
    const { unmount } = renderFab();
    fireEvent.click(screen.getByRole('button', { name: /entendi/i }));
    expect(screen.queryByRole('note')).toBeNull();

    unmount();
    renderFab();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('usar o botão também encerra a dica', () => {
    const { unmount } = renderFab();
    fireEvent.click(screen.getByRole('button', { name: /registrar lance de destaque/i }));
    unmount();

    renderFab();
    expect(screen.queryByRole('note')).toBeNull();
  });
});
