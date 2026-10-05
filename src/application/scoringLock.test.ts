import test from 'node:test';
import assert from 'node:assert/strict';
import { SCORING_OFFLINE_MESSAGE, scoringOfflineFor, staleScoreNotice } from './scoringLock';

test('sem conta o placar nunca trava por sinal', () => {
  assert.equal(
    scoringOfflineFor({ online: false, connectivity: 'offline', lastWriteOffline: true }),
    false,
  );
});

test('com conta, sem rede ou com a ultima gravacao sem conexao, trava', () => {
  assert.equal(
    scoringOfflineFor({ online: true, connectivity: 'offline', lastWriteOffline: false }),
    true,
  );
  assert.equal(
    scoringOfflineFor({ online: true, connectivity: 'online', lastWriteOffline: true }),
    true,
  );
});

test('com conta e rede, nao trava', () => {
  assert.equal(
    scoringOfflineFor({ online: true, connectivity: 'online', lastWriteOffline: false }),
    false,
  );
  assert.equal(SCORING_OFFLINE_MESSAGE, 'Sem conexão. O placar volta quando o sinal voltar.');
});

const base = Date.UTC(2026, 9, 5, 20, 0, 0);
const ultimo = new Date(base).toISOString();

test('quem acompanha ve o aviso a partir de 3 min sem ponto', () => {
  assert.equal(
    staleScoreNotice({
      readOnly: true,
      gameActive: true,
      lastPointAt: ultimo,
      now: base + 179_000,
    }),
    null,
  );
  assert.equal(
    staleScoreNotice({
      readOnly: true,
      gameActive: true,
      lastPointAt: ultimo,
      now: base + 245_000,
    }),
    'Último ponto há 4 min — quem marca pode estar sem sinal',
  );
});

test('quem marca, jogo parado ou jogo sem ponto nao mostram aviso', () => {
  const tarde = base + 600_000;
  assert.equal(
    staleScoreNotice({ readOnly: false, gameActive: true, lastPointAt: ultimo, now: tarde }),
    null,
  );
  assert.equal(
    staleScoreNotice({ readOnly: true, gameActive: false, lastPointAt: ultimo, now: tarde }),
    null,
  );
  assert.equal(
    staleScoreNotice({ readOnly: true, gameActive: true, lastPointAt: null, now: tarde }),
    null,
  );
});
