import test from 'node:test';
import assert from 'node:assert/strict';
import { nextConnectivityState } from './connectivity';

test('uma requisicao bem-sucedida manda mais que o navigator.onLine', () => {
  // O caso do wi-fi sem internet ao contrario: o browser diz que caiu, mas a
  // requisicao passou. A requisicao e a verdade.
  assert.equal(
    nextConnectivityState({ current: 'offline', browserOnline: false, lastOutcome: 'success' }),
    'online',
  );
});

test('falha de rede vence o navigator.onLine otimista', () => {
  // Wi-fi de ginasio sem link: onLine=true, mas nada sai.
  assert.equal(
    nextConnectivityState({
      current: 'online',
      browserOnline: true,
      lastOutcome: 'network_failure',
    }),
    'offline',
  );
});

test('sem resultado de requisicao, segue a pista do browser', () => {
  assert.equal(
    nextConnectivityState({ current: 'unknown', browserOnline: true, lastOutcome: null }),
    'online',
  );
  assert.equal(
    nextConnectivityState({ current: 'online', browserOnline: false, lastOutcome: null }),
    'offline',
  );
});

test('o estado inicial e desconhecido ate haver qualquer sinal', () => {
  assert.equal(
    nextConnectivityState({ current: 'unknown', browserOnline: false, lastOutcome: null }),
    'offline',
  );
});
