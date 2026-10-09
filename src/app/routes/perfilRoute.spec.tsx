import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Community, Player } from '@shared/types';
import { makePlayer } from '../../test/fixtures';

const shell = vi.hoisted(() => ({ current: null as unknown as Record<string, unknown> }));
const vinculada = vi.hoisted(() => ({ player: null as Player | null, buscado: true, erro: false }));
const estatisticas = vi.hoisted(() => ({ chamadas: [] as Player[][] }));

vi.mock('../shellContext', () => ({
  useShell: () => shell.current,
  useCommunityShell: () => shell.current,
}));
vi.mock('../auth/useAuthSession', () => ({ useAuthSession: () => ({ account: null }) }));
vi.mock('@hooks/useMyLinkedPlayer', () => ({
  useMyLinkedPlayer: () => ({
    linkedPlayer: vinculada.player,
    buscado: vinculada.buscado,
    erro: vinculada.erro,
    tentarDeNovo: vi.fn(),
    setLinkedPlayer: vi.fn(),
  }),
}));
vi.mock('@hooks/useCardStatsForCommunities', () => ({
  useCardStatsForCommunities: (comunidades: Community[], jogadores: Player[]) => {
    estatisticas.chamadas.push(jogadores);
    return {
      valores: new Map(comunidades.map((c) => [c.id, new Map()])),
      erros: new Set<string>(),
      tentarDeNovo: vi.fn(),
    };
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

const ERRO = { kind: 'technical', code: 'technical_error', message: 'falhou', recoverable: true };
const PRONTO = { loading: false, readError: null };

function montarShell(
  players: Player[],
  carregando: { comm?: boolean; play?: boolean; sess?: boolean } = {},
  communities: Community[] = COMUNIDADES,
  falhas: { comm?: boolean; play?: boolean; sess?: boolean } = {},
) {
  shell.current = {
    auth: { user: { id: 'u1', email: 'eu@example.com' }, profile: null },
    play: {
      players,
      online: true,
      replacePlayer: vi.fn(),
      refreshRoster: vi.fn(),
      status: { ...PRONTO, loading: !!carregando.play, readError: falhas.play ? ERRO : null },
    },
    comm: {
      communities,
      refresh: vi.fn(),
      status: {
        ...PRONTO,
        loading: !!carregando.comm,
        readError: falhas.comm ? ERRO : null,
      },
    },
    communityRules: { status: PRONTO, refresh: vi.fn() },
    sess: {
      refresh: vi.fn(),
      status: { ...PRONTO, loading: !!carregando.sess, readError: falhas.sess ? ERRO : null },
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
    <output data-testid="sonda" data-chave={location.key}>
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
    vinculada.buscado = true;
    vinculada.erro = false;
    estatisticas.chamadas = [];
    Element.prototype.scrollIntoView = vi.fn();
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

  it('Ver perfil de atleta empilha ?vista=atleta e mostra o painel', async () => {
    montarShell([EU]);
    renderizar('/perfil?comunidade=c-b');
    await frente();
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de atleta' }));
    expect(await screen.findByRole('region', { name: 'Perfil de atleta' })).toBeTruthy();
    expect(sonda()).toBe('/perfil?comunidade=c-b&vista=atleta|PUSH');
    expect(screen.queryByRole('region', { name: 'Minha carta' })).toBeNull();
  });

  it('trocar de vista leva o foco ao titulo da nova vista e rola ate ela', async () => {
    montarShell([EU]);
    renderizar('/perfil?comunidade=c-b');
    await frente();
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de atleta' }));
    const painel = await screen.findByRole('region', { name: 'Perfil de atleta' });
    expect(document.activeElement).toBe(painel.querySelector('h2'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar minha carta' }));
    await frente();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Beta' }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('abrir o perfil e voltar pelo botao deixa o historico como antes de abrir', async () => {
    montarShell([EU]);
    renderizar('/perfil?comunidade=c-b');
    await frente();
    const antes = screen.getByTestId('sonda').getAttribute('data-chave');
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de atleta' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar minha carta' }));
    expect(await frente()).toBe('Beta');
    expect(sonda()).toBe('/perfil?comunidade=c-b|POP');
    expect(screen.getByTestId('sonda').getAttribute('data-chave')).toBe(antes);
  });

  it('Mostrar minha carta sem ter vindo do leque volta com replace', async () => {
    montarShell([EU]);
    renderizar('/perfil?comunidade=c-b&vista=atleta');
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar minha carta' }));
    expect(await frente()).toBe('Beta');
    expect(sonda()).toBe('/perfil?comunidade=c-b|REPLACE');
    expect(screen.queryByRole('region', { name: 'Perfil de atleta' })).toBeNull();
  });

  it('?vista=atleta direto abre o painel da carta pedida', async () => {
    montarShell([EU]);
    renderizar('/perfil?comunidade=c-g&vista=atleta');
    const regiao = await screen.findByRole('region', { name: 'Perfil de atleta' });
    expect(regiao.textContent).toContain('Gama');
    expect(sonda()).toBe('/perfil?comunidade=c-g&vista=atleta|POP');
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

  for (const [nome, carregando] of [
    ['sessoes', { sess: true }],
    ['comunidades', { comm: true }],
    ['elenco', { play: true }],
  ] as const) {
    it(`${nome} carregando: esqueleto ocupado, sem texto de vazio e sem numero`, async () => {
      montarShell([EU], carregando);
      renderizar('/perfil');
      const regiao = await screen.findByRole('region', { name: 'Minha carta' });
      expect(regiao.getAttribute('aria-busy')).toBe('true');
      expect(screen.queryByText(/Sua carta nasce/)).toBeNull();
      expect(screen.queryByText(/ainda sem pelada/)).toBeNull();
      expect(regiao.textContent).not.toMatch(/\d/);
    });
  }

  it('ficha ainda nao buscada: esqueleto, nao "Sua carta nasce"', async () => {
    montarShell([]);
    vinculada.buscado = false;
    renderizar('/perfil');
    const regiao = await screen.findByRole('region', { name: 'Minha carta' });
    expect(regiao.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText(/Sua carta nasce/)).toBeNull();
  });

  it('carregando com ?vista=atleta: o painel espera', async () => {
    montarShell([EU], { sess: true });
    renderizar('/perfil?comunidade=c-b&vista=atleta');
    const regiao = await screen.findByRole('region', { name: 'Minha carta' });
    expect(regiao.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('region', { name: 'Perfil de atleta' })).toBeNull();
  });

  it('membro sem ficha no elenco: a carta nasce quando a ficha estiver no elenco', async () => {
    montarShell([]);
    renderizar('/perfil');
    expect(
      await screen.findByText(
        'Sua carta nasce quando sua ficha estiver no elenco de uma comunidade',
      ),
    ).toBeTruthy();
  });

  it('sem comunidade: a carta nasce quando entra numa comunidade', async () => {
    montarShell([], {}, []);
    renderizar('/perfil');
    expect(
      await screen.findByText('Sua carta nasce quando você entra numa comunidade'),
    ).toBeTruthy();
  });

  it('leitura de comunidades falhou: mostra o erro com retry e nao afirma nada', async () => {
    montarShell([EU], {}, [], { comm: true });
    renderizar('/perfil');
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    expect(screen.getByText('Não deu para carregar. Tente de novo.')).toBeTruthy();
    expect(screen.queryByText(/Sua carta nasce/)).toBeNull();
    expect(screen.queryByText(/ainda sem pelada/)).toBeNull();
    expect(screen.queryByText(/Peladas/)).toBeNull();
  });

  it('leitura de peladas falhou: mostra o erro e nenhuma carta zerada', async () => {
    montarShell([EU], {}, COMUNIDADES, { sess: true });
    renderizar('/perfil');
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Alfa' })).toBeNull();
    expect(screen.queryByText(/ainda sem pelada/)).toBeNull();
    expect(screen.queryByText(/Sua carta nasce/)).toBeNull();
  });

  it('leitura do elenco falhou com ?vista=atleta: nada de painel zerado', async () => {
    montarShell([EU], {}, COMUNIDADES, { play: true });
    renderizar('/perfil?comunidade=c-b&vista=atleta');
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Perfil de atleta' })).toBeNull();
    expect(screen.queryByText(/Sua carta nasce/)).toBeNull();
  });

  it('busca da ficha falhou: o deck nao diz "Sua carta nasce" e o erro da ficha aparece', async () => {
    montarShell([]);
    vinculada.erro = true;
    renderizar('/perfil');
    expect(await screen.findByText('Não foi possível carregar sua ficha.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    expect(screen.queryByText(/Sua carta nasce/)).toBeNull();
  });
});
