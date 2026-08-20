import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import { ChampionshipDetailView } from './ChampionshipDetailView';

// A fabrica do mock devolve um objeto novo a cada chamada; sem hoistar os spies,
// o `useShell()` do teste enxerga instancias diferentes das que o componente usou.
const { spies } = vi.hoisted(() => ({
  spies: {
    createRequest: vi.fn(),
    resolveRequest: vi.fn(() => ({ ok: true, value: undefined })),
    rescheduleRound: vi.fn(() => ({ ok: true, value: undefined })),
  },
}));

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
        {
          id: 't1',
          championshipId: 'champ-1',
          name: 'Águias',
          playerIds: ['p1'],
          captainPlayerId: 'p1',
        },
        { id: 't2', championshipId: 'champ-1', name: 'Leões', playerIds: [] },
      ],
      championshipRounds: [
        {
          id: 'r1',
          championshipId: 'champ-1',
          round: 1,
          teamAId: 't1',
          teamBId: 't2',
          scheduledDate: '2026-08-01T20:00',
          skipped: false,
        },
      ],
      championshipRequests: [
        {
          id: 'req-1',
          championshipId: 'champ-1',
          kind: 'reschedule_round',
          status: 'pending',
          requestedByPlayerId: 'p1',
          requestedByTeamId: 't1',
          roundId: 'r1',
          proposedDate: '2026-09-02T20:00',
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
      ],
      ...spies,
      materializeRound: vi.fn(),
      deleteChampionship: vi.fn(),
    },
    sess: { teams: [], games: [], pointEvents: [], sessions: [] },
    auth: { user: { id: 'u1' } },
  }),
}));

describe('ChampionshipDetailView', () => {
  // Os spies sao hoistados e compartilhados: sem limpar, o `not.toHaveBeenCalled`
  // de um teste passa a depender da ordem de execucao dos outros.
  beforeEach(() => {
    spies.createRequest.mockClear();
    spies.resolveRequest.mockClear();
    spies.rescheduleRound.mockClear();
  });

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

  it('mostra a aba de governança com a solicitação pendente e suas ações', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <BrowserRouter>
        <ChampionshipDetailView championshipId="champ-1" />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /governança/i }));

    expect(screen.getByText('Aguardando adversário')).toBeTruthy();
    expect(screen.getByRole('button', { name: /adversário aceita/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /aprovar e remarcar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /recusar/i })).toBeTruthy();
  });

  it('aprovar remarca a rodada antes de encerrar a solicitação', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <BrowserRouter>
        <ChampionshipDetailView championshipId="champ-1" />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /governança/i }));
    await user.click(screen.getByRole('button', { name: /aprovar e remarcar/i }));

    expect(spies.rescheduleRound).toHaveBeenCalledWith('r1', '2026-09-02T20:00');
    expect(spies.resolveRequest).toHaveBeenCalled();
  });

  it('o formulário recusa um pedido sem rodada, equipe ou data', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <BrowserRouter>
        <ChampionshipDetailView championshipId="champ-1" />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /governança/i }));
    await user.click(screen.getByRole('button', { name: /registrar solicitação/i }));

    expect(screen.getByRole('alert').textContent).toMatch(/escolha a rodada/i);
    expect(spies.createRequest).not.toHaveBeenCalled();
  });

  it('preenchido, o formulário registra a solicitação de remarcação', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <BrowserRouter>
        <ChampionshipDetailView championshipId="champ-1" />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /governança/i }));
    await user.selectOptions(screen.getByLabelText(/^rodada$/i), 'r1');
    await user.selectOptions(screen.getByLabelText(/equipe solicitante/i), 't1');
    await user.type(screen.getByLabelText(/nova data/i), '2026-09-15T20:00');
    await user.click(screen.getByRole('button', { name: /registrar solicitação/i }));

    expect(spies.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        championshipId: 'champ-1',
        kind: 'reschedule_round',
        roundId: 'r1',
        requestedByTeamId: 't1',
      }),
    );
  });
});
