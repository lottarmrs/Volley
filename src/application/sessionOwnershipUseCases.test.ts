import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSessionControl } from './sessionOwnershipUseCases';

test('sessao sem dono libera o placar', () => {
  const v = resolveSessionControl({
    controlledByUserId: null, controlClaimedAt: null, controlDeviceId: null,
    currentUserId: 'u-1', currentDeviceId: 'd-1', holderName: null,
  });
  assert.equal(v.canScore, true);
  assert.equal(v.reason, 'free');
});

test('sessao minha libera o placar', () => {
  const v = resolveSessionControl({
    controlledByUserId: 'u-1', controlClaimedAt: '2026-07-31T12:00:00Z', controlDeviceId: 'd-1',
    currentUserId: 'u-1', currentDeviceId: 'd-1', holderName: 'Eu',
  });
  assert.equal(v.canScore, true);
  assert.equal(v.reason, 'mine');
});

test('sessao de outra pessoa bloqueia e nomeia quem esta com ela', () => {
  const v = resolveSessionControl({
    controlledByUserId: 'u-2', controlClaimedAt: '2026-07-31T12:00:00Z', controlDeviceId: 'd-9',
    currentUserId: 'u-1', currentDeviceId: 'd-1', holderName: 'Ana',
  });
  assert.equal(v.canScore, false);
  assert.equal(v.reason, 'held_by_other');
  // O nome importa: "outro dispositivo" nao e acionavel, "Ana" e.
  assert.match(v.message, /Ana/);
});

test('minha sessao em outro aparelho AVISA mas nao bloqueia', () => {
  // Bloquear aqui puniria o caso legitimo de trocar de celular no meio da sessao.
  const v = resolveSessionControl({
    controlledByUserId: 'u-1', controlClaimedAt: '2026-07-31T12:00:00Z', controlDeviceId: 'd-OUTRO',
    currentUserId: 'u-1', currentDeviceId: 'd-1', holderName: 'Eu',
  });
  assert.equal(v.canScore, true);
  assert.equal(v.reason, 'mine_other_device');
  assert.match(v.message, /outro aparelho/i);
});

test('sem usuario nao ha placar a marcar', () => {
  const v = resolveSessionControl({
    controlledByUserId: null, controlClaimedAt: null, controlDeviceId: null,
    currentUserId: null, currentDeviceId: 'd-1', holderName: null,
  });
  assert.equal(v.canScore, false);
  assert.equal(v.reason, 'not_authenticated');
});
