import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import { ChampionshipDetailView } from './ChampionshipDetailView';

vi.mock('../../app/shellContext', () => ({
  useShell: () => ({
    comm: {
      communities: [{ id: 'comm-1', name: 'Vôlei de Terça' }],
    },
    play: {
      players: [{ id: 'p1', nome: 'Ana Silva', apelido: 'Ana' }],
    },
    championships: {
      championships: [
        {
          id: 'champ-1',
          communityId: 'comm-1',
          name: 'Liga de Ouro',
          format: 'round_robin',
          classificationPoints: { win: 3, loss: 0 },
          recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01' },
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      championshipTeams: [
        { id: 't1', championshipId: 'champ-1', name: 'Águias', playerIds: ['p1'], captainPlayerId: 'p1' },
        { id: 't2', championshipId: 'champ-1', name: 'Leões', playerIds: [] },
      ],
      championshipRounds: [
        { id: 'r1', championshipId: 'champ-1', round: 1, teamAId: 't1', teamBId: 't2', scheduledDate: '2026-08-01T20:00', skipped: false },
      ],
      materializeRound: vi.fn(),
      deleteChampionship: vi.fn(),
    },
    sess: { teams: [], games: [], pointEvents: [], sessions: [] },
  }),
}));

describe('ChampionshipDetailView', () => {
  it('renders league detail header and standings table tab', () => {
    render(
      <BrowserRouter>
        <ChampionshipDetailView championshipId="champ-1" />
      </BrowserRouter>,
    );
    expect(screen.getByText('Liga de Ouro')).toBeTruthy();
    expect(screen.getByText('Águias')).toBeTruthy();
    expect(screen.getByText('Aproveit.')).toBeTruthy();
  });
});
