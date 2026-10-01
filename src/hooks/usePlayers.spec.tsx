import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import type { Community, Player } from '../types';
import { fetchMyCommunities, fetchRoster } from '../application/communityDataQueries';
import { playerCloudService } from '../infra/supabase/playerCloudService';
import { communityPlayerCloudService } from '../infra/supabase/communityPlayerCloudService';
import type { AthleteProfileDraft } from '../domain/athleteProfile';
import { usePlayers } from './usePlayers';

const conta = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    user: conta.userId ? { id: conta.userId } : null,
    isSupabaseConfigured: true,
  }),
}));

vi.mock('../application/communityDataQueries', () => ({
  fetchMyCommunities: vi.fn(),
  fetchRoster: vi.fn(),
}));

vi.mock('../infra/supabase/playerCloudService', () => ({
  playerCloudService: { upsert: vi.fn(), softDelete: vi.fn() },
}));

vi.mock('../infra/supabase/communityPlayerCloudService', () => ({
  communityPlayerCloudService: { linkPlayer: vi.fn() },
}));

const comunidade = { id: 'c1', cloudId: 'nc1', name: 'Terca' } as Community;

function atleta(id: string, nome: string, extra: Partial<Player> = {}): Player {
  return {
    id,
    nome,
    apelido: nome,
    ativo: true,
    communityIds: ['c1'],
    posicoesSecundarias: [],
    ...extra,
  } as Player;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function render() {
  return renderHook(() => usePlayers([], [], []), { wrapper });
}

function salvarConvidado(result: { current: ReturnType<typeof usePlayers> }, nome: string) {
  return result.current.saveGuestPlayer({
    playerId: null,
    nome,
    draft: {
      genero: 'F',
      posicaoPrincipal: 'ponteiro',
      alturaCm: 170,
      maoDominante: 'direita',
      apelido: nome,
      posicoesSecundarias: [],
    } as AthleteProfileDraft,
    communityId: 'c1',
    level: 3,
    canEdit: true,
    currentUserId: 'u1',
  });
}

describe('usePlayers sem conta', () => {
  beforeEach(() => {
    localStorage.clear();
    conta.userId = null;
  });

  it('le e grava no aparelho', () => {
    localStorage.setItem(STORAGE_KEYS.players, JSON.stringify([atleta('a1', 'Ana')]));
    const { result } = render();
    expect(result.current.players.map((player) => player.nome)).toEqual(['Ana']);
    act(() => {
      result.current.addPlayers([atleta('a2', 'Bia')]);
    });
    const salvos = JSON.parse(localStorage.getItem(STORAGE_KEYS.players)!);
    expect(salvos.map((player: Player) => player.nome)).toEqual(['Ana', 'Bia']);
  });
});

describe('usePlayers com conta', () => {
  beforeEach(() => {
    localStorage.clear();
    conta.userId = 'u1';
    vi.mocked(fetchMyCommunities).mockReset().mockResolvedValue([comunidade]);
    vi.mocked(fetchRoster)
      .mockReset()
      .mockResolvedValue([atleta('a1', 'Ana', { cloudId: 'n1' })]);
    vi.mocked(playerCloudService.upsert).mockReset();
    vi.mocked(playerCloudService.softDelete).mockReset();
    vi.mocked(communityPlayerCloudService.linkPlayer).mockReset();
  });

  it('le o elenco do banco com as comunidades da pessoa', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.players).toHaveLength(1));
    expect(fetchRoster).toHaveBeenCalledWith('u1', [comunidade]);
    expect(result.current.status.loading).toBe(false);
  });

  it('convidado novo aparece na hora, grava a ficha e o vinculo na comunidade', async () => {
    let responder: () => void = () => {};
    vi.mocked(playerCloudService.upsert).mockImplementation(
      (player) =>
        new Promise((resolve) => {
          responder = () => resolve({ ...player, cloudId: 'n2' });
        }),
    );
    const { result } = render();
    await waitFor(() => expect(result.current.players).toHaveLength(1));
    act(() => {
      salvarConvidado(result, 'Bia');
    });
    await waitFor(() =>
      expect(result.current.players.map((player) => player.nome)).toContain('Bia'),
    );
    await act(async () => responder());
    await waitFor(() =>
      expect(communityPlayerCloudService.linkPlayer).toHaveBeenCalledWith('nc1', 'n2', 'u1'),
    );
    expect(playerCloudService.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Bia' }),
      'u1',
    );
  });

  it('volta atras quando o banco recusa o convidado', async () => {
    vi.mocked(playerCloudService.upsert).mockRejectedValue({ code: '42501', message: 'nao' });
    const { result } = render();
    await waitFor(() => expect(result.current.players).toHaveLength(1));
    act(() => {
      salvarConvidado(result, 'Bia');
    });
    await waitFor(() => expect(result.current.status.error?.kind).toBe('authorization'));
    expect(result.current.players.map((player) => player.nome)).toEqual(['Ana']);
  });

  it('sem conexao a leitura avisa', async () => {
    vi.mocked(fetchRoster).mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = render();
    await waitFor(() => expect(result.current.status.offline).toBe(true));
    expect(result.current.players).toEqual([]);
  });

  it('progressao ignora a recusa de quem nao pode gravar', async () => {
    vi.mocked(fetchRoster).mockResolvedValue([
      atleta('a1', 'Ana', { cloudId: 'n1' }),
      atleta('a2', 'Bia', { cloudId: 'n2' }),
    ]);
    vi.mocked(playerCloudService.upsert).mockImplementation(async (player) => {
      if (player.id === 'a1') throw { code: '42501', message: 'nao' };
      return player;
    });
    const { result } = render();
    await waitFor(() => expect(result.current.players).toHaveLength(2));
    const atualizados = result.current.players.map((player) => ({ ...player, formaAtual: {} }));
    await act(async () => {
      await result.current.applyProgression(atualizados as Player[]);
    });
    expect(playerCloudService.upsert).toHaveBeenCalledTimes(2);
    expect(result.current.status.error).toBeNull();
  });

  it('adicionar e esperar devolve os atletas com o id da nuvem', async () => {
    vi.mocked(playerCloudService.upsert).mockImplementation(async (player) => ({
      ...player,
      cloudId: `nuvem-${player.id}`,
    }));
    const { result } = render();
    await waitFor(() => expect(result.current.players).toHaveLength(1));
    let resposta: Awaited<ReturnType<typeof result.current.addPlayersAndWait>> | undefined;
    await act(async () => {
      resposta = await result.current.addPlayersAndWait([
        atleta('a9', 'Zeca', { communityIds: ['c1'] }),
      ]);
    });
    expect(resposta?.ok && resposta.value.map((p) => p.cloudId)).toEqual(['nuvem-a9']);
    expect(communityPlayerCloudService.linkPlayer).toHaveBeenCalledWith('nc1', 'nuvem-a9', 'u1');
  });
});
