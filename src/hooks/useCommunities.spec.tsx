import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import type { Community } from '../types';
import { communityCloudService } from '../infra/supabase/communityCloudService';
import { fetchMyCommunities } from '../application/communityDataQueries';
import { useCommunities } from './useCommunities';

const conta = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    user: conta.userId ? { id: conta.userId } : null,
    isSupabaseConfigured: true,
  }),
}));

vi.mock('../application/communityDataQueries', () => ({
  fetchMyCommunities: vi.fn(),
}));

vi.mock('../infra/supabase/communityCloudService', () => ({
  communityCloudService: { upsert: vi.fn(), softDelete: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function render() {
  return renderHook(() => useCommunities(), { wrapper });
}

const now = '2026-01-01T12:00:00.000Z';

function community(id: string, name: string): Community {
  return {
    id,
    name,
    description: '',
    defaultLocation: '',
    defaultDay: '',
    defaultStartTime: '',
    defaultEndTime: '',
    defaultFormat: 'free_play',
    color: 'primary',
    icon: 'volleyball',
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe('useCommunities duplicate guard', () => {
  beforeEach(() => {
    localStorage.clear();
    conta.userId = null;
  });

  it('blocks renaming an active community to an existing semantic name', () => {
    localStorage.setItem(
      STORAGE_KEYS.communities,
      JSON.stringify([
        community('community-1', 'Terca do Volei'),
        community('community-2', 'Livre'),
      ]),
    );

    const { result } = render();

    let saved: boolean | undefined;
    act(() => {
      saved = result.current.updateCommunity('community-2', { name: ' Terça do Vôlei ' });
    });

    expect(saved).toBe(false);
    expect(result.current.communities.map((item) => item.name)).toEqual([
      'Terca do Volei',
      'Livre',
    ]);
    expect(result.current.validationErrors.name).toMatch(/j[aá] existe/i);
  });
  it('generates unique default names when adding communities directly', () => {
    localStorage.setItem(
      STORAGE_KEYS.communities,
      JSON.stringify([community('community-1', 'Nova comunidade')]),
    );

    const { result } = render();

    let created: Community | undefined;
    act(() => {
      created = result.current.addCommunity({});
    });

    expect(created?.name).toBe('Nova comunidade 2');
    expect(result.current.communities.map((item) => item.name)).toEqual([
      'Nova comunidade',
      'Nova comunidade 2',
    ]);
  });

  it('generates unique names when duplicating the same community repeatedly', () => {
    localStorage.setItem(
      STORAGE_KEYS.communities,
      JSON.stringify([
        community('community-1', 'Domingo'),
        community('community-2', 'Domingo (copia)'),
      ]),
    );

    const { result } = render();

    let firstDuplicate: ReturnType<typeof result.current.duplicateCommunity>;
    let secondDuplicate: ReturnType<typeof result.current.duplicateCommunity>;
    act(() => {
      firstDuplicate = result.current.duplicateCommunity('community-1', false);
    });
    act(() => {
      secondDuplicate = result.current.duplicateCommunity('community-1', false);
    });

    expect(firstDuplicate?.duplicate.name).toBe('Domingo (copia) 2');
    expect(secondDuplicate?.duplicate.name).toBe('Domingo (copia) 3');
    expect(result.current.communities.map((item) => item.name)).toEqual([
      'Domingo',
      'Domingo (copia)',
      'Domingo (copia) 2',
      'Domingo (copia) 3',
    ]);
  });
});

describe('useCommunities com conta', () => {
  beforeEach(() => {
    localStorage.clear();
    conta.userId = 'u1';
    vi.mocked(fetchMyCommunities).mockReset();
    vi.mocked(communityCloudService.upsert).mockReset();
    vi.mocked(communityCloudService.softDelete).mockReset();
  });

  it('le as comunidades do banco, nao do aparelho', async () => {
    localStorage.setItem(
      STORAGE_KEYS.communities,
      JSON.stringify([community('local', 'Do aparelho')]),
    );
    vi.mocked(fetchMyCommunities).mockResolvedValue([
      { ...community('c1', 'Do banco'), cloudId: 'n1' },
    ]);
    const { result } = render();
    expect(result.current.status.loading).toBe(true);
    await waitFor(() => expect(result.current.status.loading).toBe(false));
    expect(result.current.communities.map((item) => item.name)).toEqual(['Do banco']);
  });

  it('nova comunidade aparece antes da resposta e grava no banco', async () => {
    vi.mocked(fetchMyCommunities).mockResolvedValue([]);
    let responder: (value: Community) => void = () => {};
    vi.mocked(communityCloudService.upsert).mockImplementation(
      (local) =>
        new Promise((resolve) => {
          responder = () => resolve({ ...local, cloudId: 'n9' });
        }),
    );
    const { result } = render();
    await waitFor(() => expect(result.current.status.loading).toBe(false));
    let criada: Community | undefined;
    act(() => {
      criada = result.current.addCommunity({ name: 'Quinta' });
    });
    await waitFor(() =>
      expect(result.current.communities.map((item) => item.name)).toEqual(['Quinta']),
    );
    expect(communityCloudService.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: criada!.id, name: 'Quinta' }),
      'u1',
    );
    vi.mocked(fetchMyCommunities).mockResolvedValue([{ ...criada!, cloudId: 'n9' }]);
    await act(async () => responder(criada!));
    expect(localStorage.getItem(STORAGE_KEYS.communities)).toBeNull();
  });

  it('volta atras quando o banco recusa', async () => {
    vi.mocked(fetchMyCommunities).mockResolvedValue([]);
    vi.mocked(communityCloudService.upsert).mockRejectedValue({ code: '42501', message: 'nao' });
    const { result } = render();
    await waitFor(() => expect(result.current.status.loading).toBe(false));
    act(() => {
      result.current.addCommunity({ name: 'Quinta' });
    });
    await waitFor(() => expect(result.current.status.error?.kind).toBe('authorization'));
    expect(result.current.communities).toEqual([]);
  });

  it('sem conexao a gravacao nao acontece e o status diz', async () => {
    vi.mocked(fetchMyCommunities).mockResolvedValue([]);
    vi.mocked(communityCloudService.upsert).mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = render();
    await waitFor(() => expect(result.current.status.loading).toBe(false));
    act(() => {
      result.current.addCommunity({ name: 'Quinta' });
    });
    await waitFor(() => expect(result.current.status.offline).toBe(true));
    expect(result.current.status.error?.message).toBe(
      'Sem conexão. Tente de novo quando o sinal voltar.',
    );
    expect(result.current.communities).toEqual([]);
  });

  it('excluir apaga no banco pelo id da nuvem', async () => {
    vi.mocked(fetchMyCommunities).mockResolvedValue([
      { ...community('c1', 'Terca'), cloudId: 'n1' },
    ]);
    vi.mocked(communityCloudService.softDelete).mockResolvedValue();
    const { result } = render();
    await waitFor(() => expect(result.current.communities).toHaveLength(1));
    vi.mocked(fetchMyCommunities).mockResolvedValue([]);
    let apagou = false;
    await act(async () => {
      apagou = await result.current.deleteCommunity('c1');
    });
    expect(apagou).toBe(true);
    expect(communityCloudService.softDelete).toHaveBeenCalledWith('n1');
    expect(result.current.communities).toEqual([]);
  });
});
