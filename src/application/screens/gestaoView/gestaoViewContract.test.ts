import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGestaoViewContract } from './gestaoViewContract';
import type { GestaoViewContractInput } from './gestaoViewContract';

function spy() {
  const calls: unknown[][] = [];
  const fn = (...a: unknown[]) => {
    calls.push(a);
  };
  return { fn, calls };
}

type Spy = ReturnType<typeof spy>;

function makeInput(overrides: Partial<GestaoViewContractInput> = {}): GestaoViewContractInput {
  return {
    currentUserId: null,
    isMaster: false,
    ...overrides,
  };
}

test('buildModel projeta currentUserId e isMaster', () => {
  const c = buildGestaoViewContract(
    makeInput({ currentUserId: 'u1', isMaster: true }),
  );
  assert.equal(c.model.currentUserId, 'u1');
  assert.equal(c.model.isMaster, true);
});

test('buildModel aceita currentUserId null', () => {
  const c = buildGestaoViewContract(makeInput({ currentUserId: null }));
  assert.equal(c.model.currentUserId, null);
  assert.equal(c.model.isMaster, false);
});

test('toast chama onToast com message e variant', async () => {
  const onToast = spy() as unknown as Spy;
  const c = buildGestaoViewContract(makeInput({ onToast: onToast.fn as never }));
  await c.dispatch({ kind: 'toast', message: 'Papel atualizado.', variant: 'success' });
  assert.equal(onToast.calls.length, 1);
  assert.deepEqual(onToast.calls[0], ['Papel atualizado.', 'success']);
});

test('toast repassa variant error', async () => {
  const onToast = spy() as unknown as Spy;
  const c = buildGestaoViewContract(makeInput({ onToast: onToast.fn as never }));
  await c.dispatch({ kind: 'toast', message: 'Não foi possível alterar.', variant: 'error' });
  assert.deepEqual(onToast.calls[0], ['Não foi possível alterar.', 'error']);
});

test('toast nao lanca quando onToast ausente', async () => {
  const c = buildGestaoViewContract(makeInput({ onToast: undefined }));
  await c.dispatch({ kind: 'toast', message: 'ok', variant: 'success' });
});
