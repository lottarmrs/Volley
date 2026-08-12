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
    account: null,
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
