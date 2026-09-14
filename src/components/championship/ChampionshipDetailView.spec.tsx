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
    materializeChampionshipRound: vi.fn(() => ({ ok: true, value: { sessionId: 's-new' } })),
    openChampionshipRoundSession: vi.fn(() => ({ ok: true, value: undefined })),
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
        {
          id: 'r2',
          championshipId: 'champ-1',
          round: 1,
          teamAId: 't1',
          teamBId: 't2',
          scheduledDate: '2026-08-02T20:00',
          skipped: false,
          sessionId: 's-live',
        },
        {
          id: 'r3',
          championshipId: 'champ-1',
          round: 1,
          teamAId: 't2',
          teamBId: 't1',
          scheduledDate: '2026-08-03T20:00',
          skipped: false,
          sessionId: 's-done',
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
      createRequest: spies.createRequest,
      resolveRequest: spies.resolveRequest,
      rescheduleRound: spies.rescheduleRound,
      materializeRound: vi.fn(),
      deleteChampionship: vi.fn(),
    },
    sess: {
      teams: [],
      games: [],
      pointEvents: [],
      sessions: [
        { id: 's-live', communityId: 'comm-1', status: 'active' },
        { id: 's-done', communityId: 'comm-1', status: 'finished' },
      ],
    },
    auth: { user: { id: 'u1' } },
    materializeChampionshipRound: spies.materializeChampionshipRound,
    openChampionshipRoundSession: spies.openChampionshipRoundSession,
    deleteChampionshipAggregate: vi.fn(),
  }),
}));

describe('ChampionshipDetailView', () => {
  // Os spies sao hoistados e compartilhados: sem limpar, o `not.toHaveBeenCalled`
  // de um teste passa a depender da ordem de execucao dos outros.
  beforeEach(() => {
    spies.createRequest.mockClear();
    spies.resolveRequest.mockClear();
    spies.rescheduleRound.mockClear();
    spies.materializeChampionshipRound.mockClear();
    spies.openChampionshipRoundSession.mockClear();
    window.history.pushState({}, '', '/');
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

  it('mostra o estado real de cada rodada: agendada, em andamento e realizada', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <BrowserRouter>
        <ChampionshipDetailView championshipId="champ-1" />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /calendário de rodadas/i }));

    expect(screen.getAllByText('Agendado')).toHaveLength(1);
    expect(screen.getAllByText('Em andamento')).toHaveLength(1);
    expect(screen.getAllByText('Realizado')).toHaveLength(1);
  });

  it('materializar pede a sessão ao shell e mostra a recusa sem sair da liga', async () => {
    spies.materializeChampionshipRound.mockReturnValueOnce({
      ok: false,
      error: {
        kind: 'product',
        code: 'conflict',
        message: 'Já existe uma sessão em andamento. Encerre-a antes de jogar esta rodada.',
        recoverable: false,
      },
    } as never);
    const user = userEvent.setup({ delay: null });
    render(
      <BrowserRouter>
        <ChampionshipDetailView championshipId="champ-1" />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /calendário de rodadas/i }));
    await user.click(screen.getByRole('button', { name: /materializar & jogar/i }));

    expect(spies.materializeChampionshipRound).toHaveBeenCalledWith('r1');
    expect(screen.getByRole('alert').textContent).toMatch(/já existe uma sessão em andamento/i);
  });

  it('materializar com sucesso não abre o histórico da sessão', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <BrowserRouter>
        <ChampionshipDetailView championshipId="champ-1" />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /calendário de rodadas/i }));
    await user.click(screen.getByRole('button', { name: /materializar & jogar/i }));

    expect(spies.materializeChampionshipRound).toHaveBeenCalledWith('r1');
    expect(window.location.pathname).not.toMatch(/\/sessoes\//);
  });

  it('ver sessão abre a sessão da rodada pelo shell', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <BrowserRouter>
        <ChampionshipDetailView championshipId="champ-1" />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: /calendário de rodadas/i }));
    await user.click(screen.getAllByRole('button', { name: /ver sessão/i })[0]);

    expect(spies.openChampionshipRoundSession).toHaveBeenCalledWith('r2');
    expect(window.location.pathname).not.toMatch(/\/sessoes\//);
  });
});
