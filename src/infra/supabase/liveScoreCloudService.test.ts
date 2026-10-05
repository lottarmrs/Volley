import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLiveScoreState } from './liveScoreCloudService';

function cliente(respostas: { sessao: unknown; pontos: unknown[]; perfis?: unknown[] }) {
  const consultas: string[] = [];
  const colunas: string[] = [];
  const builder = (tabela: string) => {
    const chain: Record<string, unknown> = {};
    const fim = () => {
      if (tabela === 'sessions') return Promise.resolve({ data: respostas.sessao, error: null });
      if (tabela === 'point_events')
        return Promise.resolve({ data: respostas.pontos, error: null });
      return Promise.resolve({ data: respostas.perfis ?? [], error: null });
    };
    for (const nome of ['eq', 'in']) chain[nome] = () => chain;
    chain.select = (lista: string) => {
      if (tabela === 'sessions') colunas.push(lista);
      return chain;
    };
    chain.is = () => fim();
    chain.maybeSingle = () => fim();
    chain.then = (ok: (v: unknown) => unknown) => fim().then(ok);
    consultas.push(tabela);
    return chain;
  };
  return {
    client: { from: builder, rpc: async () => ({ data: [], error: null }) },
    consultas,
    colunas,
  };
}

test('devolve quem controla, o nome e os ids locais dos pontos vivos', async () => {
  const { client } = cliente({
    sessao: { controlled_by_user_id: 'u2', status: 'active', deleted_at: null },
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
    sessionEnded: false,
  });
});

test('sem controle nao busca nome', async () => {
  const { client, consultas } = cliente({
    sessao: { controlled_by_user_id: null, status: 'active', deleted_at: null },
    pontos: [],
  });
  const estado = await fetchLiveScoreState('s1', client as never);
  assert.deepEqual(estado, {
    controlledByUserId: null,
    controllerName: null,
    pointIds: [],
    sessionEnded: false,
  });
  assert.ok(!consultas.includes('profiles'));
});

test('pelada encerrada, cancelada, apagada ou sumida conta como encerrada', async () => {
  const casos: [unknown, boolean][] = [
    [{ controlled_by_user_id: 'u1', status: 'finished', deleted_at: null }, true],
    [{ controlled_by_user_id: 'u1', status: 'cancelled', deleted_at: null }, true],
    [{ controlled_by_user_id: 'u1', status: 'active', deleted_at: '2026-10-05T21:00:00Z' }, true],
    [null, true],
    [{ controlled_by_user_id: null, status: 'paused', deleted_at: null }, false],
  ];
  for (const [sessao, encerrada] of casos) {
    const { client, colunas } = cliente({ sessao, pontos: [] });
    const estado = await fetchLiveScoreState('s1', client as never);
    assert.equal(estado.sessionEnded, encerrada, JSON.stringify(sessao));
    assert.match(colunas[0], /status/);
    assert.match(colunas[0], /deleted_at/);
  }
});
