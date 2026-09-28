import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playerCloudService } from '@infra/supabase/playerCloudService';
import type { Player } from '../types';
import { useMyLinkedPlayer } from './useMyLinkedPlayer';

vi.mock('@infra/supabase/playerCloudService', () => ({
  playerCloudService: { fetchLinkedToUser: vi.fn() },
}));

const ficha = { id: 'p1', nome: 'Ana Souza' } as Player;

describe('useMyLinkedPlayer', () => {
  beforeEach(() => {
    vi.mocked(playerCloudService.fetchLinkedToUser).mockReset();
  });

  it('sem usuario ou com ficha local, nao busca e ja marca como concluido', () => {
    const { result } = renderHook(() => useMyLinkedPlayer(undefined, null));
    expect(result.current.buscado).toBe(true);
    expect(result.current.erro).toBe(false);
    expect(playerCloudService.fetchLinkedToUser).not.toHaveBeenCalled();
  });

  it('busca e devolve a ficha encontrada', async () => {
    vi.mocked(playerCloudService.fetchLinkedToUser).mockResolvedValue(ficha);
    const { result } = renderHook(() => useMyLinkedPlayer('u1', null));
    expect(result.current.buscado).toBe(false);
    await waitFor(() => expect(result.current.buscado).toBe(true));
    expect(result.current.linkedPlayer).toEqual(ficha);
    expect(result.current.erro).toBe(false);
  });

  it('a busca rejeitando marca erro e conclui, sem travar em carregando', async () => {
    vi.mocked(playerCloudService.fetchLinkedToUser).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useMyLinkedPlayer('u1', null));
    await waitFor(() => expect(result.current.buscado).toBe(true));
    expect(result.current.erro).toBe(true);
    expect(result.current.linkedPlayer).toBeNull();
  });

  it('tentarDeNovo refaz a busca', async () => {
    vi.mocked(playerCloudService.fetchLinkedToUser).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(playerCloudService.fetchLinkedToUser).mockResolvedValueOnce(ficha);
    const { result } = renderHook(() => useMyLinkedPlayer('u1', null));
    await waitFor(() => expect(result.current.erro).toBe(true));

    act(() => result.current.tentarDeNovo());

    await waitFor(() => expect(result.current.linkedPlayer).toEqual(ficha));
    expect(result.current.erro).toBe(false);
    expect(playerCloudService.fetchLinkedToUser).toHaveBeenCalledTimes(2);
  });
});
