import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgendaView } from './AgendaView';
import type { AgendaItem } from '@app/agendaViewModel';

const mockItems: AgendaItem[] = [
  {
    id: 's1',
    kind: 'session',
    refId: 'sess-1',
    date: '2026-08-20',
    title: 'Pelada de Quinta',
    communityName: 'Panelinha de Quinta',
    communityId: 'c1',
  },
  {
    id: 'r1',
    kind: 'round',
    refId: 'round-1',
    date: '2026-08-22',
    title: 'Rodada 2 - Liga de Inverno',
    communityName: 'Panelinha de Quinta',
    communityId: 'c1',
  },
];

describe('AgendaView', () => {
  it('renders toolbar with Day, Week, Month and List view mode switchers', () => {
    render(<AgendaView items={mockItems} onOpen={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Dia/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Semana/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mês/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Lista/i })).toBeTruthy();
  });

  it('switches to List view mode and displays scheduled items', () => {
    const handleOpen = vi.fn();
    render(<AgendaView items={mockItems} onOpen={handleOpen} />);

    const listModeBtn = screen.getByRole('button', { name: /Lista/i });
    fireEvent.click(listModeBtn);

    expect(screen.getByText('Pelada de Quinta')).toBeTruthy();
    expect(screen.getByText('Rodada 2 - Liga de Inverno')).toBeTruthy();

    const itemBtn = screen.getByText('Pelada de Quinta');
    fireEvent.click(itemBtn);
    expect(handleOpen).toHaveBeenCalledWith(mockItems[0]);
  });
});
