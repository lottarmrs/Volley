import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closeListAndFinalize,
  markPelada,
  startQuickPelada,
  type PeladaFlowGateway,
} from './peladaFlowUseCases';

function gateway(falha?: { em: string; erro: unknown }) {
  const chamadas: string[] = [];
  let revisao = 1;
  const passo = async (nome: string, detalhe = '') => {
    chamadas.push(detalhe ? `${nome} ${detalhe}` : nome);
    if (falha?.em === nome) throw falha.erro;
    revisao += 1;
    return revisao;
  };
  const g: PeladaFlowGateway = {
    createTargetSession: async (input) => {
      await passo('create', `${input.communityId} ${input.plannedStartAt}`);
      return { id: input.sessionId };
    },
    createWindow: (input) => passo('window', String(input.capacity)),
    openWindow: (input) => passo('open', String(input.expectedRevision)),
    addEntry: (input) => passo('add', input.playerId),
    closeWindow: (input) => passo('close', String(input.expectedRevision)),
    lockWindow: (input) => passo('lock', String(input.expectedRevision)),
    finalizeRoster: async (input) => {
      await passo('finalize', String(input.expectedRevision));
      return { rosterRevisionId: 'r1', rosterRevisionNumber: 1 };
    },
    readWindow: async (windowId) => {
      chamadas.push(`read ${windowId}`);
      return {
        windowId,
        sessionId: 's1',
        status: 'OPEN',
        revision: 10,
        capacity: 12,
        confirmedPlayerIds: [],
      };
    },
  };
  return { g, chamadas };
}

const marcar = {
  communityCloudId: 'c1',
  name: 'Pelada',
  plannedStartAt: '2026-10-02T20:00:00.000Z',
  location: null,
  capacity: 12,
  type: 'free_play' as const,
};

test('marcar cria a pelada com horario, cria a lista com as vagas e abre', async () => {
  const { g, chamadas } = gateway();
  const resultado = await markPelada(marcar, g);
  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas, ['create c1 2026-10-02T20:00:00.000Z', 'window 12', 'open 3']);
});

test('marcar sem horario ou com menos de 2 vagas recusa sem chamar o servidor', async () => {
  const { g, chamadas } = gateway();
  const semHorario = await markPelada({ ...marcar, plannedStartAt: '' }, g);
  const poucasVagas = await markPelada({ ...marcar, capacity: 1 }, g);
  assert.equal(semHorario.ok === false && semHorario.error.kind, 'product');
  assert.equal(poucasVagas.ok, false);
  assert.deepEqual(chamadas, []);
});

test('sem conexao ao abrir a lista vira sem conexao', async () => {
  const { g } = gateway({ em: 'open', erro: new TypeError('Failed to fetch') });
  const resultado = await markPelada(marcar, g);
  assert.equal(resultado.ok === false && resultado.error.kind, 'offline_unavailable');
});

test('pelada rapida preenche a lista, fecha, trava e finaliza na hora', async () => {
  const { g, chamadas } = gateway();
  const resultado = await startQuickPelada(
    {
      communityCloudId: 'c1',
      name: 'Rapida',
      playerCloudIds: ['a', 'b', 'c', 'd'],
      type: 'free_play',
    },
    g,
  );
  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas.slice(1), [
    'window 4',
    'open 3',
    'add a',
    'add b',
    'add c',
    'add d',
    'close 8',
    'lock 9',
    'finalize 10',
  ]);
});

test('pelada rapida com menos de 4 atletas recusa', async () => {
  const { g, chamadas } = gateway();
  const resultado = await startQuickPelada(
    { communityCloudId: 'c1', name: 'Rapida', playerCloudIds: ['a', 'b', 'c'], type: 'free_play' },
    g,
  );
  assert.equal(resultado.ok, false);
  assert.deepEqual(chamadas, []);
});

test('fechar a lista le a janela e encadeia fechar, travar e finalizar', async () => {
  const { g, chamadas } = gateway();
  const resultado = await closeListAndFinalize({ windowId: 'w1' }, g);
  assert.equal(resultado.ok && resultado.value.rosterRevisionId, 'r1');
  assert.deepEqual(chamadas, ['read w1', 'close 10', 'lock 2', 'finalize 3']);
});

test('fechar uma lista ja travada so finaliza', async () => {
  const { g, chamadas } = gateway();
  const lerOriginal = g.readWindow;
  g.readWindow = async (windowId) => ({ ...(await lerOriginal(windowId)), status: 'LOCKED' });
  const resultado = await closeListAndFinalize({ windowId: 'w1' }, g);
  assert.equal(resultado.ok, true);
  assert.deepEqual(chamadas, ['read w1', 'finalize 10']);
});
