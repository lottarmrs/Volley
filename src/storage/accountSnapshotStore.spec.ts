import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSnapshot } from '@app/accountUseCases';
import {
  clearAccountSnapshot,
  loadAccountSnapshot,
  saveAccountSnapshot,
} from './accountSnapshotStore';

const snapshot: AccountSnapshot = {
  state: 'ready',
  profile: {
    id: 'u1',
    name: 'Ana',
    email: 'ana@example.com',
    role: 'user',
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
  },
  playerId: 'p1',
  username: 'ana',
  requiresAal2: false,
};

describe('accountSnapshotStore', () => {
  beforeEach(() => localStorage.clear());

  it('guarda por conta e devolve igual', () => {
    saveAccountSnapshot('u1', snapshot);
    expect(loadAccountSnapshot('u1')).toEqual(snapshot);
    expect(loadAccountSnapshot('u2')).toBeNull();
    expect(localStorage.getItem('volley.conta.u1')).not.toBeNull();
  });

  it('limpa e ignora conteudo estragado', () => {
    localStorage.setItem('volley.conta.u1', '{nao e json');
    expect(loadAccountSnapshot('u1')).toBeNull();
    saveAccountSnapshot('u1', snapshot);
    clearAccountSnapshot('u1');
    expect(loadAccountSnapshot('u1')).toBeNull();
  });

  it('nao quebra quando o armazenamento recusa', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio');
    });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => saveAccountSnapshot('u1', snapshot)).not.toThrow();
    expect(loadAccountSnapshot('u1')).toBeNull();
    setItem.mockRestore();
    getItem.mockRestore();
  });
});
