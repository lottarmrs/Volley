import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthSessionState } from '@app/authSession';
import type { AuthClient } from '@app/authClient';
import type { Community, Player, Session } from '@shared/types';
import type { AuthSessionContextValue } from './auth/useAuthSession';
import { ToastProvider } from '@ui/common/ToastProvider';
import { SessionProvider } from '@ui/common/SessionProvider';

const { authSessionMock } = vi.hoisted(() => ({
  authSessionMock: { current: null as unknown as AuthSessionContextValue },
}));

vi.mock('./auth/useAuthSession', () => ({
  useAuthSession: () => authSessionMock.current,
}));

import { AppRouterV7 } from './AppRouterV7';

const stubAuthClient = {
  getSession: async () => null,
  onSessionChange: () => () => {},
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  linkGoogleIdentity: async () => {},
  requestPasswordRecovery: async () => {},
  updatePassword: async () => {},
  getAssuranceLevel: async () => ({ current: null, next: null }),
  signOut: async () => {},
  signOutOthers: async () => {},
  enrollTotp: async () => ({ factorId: '', qrCode: '', secret: '' }),
  verifyTotp: async () => {},
} as unknown as AuthClient;

export const readyState: AuthSessionState = {
  kind: 'ready',
  userId: 'u1',
  account: {
    state: 'ready',
    profile: {
      id: 'u1',
      name: 'Ana',
      email: 'ana@example.com',
      role: 'user',
      createdAt: '2026-07-22T00:00:00Z',
      updatedAt: '2026-07-22T00:00:00Z',
    },
    playerId: 'p1',
    username: 'ana',
    requiresAal2: false,
  },
};

export function seedLocalDb(input: {
  communities?: Partial<Community>[];
  players?: Partial<Player>[];
  sessions?: Partial<Session>[];
}) {
  localStorage.setItem(
    'vpg_communities',
    JSON.stringify(
      (input.communities ?? []).map((community) => ({
        id: 'c1',
        name: 'Panelinha',
        description: null,
        archived: false,
        defaultFormat: 'free_play',
        defaultDay: null,
        defaultStartTime: null,
        defaultEndTime: null,
        defaultLocation: null,
        ownerId: 'u1',
        recurrenceRule: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...community,
      })),
    ),
  );
  localStorage.setItem('vpg_players', JSON.stringify(input.players ?? []));
  localStorage.setItem('vpg_sessions', JSON.stringify(input.sessions ?? []));
}

afterEach(() => {
  localStorage.clear();
});

