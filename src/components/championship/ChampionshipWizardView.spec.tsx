import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import { ChampionshipWizardView } from './ChampionshipWizardView';

vi.mock('../../app/shellContext', () => ({
  useShell: () => ({
    comm: {
      communities: [{ id: 'comm-1', name: 'Vôlei de Terça' }],
      members: [{ id: 'm1', communityId: 'comm-1', playerId: 'p1' }],
    },
    players: {
      players: [{ id: 'p1', nome: 'Ana Silva', apelido: 'Ana' }],
    },
    championships: {
      createChampionship: vi.fn(),
    },
  }),
}));

describe('ChampionshipWizardView', () => {
  it('renders step 1 form fields for basic info', () => {
    render(
      <BrowserRouter>
        <ChampionshipWizardView />
      </BrowserRouter>,
    );
    expect(screen.getByText('Criar Nova Liga')).toBeTruthy();
    expect(screen.getByPlaceholderText('Ex: Liga da Primavera 2026')).toBeTruthy();
  });
});
