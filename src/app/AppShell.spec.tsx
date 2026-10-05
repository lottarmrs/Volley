import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppShell } from './AppShell';
import { ToastProvider } from '../ui/common/ToastProvider';
import { SessionProvider } from '../ui/common/SessionProvider';
import { SessionContext, type SessionContextValue } from '../ui/common/useSession';
import { useSessions } from '../hooks/useSessions';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    account: null,
    isMaster: false,
    isSupabaseConfigured: false,
    state: { kind: 'anonymous' },
    signOut: vi.fn(),
  }),
}));

vi.mock('../hooks/useCloudSync', () => ({
  useCloudSync: () => ({
    cloudConfigured: false,
    syncStatus: 'idle',
    syncCloudData: vi.fn(),
    downloadFromCloud: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../hooks/useCommunities', () => ({
  useCommunities: () => ({
    communities: [],
    selectedCommunityId: null,
    addCommunity: vi.fn(),
  }),
}));

function renderAppShell(initialPath = '/painel') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <SessionProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/painel" element={<div>Conteudo do Painel</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('renders top navbar branding and navigation title', () => {
    renderAppShell('/painel');
    expect(screen.getAllByText('Panelinha').length).toBeGreaterThan(0);
    expect(screen.getByText('Conteudo do Painel')).toBeDefined();
  });

  it('displays login button for guest/anonymous sessions', () => {
    renderAppShell('/painel');
    const loginButton = screen.getByRole('link', { name: /entrar/i });
    expect(loginButton).toBeDefined();
    expect(loginButton.getAttribute('href')).toBe('/entrar');
  });
});

function SessaoComFila({
  children,
  scoreQueue,
}: {
  children: ReactNode;
  scoreQueue: SessionContextValue['scoreQueue'];
}) {
  const real = useSessions();
  return (
    <SessionContext.Provider value={{ ...real, scoreQueue }}>{children}</SessionContext.Provider>
  );
}

describe('AppShell com pontos guardados em conflito', () => {
  it('pergunta em qualquer tela e cada botao faz o que diz', () => {
    const scoreQueue = {
      pending: 4,
      queued: true,
      sending: false,
      conflict: { takenOverBy: 'Bia', foreignPoints: 3, myPoints: 4, sessionEnded: false },
      sendAnyway: vi.fn(),
      discard: vi.fn(),
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <SessaoComFila scoreQueue={scoreQueue}>
            <MemoryRouter initialEntries={['/painel']}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/painel" element={<div>Conteudo do Painel</div>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </SessaoComFila>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Conteudo do Painel')).toBeDefined();
    expect(screen.getByRole('dialog').textContent).toContain(
      'Enquanto você estava sem sinal, Bia assumiu o placar e marcou 3 pontos. Você tem 4 pontos guardados.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enviar os meus mesmo assim' }));
    expect(scoreQueue.sendAnyway).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar os meus' }));
    expect(scoreQueue.discard).toHaveBeenCalledTimes(1);
  });
});
