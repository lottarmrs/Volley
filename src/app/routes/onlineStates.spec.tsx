import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({
  current: null as unknown as Record<string, unknown>,
}));

vi.mock('../shellContext', () => ({
  useShell: () => shell.current,
  useCommunityShell: () => shell.current,
}));

vi.mock('../auth/useAuthSession', () => ({
  useAuthSession: () => ({ state: { kind: 'ready' } }),
}));

vi.mock('@hooks/useCommunitiesWithCapability', () => ({
  useCommunitiesWithCapability: () => ({ allowedIds: new Set(), pending: false }),
}));

import { PainelRoute } from './globalRoutes';
import { CommunityShell } from './communityRoutes';

const refresh = vi.fn();
const refreshRoster = vi.fn();
const refreshRules = vi.fn();

function montarShell(opcoes: { loading?: boolean; readError?: unknown }) {
  const status = {
    loading: !!opcoes.loading,
    error: opcoes.readError ?? null,
    readError: opcoes.readError ?? null,
    offline: false,
  };
  shell.current = {
    comm: { communities: [], status, refresh },
    play: { players: [], status, refreshRoster },
    communityRules: { status: { ...status, loading: false }, refresh: refreshRules },
    sess: { activeSession: null },
    wizard: {},
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/painel" element={<PainelRoute />} />
        <Route path="/comunidades/:communityId" element={<CommunityShell />} />
        <Route path="/comecar" element={<p>Comecar</p>} />
        <Route path="/comunidades" element={<p>Lista</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('estados online nas rotas', () => {
  beforeEach(() => {
    refresh.mockReset();
    refreshRoster.mockReset();
    refreshRules.mockReset();
  });

  it('o painel espera o banco antes de decidir que a pessoa nao tem nada', () => {
    montarShell({ loading: true });
    renderAt('/painel');
    expect(screen.getByRole('status').textContent).toMatch(/carregando seu painel/i);
    expect(screen.queryByText('Comecar')).toBeNull();
  });

  it('a comunidade espera a lista chegar em vez de mandar para /comunidades', () => {
    montarShell({ loading: true });
    renderAt('/comunidades/c1');
    expect(screen.getByRole('status').textContent).toMatch(/carregando comunidades/i);
    expect(screen.queryByText('Lista')).toBeNull();
  });

  it('sem conexao, a comunidade mostra a faixa e tentar de novo rele tudo', () => {
    montarShell({
      readError: {
        kind: 'offline_unavailable',
        message: 'Sem conexão. Tente de novo quando o sinal voltar.',
        recoverable: true,
      },
    });
    renderAt('/comunidades/c1');
    expect(screen.getByRole('alert').textContent).toContain(
      'Sem conexão. Tente de novo quando o sinal voltar.',
    );
    expect(screen.queryByText('Lista')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(refresh).toHaveBeenCalled();
    expect(refreshRoster).toHaveBeenCalled();
    expect(refreshRules).toHaveBeenCalled();
  });

  it('erro que nao e de rede pede para tentar de novo sem culpar o sinal', () => {
    montarShell({
      readError: { kind: 'unexpected', message: 'x', correlationId: '1', recoverable: true },
    });
    renderAt('/comunidades/c1');
    expect(screen.getByRole('alert').textContent).toContain('Não deu para carregar.');
  });
});
