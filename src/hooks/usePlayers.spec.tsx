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
