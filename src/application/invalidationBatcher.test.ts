import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvalidationBatcher } from './invalidationBatcher';

function relogio() {
  let agora = 0;
  let proximo = 1;
  const pendentes = new Map<number, { quando: number; fn: () => void }>();
  return {
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        const id = proximo++;
        pendentes.set(id, { quando: agora + ms, fn });
        return id;
      },
      clearTimeout: (id: number) => void pendentes.delete(id),
    },
    andar(ms: number) {
      agora += ms;
      for (const [id, t] of [...pendentes]) {
        if (t.quando <= agora) {
          pendentes.delete(id);
          t.fn();
        }
      }
    },
  };
}

test('varios avisos seguidos viram uma releitura por chave', () => {
  const r = relogio();
  const lidas: string[][] = [];
  const lote = createInvalidationBatcher((keys) => lidas.push(keys.map((k) => k.join('/'))), {
    delayMs: 500,
    maxWaitMs: 2000,
    timers: r.timers,
  });
  lote.add([['peladas', 'u1']]);
  r.andar(200);
  lote.add([
    ['peladas', 'u1'],
    ['atletas', 'u1'],
  ]);
  r.andar(200);
  lote.add([['peladas', 'u1']]);
  assert.deepEqual(lidas, []);
  r.andar(500);
  assert.deepEqual(lidas, [['peladas/u1', 'atletas/u1']]);
});

test('aviso sem pausa nao adia para sempre: o teto forca a releitura', () => {
  const r = relogio();
  let vezes = 0;
  const lote = createInvalidationBatcher(() => (vezes += 1), {
    delayMs: 500,
    maxWaitMs: 1200,
    timers: r.timers,
  });
  for (let i = 0; i < 10; i++) {
    lote.add([['peladas', 'u1']]);
    r.andar(300);
  }
  assert.ok(vezes >= 2);
});

test('cancelar descarta o que estava esperando', () => {
  const r = relogio();
  let vezes = 0;
  const lote = createInvalidationBatcher(() => (vezes += 1), {
    delayMs: 500,
    maxWaitMs: 2000,
    timers: r.timers,
  });
  lote.add([['peladas', 'u1']]);
  lote.cancel();
  r.andar(3000);
  assert.equal(vezes, 0);
});
