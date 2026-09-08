import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import { makePlayer } from '../test/fixtures';
import { usePlayers } from './usePlayers';

describe('usePlayers duplicate guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('blocks saving a new active player with the same semantic profile', () => {
    const existing = makePlayer('player-existing', {
      nome: 'Vitur',
      username: undefined,
      genero: 'M',
      posicaoPrincipal: 'oposto',
      alturaCm: 176,
    });
    localStorage.setItem(STORAGE_KEYS.players, JSON.stringify([existing]));
    localStorage.setItem('vpg_players_schema_version', '2');

    const { result } = renderHook(() => usePlayers([], [], []));

    act(() => {
      result.current.setEditingPlayer(
        makePlayer('player-new', {
          nome: ' vitur ',
          username: undefined,
          genero: 'M',
          posicaoPrincipal: 'oposto',
          alturaCm: 176,
        }),
      );
    });

    let saved = true;
    act(() => {
      saved = result.current.handleSavePlayer();
    });

    expect(saved).toBe(false);
    expect(result.current.players.map((player) => player.id)).toEqual(['player-existing']);
    expect(result.current.validationErrors.nome).toMatch(/j[aá] existe/i);
  });
});

describe('usePlayers handleSavePlayer communityId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('threads the caller-supplied communityId through to the saved player instead of guessing', () => {
    const { result } = renderHook(() => usePlayers([], [], []));

    act(() => {
      result.current.setEditingPlayer(
        makePlayer('player-new', {
          nome: 'Bia',
          communityIds: ['community-a', 'community-b'],
        }),
      );
    });

    act(() => {
      result.current.handleSavePlayer(undefined, 'community-b');
    });

    const saved = result.current.players.find((p) => p.id === 'player-new');
    expect(saved?.evaluationCommunityId).toBe('community-b');
  });

  it('falls back to an empty communityId (no evaluation to sync) when none is supplied', () => {
    const { result } = renderHook(() => usePlayers([], [], []));

    act(() => {
      result.current.setEditingPlayer(
        makePlayer('player-new', { nome: 'Caio', communityIds: ['community-a'] }),
      );
    });

    act(() => {
      result.current.handleSavePlayer();
    });

    const saved = result.current.players.find((p) => p.id === 'player-new');
    expect(saved?.evaluationCommunityId).toBe('');
  });

  it('can save a cloud profile without changing the technical evaluation source', () => {
    const seed = makePlayer('seed');
    const original = makePlayer('player-cloud', {
      nome: 'Ana',
      cloudId: 'cloud-player',
      atributos: { ...seed.atributos, saque: 4 },
      personalAttributes: { ...seed.atributos, saque: 4 },
      evaluationCommunityId: 'community-a',
      evaluationAggregate: {
        attributes: seed.atributos,
        evaluatorCount: 2,
        includedValueCount: 22,
        outlierValueCount: 0,
      },
    });
    localStorage.setItem(STORAGE_KEYS.players, JSON.stringify([original]));
    const { result } = renderHook(() => usePlayers([], [], []));
    act(() =>
      result.current.setEditingPlayer({
        ...result.current.players[0],
        nome: 'Ana atualizada',
        atributos: { ...result.current.players[0].atributos, saque: 9 },
      }),
    );
    act(() =>
      result.current.handleSavePlayer(
        { canEditPlayerProfile: true, canEvaluatePlayer: false },
        'community-a',
        false,
      ),
    );
    const saved = result.current.players[0];
    expect(saved.nome).toBe('Ana atualizada');
    expect(saved.atributos.saque).toBe(4);
    expect(saved.evaluationCommunityId).toBeUndefined();
  });
});
