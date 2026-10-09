import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './AppShell';
import { ToastProvider } from '../ui/common/ToastProvider';
import { SessionProvider } from '../ui/common/SessionProvider';
import { SessionContext, type SessionContextValue } from '../ui/common/useSession';
import { useSessions } from '../hooks/useSessions';
import { buildVutCard } from '@logic/futCards';
import type { AthleteNight } from '@app/athleteNight';
import type { Player } from '@shared/types';

const nightState = {
  night: null as AthleteNight | null,
  communityName: 'Vôlei de Terça',
  communityId: 'c1',
  sessionDate: '2026-10-04',
  markSeen: vi.fn(),
  dismiss: vi.fn(),
};
vi.mock('../hooks/useAthleteNight', () => ({ useAthleteNight: () => nightState }));

const atleta = {
  id: 'ana',
  nome: 'Ana Souza',
  apelido: 'Ana',
  posicaoPrincipal: 'ponteiro',
  maoDominante: 'direita',
  atributos: {},
  formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
  status: { lesionado: false, limitacaoFisica: null },
} as unknown as Player;

const NOITE_DE_EXEMPLO: AthleteNight = {
  sessionId: 's1',
  card: buildVutCard(atleta, {
    sessions: [],
    teams: [],
    games: [],
    pointEvents: [],
    players: [atleta],
    sessionReports: [],
  }),
  specialEdition: false,
  newAchievements: [],
  nearAchievements: [],
  tierUp: false,
  games: 4,
  wins: 3,
  points: 12,
  rating: 7.4,
};

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

function LocalizacaoAtual() {
  const location = useLocation();
  return <div data-testid="rota">{`${location.pathname}${location.search}`}</div>;
}

function renderAppShell(initialPath = '/painel') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <SessionProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/painel" element={<div>Conteudo do Painel</div>} />
                <Route path="/perfil" element={<LocalizacaoAtual />} />
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

describe('AppShell com a noite do atleta', () => {
  it('sem noite, nada aparece', () => {
    nightState.night = null;
    renderAppShell('/painel');
    expect(screen.queryByRole('dialog', { name: 'Sua noite' })).toBeNull();
    expect(screen.getByText('Conteudo do Painel').closest('[inert]')).toBeNull();
  });

  it('com noite, aparece em qualquer tela, o resto fica inerte e abrir marca como vista', () => {
    nightState.night = NOITE_DE_EXEMPLO;
    nightState.markSeen.mockClear();
    renderAppShell('/painel');
    expect(screen.getByRole('dialog', { name: 'Sua noite' })).toBeDefined();
    expect(screen.getByText('Conteudo do Painel').closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Sua noite' }).closest('[inert]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /abrir/i }));
    expect(nightState.markSeen).toHaveBeenCalledTimes(1);
  });

  it('ver minha carta fecha a noite e abre o perfil na comunidade da noite', () => {
    nightState.night = NOITE_DE_EXEMPLO;
    nightState.dismiss.mockClear();
    renderAppShell('/painel');
    fireEvent.click(screen.getByRole('button', { name: /abrir/i }));
    fireEvent.click(screen.getByRole('button', { name: /pular/i }));
    fireEvent.click(screen.getByRole('button', { name: /ver minha carta/i }));
    expect(nightState.dismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('rota').textContent).toBe('/perfil?comunidade=c1');
  });
});
