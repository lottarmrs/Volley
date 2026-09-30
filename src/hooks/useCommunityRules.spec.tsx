import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import type { Community, CommunityRules } from '../types';
import { fetchMyCommunities, fetchRules } from '../application/communityDataQueries';
import { communityRulesCloudService } from '../infra/supabase/communityRulesCloudService';
import { createDefaultCommunityRules, useCommunityRules } from './useCommunityRules';

const conta = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    user: conta.userId ? { id: conta.userId } : null,
    isSupabaseConfigured: true,
  }),
}));

vi.mock('../application/communityDataQueries', () => ({
  fetchMyCommunities: vi.fn(),
  fetchRules: vi.fn(),
}));

vi.mock('../infra/supabase/communityRulesCloudService', () => ({
  communityRulesCloudService: { upsert: vi.fn() },
}));

const comunidade = {
  id: 'c1',
  cloudId: 'nc1',
  cloudOwnerId: 'dono',
  name: 'Terca',
} as Community;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function render() {
  return renderHook(() => useCommunityRules(), { wrapper });
}

function regras(maxPoints: number): CommunityRules {
  const base = createDefaultCommunityRules(comunidade);
  return { ...base, freePlay: { ...base.freePlay!, maxPoints } } as CommunityRules;
}

describe('useCommunityRules', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchMyCommunities).mockReset().mockResolvedValue([comunidade]);
    vi.mocked(fetchRules)
      .mockReset()
      .mockResolvedValue([regras(21)]);
    vi.mocked(communityRulesCloudService.upsert).mockReset();
  });

  it('sem conta, grava no aparelho', () => {
    conta.userId = null;
    const { result } = render();
    act(() => result.current.saveRules(regras(25)));
    const salvas = JSON.parse(localStorage.getItem(STORAGE_KEYS.communityRules)!);
    expect(salvas[0].freePlay.maxPoints).toBe(25);
  });

  it('com conta, le do banco pelas comunidades da pessoa', async () => {
    conta.userId = 'u1';
    const { result } = render();
    await waitFor(() => expect(result.current.rules).toHaveLength(1));
    expect(fetchRules).toHaveBeenCalledWith([comunidade]);
    expect(result.current.getRules(comunidade).freePlay?.maxPoints).toBe(21);
  });

  it('com conta, grava no banco com o dono e o id da comunidade', async () => {
    conta.userId = 'u1';
    vi.mocked(communityRulesCloudService.upsert).mockImplementation(async (rule) => rule);
    const { result } = render();
    await waitFor(() => expect(result.current.rules).toHaveLength(1));
    act(() => result.current.saveRules(regras(25)));
    await waitFor(() =>
      expect(communityRulesCloudService.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ communityId: 'c1' }),
        'dono',
        'nc1',
      ),
    );
  });

  it('com conta, volta atras quando o banco recusa', async () => {
    conta.userId = 'u1';
    vi.mocked(communityRulesCloudService.upsert).mockRejectedValue({
      code: '42501',
      message: 'nao',
    });
    const { result } = render();
    await waitFor(() => expect(result.current.rules).toHaveLength(1));
    act(() => result.current.saveRules(regras(25)));
    await waitFor(() => expect(result.current.status.error?.kind).toBe('authorization'));
    expect(result.current.getRules(comunidade).freePlay?.maxPoints).toBe(21);
  });
});
