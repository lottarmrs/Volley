import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLiveScoreState } from './liveScoreCloudService';

function cliente(respostas: { sessao: unknown; pontos: unknown[]; perfis?: unknown[] }) {
  const consultas: string[] = [];
  const builder = (tabela: string) => {
    const chain: Record<string, unknown> = {};
    const fim = () => {
      if (tabela === 'sessions') return Promise.resolve({ data: respostas.sessao, error: null });
      if (tabela === 'point_events')
        return Promise.resolve({ data: respostas.pontos, error: null });
      return Promise.resolve({ data: respostas.perfis ?? [], error: null });
    };
    for (const nome of ['select', 'eq', 'in']) chain[nome] = () => chain;
    chain.is = () => fim();
    chain.maybeSingle = () => fim();
    chain.then = (ok: (v: unknown) => unknown) => fim().then(ok);
    consultas.push(tabela);
    return chain;
  };
  return { client: { from: builder, rpc: async () => ({ data: [], error: null }) }, consultas };
}

test('devolve quem controla, o nome e os ids locais dos pontos vivos', async () => {
  const { client } = cliente({
    sessao: { controlled_by_user_id: 'u2' },
    pontos: [
      { id: 'c1', local_id: 'p1' },
      { id: 'c2', local_id: null },
    ],
    perfis: [{ id: 'u2', name: 'Bia', email: null }],
  });
  const estado = await fetchLiveScoreState('s1', client as never);
  assert.deepEqual(estado, {
    controlledByUserId: 'u2',
    controllerName: 'Bia',
    pointIds: ['p1', 'c2'],
  });
});

test('sem controle nao busca nome', async () => {
  const { client, consultas } = cliente({ sessao: { controlled_by_user_id: null }, pontos: [] });
  const estado = await fetchLiveScoreState('s1', client as never);
  assert.deepEqual(estado, { controlledByUserId: null, controllerName: null, pointIds: [] });
  assert.ok(!consultas.includes('profiles'));
});
