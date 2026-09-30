import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetSessionLifecycleCloudService } from './targetSessionLifecycleCloudService';

function cliente(revision = 3) {
  const chamadas: Array<[string, Record<string, unknown>]> = [];
  return {
    chamadas,
    rpc: async (name: string, args: Record<string, unknown>) => {
      chamadas.push([name, args]);
      if (name === 'read_target_session') return { data: [{ revision }], error: null };
      return { data: [{ session_revision: revision + 1 }], error: null };
    },
  };
}

test('cada comando le a revisao antes e manda o id do comando', async () => {
  const c = cliente(7);
  const service = createTargetSessionLifecycleCloudService(c, () => 'cmd');
  await service.start('s1');
  assert.deepEqual(c.chamadas, [
    ['read_target_session', { p_session_id: 's1' }],
    ['start_target_session', { p_command_id: 'cmd', p_session_id: 's1', p_expected_revision: 7 }],
  ]);
});

test('congelar manda as regras da pelada como SESSION_EXPLICIT', async () => {
  const c = cliente();
  const service = createTargetSessionLifecycleCloudService(c, () => 'snap');
  await service.freezeRules('s1', { type: 'free_play', config: null });
  assert.deepEqual(c.chamadas[1], [
    'freeze_target_session_rules_snapshot',
    {
      p_snapshot_id: 'snap',
      p_session_id: 's1',
      p_expected_revision: 3,
      p_rules_schema_version: 1,
      p_source_kind: 'SESSION_EXPLICIT',
      p_rules_payload: { type: 'free_play', config: null },
    },
  ]);
});

test('o erro do servidor sobe como veio', async () => {
  const service = createTargetSessionLifecycleCloudService({
    rpc: async (name) =>
      name === 'read_target_session'
        ? { data: [{ revision: 1 }], error: null }
        : { data: null, error: { code: '42501', message: 'nao' } },
  });
  await assert.rejects(() => service.finish('s1'), { code: '42501' });
});
