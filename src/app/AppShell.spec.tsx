import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppShell } from './AppShell';
import { ToastProvider } from '../ui/common/ToastProvider';
import { SessionProvider } from '../ui/common/SessionProvider';

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
    </ToastProvider>,
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
