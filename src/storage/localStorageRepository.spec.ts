import { beforeEach, describe, expect, it } from 'vitest';
import {
  LOCAL_CACHE_OWNER_KEY,
  getLocalCacheOwnerId,
  getOrCreateDeviceId,
  loadFromStorage,
  markLocalCacheOwner,
  removeFromStorage,
  clearLocalDomainCache,
  STORAGE_KEYS,
  saveToStorage,
  validateCacheOwner,
} from './localStorageRepository';

describe('localStorageRepository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('faz roundtrip de objeto com saveToStorage/loadFromStorage', () => {
    saveToStorage('vpg_spec_key', { players: ['p1'], count: 2 });
    expect(loadFromStorage('vpg_spec_key', null)).toEqual({ players: ['p1'], count: 2 });
  });

  it('retorna o fallback quando a chave não existe', () => {
    expect(loadFromStorage('vpg_spec_missing', 'fallback')).toBe('fallback');
    expect(loadFromStorage<string[]>('vpg_spec_missing', [])).toEqual([]);
  });

  it('retorna o fallback quando o JSON armazenado está corrompido', () => {
    localStorage.setItem('vpg_spec_bad', '{json quebrado');
    expect(loadFromStorage('vpg_spec_bad', 42)).toBe(42);
  });

  it('removeFromStorage apaga a chave', () => {
    saveToStorage('vpg_spec_key', 'valor');
    removeFromStorage('vpg_spec_key');
    expect(loadFromStorage('vpg_spec_key', 'apagado')).toBe('apagado');
  });

  it('marca e limpa o dono do cache local', () => {
    markLocalCacheOwner('user-1');
    expect(getLocalCacheOwnerId()).toBe('user-1');
    expect(localStorage.getItem(LOCAL_CACHE_OWNER_KEY)).toBe('user-1');

    markLocalCacheOwner(null);
    expect(getLocalCacheOwnerId()).toBeNull();
  });

  describe('cache partition', () => {
    it('clearLocalDomainCache apaga todo o dominio e preserva a versao de schema', () => {
      localStorage.setItem(STORAGE_KEYS.players, JSON.stringify([{ id: 'p1' }]));
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify([{ id: 's1' }]));
      localStorage.setItem('vpg_last_synced_at', '"2026-07-30T00:00:00Z"');
      localStorage.setItem('vpg_players_schema_version', '2');
      markLocalCacheOwner('user-a');

      clearLocalDomainCache();

      for (const key of Object.values(STORAGE_KEYS)) {
        expect(localStorage.getItem(key)).toBeNull();
      }
      expect(localStorage.getItem('vpg_last_synced_at')).toBeNull();
      // Preservados: os dados que chegam da nuvem ja estao na versao corrente, e
      // apagar a marca faria usePlayers re-migrar a escala de forma fisica.
      expect(localStorage.getItem('vpg_players_schema_version')).toBe('2');
      expect(getLocalCacheOwnerId()).toBe('user-a');
    });

    it('validateCacheOwner rejeita resultado de outro userId', () => {
      expect(validateCacheOwner('user-a', 'user-a')).toBe(true);
      expect(validateCacheOwner('user-a', 'user-b')).toBe(false);
      expect(validateCacheOwner('user-a', null)).toBe(true);
    });

    it('getLocalCacheOwnerId retorna o dono marcado no storage', () => {
      localStorage.setItem('vpg_cache_owner_id', 'user-x');
      expect(getLocalCacheOwnerId()).toBe('user-x');
    });

    it('getOrCreateDeviceId cria uma vez e devolve sempre o mesmo', () => {
      const primeiro = getOrCreateDeviceId();
      expect(primeiro).toMatch(/[0-9a-f-]{36}/i);
      expect(getOrCreateDeviceId()).toBe(primeiro);
    });

    it('o id do dispositivo sobrevive a troca de conta', () => {
      // clearLocalDomainCache varre STORAGE_KEYS. O aparelho nao muda porque o
      // usuario mudou, entao vpg_device_id NAO pode estar nessa lista.
      const antes = getOrCreateDeviceId();
      clearLocalDomainCache();
      expect(getOrCreateDeviceId()).toBe(antes);
    });
  });
});
