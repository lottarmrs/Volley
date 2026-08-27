import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccountDisplay } from './appShellViewModel';

test('getAccountDisplay prefers profile name, then email, then fallback', () => {
  assert.deepEqual(
    getAccountDisplay({
      profileName: 'Matheus Silva',
      email: 'matheus@example.com',
      fallbackName: 'Administrador',
      fallbackInitials: 'AD',
    }),
    { name: 'Matheus Silva', initials: 'MA' },
  );
  assert.deepEqual(
    getAccountDisplay({
      email: 'panelinha@example.com',
      fallbackName: 'Administrador',
      fallbackInitials: 'AD',
    }),
    { name: 'panelinha', initials: 'PA' },
  );
  assert.deepEqual(
    getAccountDisplay({
      fallbackName: 'Panelinha',
      fallbackInitials: 'PL',
    }),
    { name: 'Panelinha', initials: 'PL' },
  );
});

import { buildPendingDeliveryNotice } from './appShellViewModel';

test('nao avisa quando nao ha pendente', () => {
  assert.equal(
    buildPendingDeliveryNotice({
      pendingChanges: 0,
      connectivity: 'offline',
      hasOpenFailure: true,
    }),
    null,
  );
});

test('nao avisa quando ha pendente mas tudo esta bem', () => {
  // Pendente com rede e sem falha e so o sync que ainda nao rodou. Avisar aqui
  // treinaria a pessoa a ignorar o aviso.
  assert.equal(
    buildPendingDeliveryNotice({
      pendingChanges: 3,
      connectivity: 'online',
      hasOpenFailure: false,
    }),
    null,
  );
});

test('avisa com pendente e sem rede, dizendo a consequencia', () => {
  const aviso = buildPendingDeliveryNotice({
    pendingChanges: 3,
    connectivity: 'offline',
    hasOpenFailure: false,
  });
  assert.ok(aviso);
  // "pendentes" descreve uma fila; "nao foram para a nuvem" descreve uma perda possivel.
  assert.match(aviso!.message, /não foram para a nuvem/i);
  assert.match(aviso!.message, /3/);
});

test('avisa com pendente e falha aberta, mesmo com rede', () => {
  const aviso = buildPendingDeliveryNotice({
    pendingChanges: 1,
    connectivity: 'online',
    hasOpenFailure: true,
  });
  assert.ok(aviso);
  assert.match(aviso!.message, /1 alteração/i);
});