export function renderAppV7(path: string, state: AuthSessionState = readyState) {
  authSessionMock.current = {
    state,
    session: null,
    account: 'account' in state ? state.account : null,
    authClient: stubAuthClient,
    retry: vi.fn(),
    completeUsername: vi.fn(),
    signOut: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <SessionProvider>
          <AppRouterV7 />
        </SessionProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('AppRouterV7 — shell', () => {
  it('monta o shell e o painel em /painel', async () => {
    renderAppV7('/painel');
    expect(await screen.findByRole('heading', { name: /painel de controle/i })).toBeTruthy();
  });

  it('redireciona a raiz para /painel', async () => {
    renderAppV7('/');
    expect(await screen.findByRole('heading', { name: /painel de controle/i })).toBeTruthy();
  });

  it('manda rota desconhecida para /painel', async () => {
    renderAppV7('/rota-que-nao-existe');
    expect(await screen.findByRole('heading', { name: /painel de controle/i })).toBeTruthy();
  });

  it('mostra os itens globais da sidebar', async () => {
    renderAppV7('/painel');
    expect(await screen.findByRole('link', { name: /agenda/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /comunidades/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /meu perfil/i })).toBeTruthy();
  });

  it('não monta o app protegido quando a sessão não está pronta', () => {
    renderAppV7('/painel', { kind: 'onboarding', userId: 'u1', playerId: 'p1' });
    expect(screen.getByLabelText('Username')).toBeTruthy();
  });
});

describe('AppRouterV7 — rotas globais', () => {
  it('monta a lista de comunidades em /comunidades', async () => {
    renderAppV7('/comunidades');
    expect(await screen.findByText(COMMUNITY_LIST_MARKER)).toBeTruthy();
  });

  it('monta as configurações do usuário em /perfil', async () => {
    renderAppV7('/perfil');
    expect(await screen.findByRole('heading', { name: /backup/i })).toBeTruthy();
  });

  it('monta a sincronização em /perfil/sync', async () => {
    renderAppV7('/perfil/sync');
    expect(await screen.findByRole('heading', { name: /sincroniza|nuvem|conta/i })).toBeTruthy();
  });

  it('expulsa não-staff de /admin para /painel', async () => {
    renderAppV7('/admin');
    expect(await screen.findByRole('heading', { name: /painel de controle/i })).toBeTruthy();
  });

  it('deixa staff entrar em /admin', async () => {
    renderAppV7('/admin', {
      ...readyState,
      account: {
        ...readyState.account,
        profile: { ...readyState.account.profile, role: 'master' },
      },
    } as AuthSessionState);
    expect(await screen.findByRole('heading', { name: /gest[aã]o|administra/i })).toBeTruthy();
  });
});

const COMMUNITY_LIST_MARKER = /central local dos grupos recorrentes/i;

describe('AppRouterV7 — comunidade', () => {
  it('expulsa id inexistente para a lista de comunidades', async () => {
    renderAppV7('/comunidades/nao-existe');
    expect(await screen.findByText(COMMUNITY_LIST_MARKER)).toBeTruthy();
  });

  it('expulsa id inexistente também nas áreas internas', async () => {
    renderAppV7('/comunidades/nao-existe/pessoas');
    expect(await screen.findByText(COMMUNITY_LIST_MARKER)).toBeTruthy();
  });

  it('manda área inexistente de comunidade válida para a lista', async () => {
    seedLocalDb({ communities: [{ id: 'c1', name: 'Panelinha' }] });
    renderAppV7('/comunidades/c1/area-que-nao-existe');
    expect(await screen.findByText(COMMUNITY_LIST_MARKER)).toBeTruthy();
  });

  it('abre o detalhe da comunidade da URL', async () => {
    seedLocalDb({ communities: [{ id: 'c1', name: 'Panelinha' }] });
    renderAppV7('/comunidades/c1');
    expect((await screen.findByRole('tab', { name: 'Resumo' })).className).toContain('tab-active');
    expect(screen.queryByText(COMMUNITY_LIST_MARKER)).toBeNull();
  });

  it('abre a gestão da comunidade na aba Regras', async () => {
    seedLocalDb({ communities: [{ id: 'c1', name: 'Panelinha' }] });
    renderAppV7('/comunidades/c1/gestao');
    expect((await screen.findByRole('tab', { name: 'Regras' })).className).toContain('tab-active');
  });
});

describe('AppRouterV7 — agenda', () => {
  it('monta a agenda vazia em /agenda', async () => {
    renderAppV7('/agenda');
    expect(await screen.findByText(/nada agendado/i)).toBeTruthy();
  });
});

describe('AppRouterV7 — pessoas', () => {
  const community = { id: 'c1', name: 'Panelinha' };
  const player = {
    id: 'p1',
    nome: 'Ana Souza',
    apelido: 'Ana',
    genero: 'F',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    maoDominante: 'direita',
    atributos: {
      saque: 5,
      recepcao: 5,
      levantamento: 5,
      ataque: 5,
      bloqueio: 5,
      defesa: 5,
      velocidade: 5,
      resistencia: 5,
      leituraDeJogo: 5,
      regularidade: 5,
      controleEmocional: 5,
    },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    communityIds: ['c1'],
    metadata: { criadoEm: '2026-01-01T00:00:00.000Z', atualizadoEm: '2026-01-01T00:00:00.000Z' },
  } satisfies Partial<Player>;

  it('lista só os atletas da comunidade da URL', async () => {
    seedLocalDb({
      communities: [community],
      players: [player, { ...player, id: 'p2', nome: 'Bruno Lima', communityIds: ['c2'] }],
    });
    renderAppV7('/comunidades/c1/pessoas');
    expect(await screen.findByText(/ana souza/i)).toBeTruthy();
    expect(screen.queryByText(/bruno lima/i)).toBeNull();
  });

  it('abre o atleta da URL em modo edição', async () => {
    seedLocalDb({ communities: [community], players: [player] });
    renderAppV7('/comunidades/c1/pessoas/editar-atleta/p1');
    expect(await screen.findByDisplayValue('Ana Souza', {}, { timeout: 5000 })).toBeTruthy();
  });

  it('volta para a lista quando o atleta da URL não existe', async () => {
    seedLocalDb({ communities: [community], players: [player] });
    renderAppV7('/comunidades/c1/pessoas/editar-atleta/p-inexistente');
    expect(await screen.findByText(/ana souza/i)).toBeTruthy();
  });

  it('monta o formulário em branco para o atleta novo (sentinela "novo")', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/pessoas/editar-atleta/novo');
    const nomeInput = await screen.findByPlaceholderText('Nome Completo', {}, { timeout: 5000 });
    expect((nomeInput as HTMLInputElement).value).toBe('');
    expect((screen.getByPlaceholderText('Apelido') as HTMLInputElement).value).toBe('');
  });

  it('salvar no editor de atleta volta para a lista de Pessoas', async () => {
    seedLocalDb({ communities: [community], players: [player] });
    renderAppV7('/comunidades/c1/pessoas/editar-atleta/p1');
    await screen.findByDisplayValue('Ana Souza', {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: /salvar altera/i }));
    expect(await screen.findByText(/ana souza/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText('Nome Completo')).toBeNull();
  });
});

describe('AppRouterV7 — desempenho', () => {
  const community = { id: 'c1', name: 'Panelinha' };

  it('abre no Ranking por padrão', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/desempenho');
    expect((await screen.findByRole('tab', { name: 'Ranking' })).className).toContain('tab-active');
  });

  it('abre no Histórico quando a URL pede', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/desempenho?aba=historico');
    expect((await screen.findByRole('tab', { name: 'Histórico' })).className).toContain(
      'tab-active',
    );
  });

  it('?sessao= implica a aba Histórico mesmo sem ?aba=', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/desempenho?sessao=s1');
    expect((await screen.findByRole('tab', { name: 'Histórico' })).className).toContain(
      'tab-active',
    );
  });

  it('expulsa /desempenho de comunidade inexistente', async () => {
    renderAppV7('/comunidades/nao-existe/desempenho?aba=historico&sessao=s1');
    expect(await screen.findByText(COMMUNITY_LIST_MARKER)).toBeTruthy();
  });
});

