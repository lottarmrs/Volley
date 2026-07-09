import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCloudHealthViewModel } from './cloudHealthViewModel';

test('cloud health reports offline when Supabase is not configured', () => {
  const health = buildCloudHealthViewModel({
    isSupabaseConfigured: false,
    hasUser: false,
    lastSyncedAt: null,
    openIssueCount: 0,
    totalOpenOccurrences: 0,
  });

  assert.equal(health.level, 'offline');
  assert.equal(health.title, 'Nuvem indisponivel');
});

test('cloud health asks for attention when open sync issues exist', () => {
  const health = buildCloudHealthViewModel({
    isSupabaseConfigured: true,
    hasUser: true,
    lastSyncedAt: '2026-07-09T03:00:00.000Z',
    openIssueCount: 2,
    totalOpenOccurrences: 5,
  });

  assert.equal(health.level, 'attention');
  assert.equal(health.title, 'Requer atencao');
  assert.equal(health.detail, '2 falha(s) aberta(s), 5 ocorrencia(s)');
});

test('cloud health reports operational when configured and clean', () => {
  const health = buildCloudHealthViewModel({
    isSupabaseConfigured: true,
    hasUser: true,
    lastSyncedAt: '2026-07-09T03:00:00.000Z',
    openIssueCount: 0,
    totalOpenOccurrences: 0,
  });

  assert.equal(health.level, 'operational');
  assert.equal(health.title, 'Operacional');
  assert.equal(health.detail, 'Ultima sincronizacao registrada');
});
