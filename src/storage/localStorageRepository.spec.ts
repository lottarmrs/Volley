import { beforeEach, describe, expect, it } from 'vitest';
import { loadFromStorage, removeFromStorage, saveToStorage } from './localStorageRepository';

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
});