describe('AppRouterV7 — sessões da comunidade', () => {
  const community = { id: 'c1', name: 'Panelinha' };
  const finished = {
    id: 's1',
    communityId: 'c1',
    name: 'Sessão de quarta',
    date: '2026-08-05',
    status: 'finished',
    type: 'free_play',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  } satisfies Partial<Session>;

  it('lista só as sessões da comunidade da URL', async () => {
    seedLocalDb({
      communities: [community],
      sessions: [finished, { ...finished, id: 's2', name: 'Sessão de outra', communityId: 'c2' }],
    });
    renderAppV7('/comunidades/c1/sessoes');
    expect(await screen.findByText(/sessão de quarta/i)).toBeTruthy();
    expect(screen.queryByText(/sessão de outra/i)).toBeNull();
  });

  it('abre o detalhe da sessão da URL', async () => {
    seedLocalDb({ communities: [community], sessions: [finished] });
    renderAppV7('/comunidades/c1/sessoes/s1');
    expect(await screen.findByText(/dados e regras/i, {}, { timeout: 5000 })).toBeTruthy();
  });

  it('monta os torneios da comunidade', async () => {
    seedLocalDb({ communities: [community], sessions: [{ ...finished, type: 'tournament' }] });
    renderAppV7('/comunidades/c1/sessoes/torneios');
    expect(await screen.findByText(/sessão de quarta/i)).toBeTruthy();
  });

  it('expulsa /sessoes de comunidade inexistente', async () => {
    renderAppV7('/comunidades/nao-existe/sessoes');
    expect(await screen.findByText(COMMUNITY_LIST_MARKER)).toBeTruthy();
  });
});

const WIZARD_MARKER = 'Ex: Vôlei de Domingo';
const SESSION_LIST_EMPTY_MARKER = /nenhuma sessão registrada ainda/i;
const DASHBOARD_MARKER = /bem-vindo ao panelinha/i;

function readActiveSession(): Session | null {
  return JSON.parse(localStorage.getItem('vpg_active_session') ?? 'null');
}

describe('AppRouterV7 — wizard e sessão ativa', () => {
  const community = { id: 'c1', name: 'Panelinha' };
  const orphanDraft = {
    id: 's-orfa',
    communityId: null,
    name: 'Rascunho órfão',
    date: '2026-08-12',
    status: 'draft',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  } satisfies Partial<Session>;

  it('abre o wizard e cria o rascunho já com a comunidade da URL', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/sessoes/nova');
    await screen.findByPlaceholderText(WIZARD_MARKER, {}, { timeout: 5000 });
    await waitFor(() => expect(readActiveSession()?.communityId).toBe('c1'));
  });

  it('adota o rascunho órfão em vez de criar uma segunda sessão', async () => {
    seedLocalDb({ communities: [community] });
    localStorage.setItem('vpg_active_session', JSON.stringify(orphanDraft));
    renderAppV7('/comunidades/c1/sessoes/nova');
    await screen.findByPlaceholderText(WIZARD_MARKER, {}, { timeout: 5000 });
    await waitFor(() => expect(readActiveSession()?.communityId).toBe('c1'));
    expect(readActiveSession()?.id).toBe('s-orfa');
  });

  it('manda /sessoes/ativa para a lista de sessões quando não há sessão em fase jogável', async () => {
    seedLocalDb({ communities: [community] });
    renderAppV7('/comunidades/c1/sessoes/ativa');
    expect(await screen.findByText(SESSION_LIST_EMPTY_MARKER, {}, { timeout: 5000 })).toBeTruthy();
  });

  it('manda /sessao/ativa para o painel quando não há sessão ativa', async () => {
    renderAppV7('/sessao/ativa');
    expect(await screen.findByText(DASHBOARD_MARKER, {}, { timeout: 5000 })).toBeTruthy();
  });
});
