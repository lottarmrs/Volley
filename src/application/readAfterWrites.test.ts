import test from 'node:test';
import assert from 'node:assert/strict';
import { readAfterWrites } from './readAfterWrites';

test('espera a fila de gravacoes esvaziar antes de ler', async () => {
  const ordem: string[] = [];
  let soltar: () => void = () => {};
  const fila = new Promise<void>((resolve) => {
    soltar = resolve;
  });
  const leitura = readAfterWrites({
    settled: () => fila.then(() => void ordem.push('gravou')),
    version: () => 1,
    fetch: async () => {
      ordem.push('leu');
      return 'dados';
    },
  });
  await Promise.resolve();
  assert.deepEqual(ordem, []);
  soltar();
  assert.equal(await leitura, 'dados');
  assert.deepEqual(ordem, ['gravou', 'leu']);
});

test('gravacao nova durante a leitura descarta o resultado velho e le de novo', async () => {
  let versao = 1;
  let leituras = 0;
  const dados = await readAfterWrites({
    settled: async () => {},
    version: () => versao,
    fetch: async () => {
      leituras += 1;
      if (leituras === 1) versao += 1;
      return `leitura ${leituras}`;
    },
  });
  assert.equal(dados, 'leitura 2');
});

test('com toques sem parar, devolve depois de algumas voltas em vez de prender a tela', async () => {
  let versao = 0;
  let leituras = 0;
  const dados = await readAfterWrites({
    settled: async () => {},
    version: () => versao,
    fetch: async () => {
      leituras += 1;
      versao += 1;
      return leituras;
    },
    maxRounds: 3,
  });
  assert.equal(dados, 3);
});
