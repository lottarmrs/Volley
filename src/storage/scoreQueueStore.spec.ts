import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySessionBundle } from '@app/sessionDataQueries';
import { startScoreQueue } from '@app/scoreQueue';
import { clearScoreQueue, loadScoreQueue, saveScoreQueue } from './scoreQueueStore';

describe('scoreQueueStore', () => {
  beforeEach(() => localStorage.clear());

  it('guarda por conta e devolve igual', () => {
    const fila = startScoreQueue({ userId: 'u1', sessionId: 's1', base: emptySessionBundle() });
    saveScoreQueue(fila);
    expect(loadScoreQueue('u1')).toEqual(fila);
    expect(loadScoreQueue('u2')).toBeNull();
    expect(localStorage.getItem('volley.placar.u1')).not.toBeNull();
  });

  it('limpa e ignora conteudo estragado', () => {
    localStorage.setItem('volley.placar.u1', '{nao e json');
    expect(loadScoreQueue('u1')).toBeNull();
    saveScoreQueue(startScoreQueue({ userId: 'u1', sessionId: 's1', base: emptySessionBundle() }));
    clearScoreQueue('u1');
    expect(loadScoreQueue('u1')).toBeNull();
  });

  it('nao quebra quando o armazenamento recusa', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio');
    });
    expect(() =>
      saveScoreQueue(
        startScoreQueue({ userId: 'u1', sessionId: 's1', base: emptySessionBundle() }),
      ),
    ).not.toThrow();
    setItem.mockRestore();
  });
});
