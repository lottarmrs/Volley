import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VolleyballCourtLineup } from './VolleyballCourtLineup';
import type { ChampionshipTeam, Player } from '../../types';

const mockTeam: ChampionshipTeam = {
  id: 'team-1',
  championshipId: 'champ-1',
  name: 'Trovão',
  playerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
  captainPlayerId: 'p1',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const mockPlayers: Player[] = [
  { id: 'p1', nome: 'Ana Silva', apelido: 'Ana', posicaoPrincipal: 'levantador' } as Player,
  { id: 'p2', nome: 'Bia Santos', apelido: 'Bia', posicaoPrincipal: 'ponteiro' } as Player,
  { id: 'p3', nome: 'Caio Costa', apelido: 'Caio', posicaoPrincipal: 'central' } as Player,
  { id: 'p4', nome: 'Davi Lima', apelido: 'Davi', posicaoPrincipal: 'oposto' } as Player,
  { id: 'p5', nome: 'Eduarda Cruz', apelido: 'Duda', posicaoPrincipal: 'ponteiro' } as Player,
  { id: 'p6', nome: 'Felipe Rocha', apelido: 'Lipe', posicaoPrincipal: 'libero' } as Player,
];

describe('VolleyballCourtLineup', () => {
  it('renders court positions with jersey numbers and captain badge', () => {
    render(<VolleyballCourtLineup team={mockTeam} players={mockPlayers} />);
    expect(screen.getByText('Trovão')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByTitle('Capitão do time')).toBeTruthy();
  });
});
