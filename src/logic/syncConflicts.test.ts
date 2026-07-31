import test from 'node:test';
import assert from 'node:assert/strict';
import { conflictedSessionIds, detectSessionConflicts } from './syncConflicts';

const evento = (sessionId: string, syncStatus: string) => ({ sessionId, syncStatus });

const controle = (userId: string) => ({
  controlled_by_user_id: userId, control_claimed_at: 'x', control_device_id: 'd',
});

test('detecta conflito quando marquei em sessao controlada por outra pessoa', () => {
  const conflitos = detectSessionConflicts({
    currentUserId: 'u-1',
    localPointEvents: [evento('s-1', 'pending'), evento('s-1', 'pending')],
    cloudSessionControl: { 's-1': controle('u-2') },
    cloudEventCounts: { 's-1': 19 },
    holderNames: { 'u-2': 'Ana' },
  });
  assert.equal(conflitos.length, 1);
  assert.equal(conflitos[0].sessionId, 's-1');
  assert.equal(conflitos[0].localEventCount, 2);
  // Sem os DOIS numeros a pessoa nao tem como decidir qual versao vale.
  assert.equal(conflitos[0].holderEventCount, 19);
  assert.equal(conflitos[0].holderName, 'Ana');
});

test('nao ha conflito quando a sessao e minha', () => {
  assert.deepEqual(
    detectSessionConflicts({
      currentUserId: 'u-1',
      localPointEvents: [evento('s-1', 'pending')],
      cloudSessionControl: { 's-1': controle('u-1') },
      cloudEventCounts: {},
      holderNames: {},
    }),
    [],
  );
});

test('nao ha conflito com evento ja sincronizado', () => {
  // Ja subiu: nao ha o que decidir.
  assert.deepEqual(
    detectSessionConflicts({
      currentUserId: 'u-1',
      localPointEvents: [evento('s-1', 'synced')],
      cloudSessionControl: { 's-1': controle('u-2') },
      cloudEventCounts: { 's-1': 19 },
      holderNames: { 'u-2': 'Ana' },
    }),
    [],
  );
});

test('uma sessao em conflito nao contamina as outras', () => {
  // A entrega das demais nao pode ser travada por um conflito localizado.
  const conflitos = detectSessionConflicts({
    currentUserId: 'u-1',
    localPointEvents: [evento('s-1', 'pending'), evento('s-2', 'pending')],
    cloudSessionControl: { 's-1': controle('u-2') },
    cloudEventCounts: { 's-1': 19 },
    holderNames: { 'u-2': 'Ana' },
  });
  assert.equal(conflitos.length, 1);
  assert.equal(conflitos[0].sessionId, 's-1');
  assert.equal(conflictedSessionIds(conflitos).has('s-2'), false);
});
