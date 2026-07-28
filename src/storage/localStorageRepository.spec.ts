import { beforeEach, describe, expect, it } from 'vitest';
import {
  LOCAL_CACHE_OWNER_KEY,
  getLocalCacheOwnerId,
  loadFromStorage,
  markLocalCacheOwner,
  removeFromStorage,
  resolveCacheKey,
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
    it('resolveCacheKey produz vpg_cache_<userId>_<communityId>_<entityKind>', () => {
      expect(resolveCacheKey('user-a', 'comm-1', 'sessions')).toBe('vpg_cache_user-a_comm-1_sessions');
      expect(resolveCacheKey('user-a', '', 'players')).toBe('vpg_cache_user-a__players');
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
  });
});
