import test from 'node:test';
import assert from 'node:assert/strict';
import { SCORING_OFFLINE_MESSAGE, scoringOfflineFor } from './scoringLock';

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
