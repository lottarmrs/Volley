import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { appOk } from '../../application/appResult';
import { makeGame, makePlayer, makeTeam } from '../../test/fixtures';
import type { Championship, ChampionshipRound, ChampionshipTeam, Community } from '../../types';
import { ChampionshipsTab } from './CommunitiesView';

const community: Community = {
  id: 'community-1',
  name: 'Vôlei de terça',
  description: '',
  defaultLocation: 'Ginásio',
  defaultDay: 'Terça',
  defaultStartTime: '20:00',
  defaultEndTime: '22:00',
  defaultFormat: 'free_play',
  color: 'primary',
  icon: 'volleyball',
  archived: false,
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
};

const championship: Championship = {
  id: 'champ-1',
  communityId: community.id,
  name: 'Liga de Inverno',
  format: 'round_robin',
  classificationPoints: { win: 3, loss: 0 },
  recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-04' },
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
};

const championshipTeams: ChampionshipTeam[] = [
  {
    id: 'champ-team-a',
    championshipId: championship.id,
    name: 'Aurora',
    playerIds: ['p1', 'p2'],
  },
  {
    id: 'champ-team-b',
    championshipId: championship.id,
    name: 'Boreal',
    playerIds: ['p3', 'p4'],
  },
];

const championshipRounds: ChampionshipRound[] = [
  {
    id: 'round-1',
    championshipId: championship.id,
    round: 1,
    teamAId: 'champ-team-a',
    teamBId: 'champ-team-b',
    scheduledDate: '2026-08-04T20:00',
    skipped: false,
    sessionId: 'session-1',
  },
];

const players = [
  makePlayer('p1', { nome: 'Ana', apelido: '' }),
  makePlayer('p2', { nome: 'Bia', apelido: '' }),
  makePlayer('p3', { nome: 'Caio', apelido: '' }),
  makePlayer('p4', { nome: 'Davi', apelido: '' }),
];

function renderTab(overrides: Partial<ComponentProps<typeof ChampionshipsTab>> = {}) {
  return render(
    <ChampionshipsTab
      community={community}
      players={players}
      games={[]}
      pointEvents={[]}
      sessionTeams={[]}
      championships={[]}
      championshipTeams={[]}
      championshipRounds={[]}
      canManage
      onCreateChampionship={() => appOk(undefined)}
      onMaterializeRound={() => appOk({ sessionId: 'session-new' })}
      {...overrides}
    />,
  );
}

describe('ChampionshipsTab', () => {
  it('renders league list, next round and current standings', () => {
    renderTab({
      championships: [championship],
      championshipTeams,
      championshipRounds,
      sessionTeams: [
        makeTeam('session-team-a', 'session-1', ['p1', 'p2'], {
          championshipTeamId: 'champ-team-a',
        }),
        makeTeam('session-team-b', 'session-1', ['p3', 'p4'], {
          championshipTeamId: 'champ-team-b',
        }),
      ],
      games: [
        makeGame('game-1', 'session-1', {
          teamAId: 'session-team-a',
          teamBId: 'session-team-b',
          winnerTeamId: 'session-team-a',
          loserTeamId: 'session-team-b',
          status: 'finished',
        }),
      ],
    });

    expect(screen.getByRole('heading', { name: 'Liga de Inverno' })).toBeTruthy();
    expect(screen.getByText(/04\/08\/2026.*20:00/)).toBeTruthy();
    const standings = screen.getByRole('table', { name: 'Classificação da Liga de Inverno' });
    expect(within(standings).getByText('Aurora')).toBeTruthy();
    expect(within(standings).getByText('Boreal')).toBeTruthy();
    expect(within(standings).getByText('3')).toBeTruthy();
  });

  it('submits the creation form with recurrence and assigned rosters', () => {
    const onCreateChampionship = vi.fn(() => appOk(undefined));
    renderTab({ onCreateChampionship });

    fireEvent.click(screen.getByRole('button', { name: 'Criar liga' }));
    fireEvent.change(screen.getByLabelText('Nome da liga'), {
      target: { value: 'Liga Primavera' },
    });
    fireEvent.change(screen.getByLabelText('Data inicial'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '19:30' } });
    fireEvent.click(screen.getByLabelText('Terça'));
    fireEvent.change(screen.getByLabelText('Nome do time 1'), {
      target: { value: 'Rubro' },
    });
    fireEvent.change(screen.getByLabelText('Nome do time 2'), {
      target: { value: 'Azul' },
    });
    fireEvent.click(screen.getByLabelText('Ana no time 1'));
    fireEvent.click(screen.getByLabelText('Bia no time 1'));
    fireEvent.click(screen.getByLabelText('Caio no time 2'));
    fireEvent.click(screen.getByLabelText('Davi no time 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar liga' }));

    expect(onCreateChampionship).toHaveBeenCalledWith({
      communityId: community.id,
      name: 'Liga Primavera',
      format: 'round_robin',
      classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
      recurrenceRule: {
        daysOfWeek: [2],
        time: '19:30',
        startDate: '2026-09-01',
        endDate: null,
      },
      teams: [
        { id: expect.any(String), name: 'Rubro', playerIds: ['p1', 'p2'] },
        { id: expect.any(String), name: 'Azul', playerIds: ['p3', 'p4'] },
      ],
    });
  });

  it('materializes an unmaterialized round through the supplied command', () => {
    const onMaterializeRound = vi.fn(() => appOk({ sessionId: 'session-new' }));
    renderTab({
      championships: [championship],
      championshipTeams,
      championshipRounds: [{ ...championshipRounds[0], sessionId: undefined }],
      onMaterializeRound,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Materializar rodada' }));

    expect(onMaterializeRound).toHaveBeenCalledWith('round-1');
    expect(screen.getByText('Rodada 1 materializada como sessão.')).toBeTruthy();
  });
});
