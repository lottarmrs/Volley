import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import { ChampionshipsHubView } from './ChampionshipsHubView';

vi.mock('../../app/shellContext', () => ({
  useShell: () => ({
    comm: { communities: [{ id: 'comm-1', name: 'Vôlei de Terça' }] },
    championships: {
      championships: [
        {
          id: 'champ-1',
          communityId: 'comm-1',
          name: 'Liga Primavera',
          format: 'round_robin',
          recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01' },
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      championshipTeams: [],
      championshipRounds: [],
    },
  }),
}));

describe('ChampionshipsHubView', () => {
  it('renders stats, community filter, and league cards', () => {
    render(
      <BrowserRouter>
        <ChampionshipsHubView />
      </BrowserRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Ligas de Vôlei' })).toBeTruthy();
    expect(screen.getByText('Liga Primavera')).toBeTruthy();
    expect(screen.getAllByText('Vôlei de Terça').length).toBeGreaterThan(0);
  });
});
