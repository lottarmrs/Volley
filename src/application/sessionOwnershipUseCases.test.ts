import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSessionControl,
  shouldHeartbeatSessionControl,
  SESSION_CONTROL_HEARTBEAT_MS,
} from './sessionOwnershipUseCases';

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

// A regra do heartbeat vive no use case, nao dentro do efeito, para estes testes
// exercitarem o que o componente de fato executa — e nao uma copia que diverge.
test('bate enquanto a sessao esta ativa e o controle e meu', () => {
  assert.equal(
    shouldHeartbeatSessionControl({ sessionCloudId: 'c-1', sessionStatus: 'active', canScore: true }),
    true,
  );
});

test('nao bate quando outra pessoa detem o controle', () => {
  // Insistir aqui seria tomar o controle sem a confirmacao que a tela exige.
  assert.equal(
    shouldHeartbeatSessionControl({ sessionCloudId: 'c-1', sessionStatus: 'active', canScore: false }),
    false,
  );
});

test('nao bate em sessao encerrada nem sem id de nuvem', () => {
  assert.equal(
    shouldHeartbeatSessionControl({ sessionCloudId: 'c-1', sessionStatus: 'finished', canScore: true }),
    false,
  );
  assert.equal(
    shouldHeartbeatSessionControl({ sessionCloudId: null, sessionStatus: 'active', canScore: true }),
    false,
  );
});

test('o intervalo cobre a janela de expiracao com folga', () => {
  // Janela no banco: 10 minutos. Batida a cada 2 dá cinco perdidas antes de soltar,
  // e uma sessao real de 45 min recebe 22 batidas sem depender de sync nenhum.
  assert.equal(SESSION_CONTROL_HEARTBEAT_MS, 120000);
  assert.ok(SESSION_CONTROL_HEARTBEAT_MS * 5 <= 10 * 60 * 1000);
});
