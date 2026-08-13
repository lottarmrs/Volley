import { render, screen } from '@testing-library/react';
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
    expect(await screen.findByRole('heading', { name: /comunidades/i })).toBeTruthy();
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
});
