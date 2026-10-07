import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Community, Player } from '@shared/types';
import { makePlayer } from '../../test/fixtures';

const shell = vi.hoisted(() => ({ current: null as unknown as Record<string, unknown> }));
const vinculada = vi.hoisted(() => ({ player: null as Player | null }));
const estatisticas = vi.hoisted(() => ({ chamadas: [] as Player[][] }));

vi.mock('../shellContext', () => ({
  useShell: () => shell.current,
  useCommunityShell: () => shell.current,
}));
vi.mock('../auth/useAuthSession', () => ({ useAuthSession: () => ({ account: null }) }));
vi.mock('@hooks/useMyLinkedPlayer', () => ({
  useMyLinkedPlayer: () => ({
    linkedPlayer: vinculada.player,
    buscado: true,
    erro: false,
    tentarDeNovo: vi.fn(),
    setLinkedPlayer: vi.fn(),
  }),
}));
vi.mock('@hooks/useCardStatsForCommunities', () => ({
  useCardStatsForCommunities: (comunidades: Community[], jogadores: Player[]) => {
    estatisticas.chamadas.push(jogadores);
    return new Map(comunidades.map((c) => [c.id, new Map()]));
  },
}));
vi.mock('../../components/account/MyAthleteProfile', () => ({
  MyAthleteProfile: () => null,
}));

import { PerfilRoute } from './globalRoutes';

function comunidade(id: string, name: string): Community {
  return {
    id,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const COMUNIDADES = [
  comunidade('c-a', 'Alfa'),
  comunidade('c-b', 'Beta'),
  comunidade('c-g', 'Gama'),
];

const EU = makePlayer('eu', { userId: 'u1', communityIds: ['c-a', 'c-b', 'c-g'] });

function montarShell(players: Player[]) {
  shell.current = {
    auth: { user: { id: 'u1', email: 'eu@example.com' }, profile: null },
    play: { players, online: true, replacePlayer: vi.fn() },
    comm: { communities: COMUNIDADES },
    sess: {
      sessions: [],
      teams: [],
      games: [],
      pointEvents: [],
      sessionReports: [],
    },
  };
}

function Sonda() {
  const location = useLocation();
  const tipo = useNavigationType();
  return (
    <output data-testid="sonda">
      {location.pathname}
      {location.search}|{tipo}
    </output>
  );
}

function renderizar(entrada: string) {
  return render(
    <MemoryRouter initialEntries={[entrada]}>
      <PerfilRoute />
      <Sonda />
    </MemoryRouter>,
  );
}

const frente = async () =>
  (await screen.findByRole('heading', { level: 2, name: /^(Alfa|Beta|Gama)$/ }, { timeout: 10000 }))
    .textContent;
const sonda = () => screen.getByTestId('sonda').textContent;

describe('PerfilRoute: Minha carta', { timeout: 15000 }, () => {
  beforeEach(() => {
    vinculada.player = null;
    estatisticas.chamadas = [];
  });

  it('sem ?comunidade= mostra a primeira carta e nao escreve a URL', async () => {
    montarShell([EU]);
    renderizar('/perfil');
    expect(await frente()).toBe('Alfa');
    expect(sonda()).toBe('/perfil|POP');
  });

  it('?comunidade= mostra a carta pedida', async () => {
    montarShell([EU]);
    renderizar('/perfil?comunidade=c-b');
    expect(await frente()).toBe('Beta');
    expect(sonda()).toBe('/perfil?comunidade=c-b|POP');
  });

  it('?comunidade= desconhecida cai na primeira carta sem escrever a URL', async () => {
    montarShell([EU]);
    renderizar('/perfil?comunidade=nao-existe');
    expect(await frente()).toBe('Alfa');
    expect(sonda()).toBe('/perfil?comunidade=nao-existe|POP');
  });

  it('escolher outra carta troca a URL com replace', async () => {
    montarShell([EU]);
    renderizar('/perfil');
    await frente();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima carta' }));
    expect(await frente()).toBe('Beta');
    expect(sonda()).toBe('/perfil?comunidade=c-b|REPLACE');
  });

  it('atleta vinculado fora do elenco entra nos numeros e no historico', async () => {
    montarShell([makePlayer('outro', { communityIds: ['c-a'] })]);
    vinculada.player = EU;
    renderizar('/perfil');
    expect(await frente()).toBe('Alfa');
    const ultima = estatisticas.chamadas[estatisticas.chamadas.length - 1];
    expect(ultima.map((p) => p.id)).toEqual(['outro', 'eu']);
  });

  it('atleta ja no elenco: a lista de jogadores e a mesma do shell', async () => {
    const elenco = [EU];
    montarShell(elenco);
    renderizar('/perfil');
    await frente();
    expect(estatisticas.chamadas[estatisticas.chamadas.length - 1]).toBe(elenco);
  });
});
