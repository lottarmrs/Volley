import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Community } from '@shared/types';
import { loadCommunityCapabilities } from '@app/communityCapabilitiesUseCases';
import { useCommunitiesWithCapability } from './useCommunitiesWithCapability';

vi.mock('./useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isSupabaseConfigured: true }),
}));

vi.mock('@app/communityCapabilitiesUseCases', () => ({
  loadCommunityCapabilities: vi.fn(),
}));

const nuvemA = { id: 'a', name: 'A', cloudId: 'ca' } as Community;
const nuvemB = { id: 'b', name: 'B', cloudId: 'cb' } as Community;
const local = { id: 'l', name: 'L' } as Community;

describe('useCommunitiesWithCapability', () => {
  it('junta as comunidades onde o servidor da a capacidade e as locais pelo cargo', async () => {
    vi.mocked(loadCommunityCapabilities).mockImplementation(async (cloudId) => ({
      ok: true,
      value: cloudId === 'ca' ? ['session.manage'] : [],
    }));
    const { result } = renderHook(() =>
      useCommunitiesWithCapability([nuvemA, nuvemB, local], 'session.manage', () => true),
    );
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect([...result.current.allowedIds].sort()).toEqual(['a', 'l']);
  });

  it('comunidade local fica de fora quando o cargo nao deixa', async () => {
    vi.mocked(loadCommunityCapabilities).mockResolvedValue({ ok: true, value: [] });
    const { result } = renderHook(() =>
      useCommunitiesWithCapability([local], 'session.manage', () => false),
    );
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.allowedIds.size).toBe(0);
  });
});
