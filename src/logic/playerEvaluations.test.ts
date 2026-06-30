import test from 'node:test';
import assert from 'node:assert/strict';
import { Attributes, Player, PlayerEvaluation } from '../types';
import { aggregatePlayerEvaluations, simulateLocalConsensus } from './playerEvaluations';

const baseAttributes: Attributes = {
  saque: 5,
  recepcao: 5,
  levantamento: 5,
  ataque: 5,
  bloqueio: 5,
  defesa: 5,
  velocidade: 5,
  resistencia: 5,
  leituraDeJogo: 5,
  regularidade: 5,
  controleEmocional: 5,
};

function evaluation(id: string, ataque: number): PlayerEvaluation {
  return {
    id,
    playerId: 'player-y',
    ownerId: `admin-${id}`,
    attributes: { ...baseAttributes, ataque },
    createdAt: '2026-06-23T10:00:00.000Z',
    updatedAt: '2026-06-23T10:00:00.000Z',
  };
}

test('aggregatePlayerEvaluations ignores a clear attribute outlier', () => {
  const aggregate = aggregatePlayerEvaluations(
    [evaluation('a', 7), evaluation('b', 8.5), evaluation('c', 7.5), evaluation('d', 1)],
    baseAttributes,
  );

  assert.equal(aggregate.attributes.ataque, 7.7);
  assert.equal(aggregate.evaluatorCount, 4);
  assert.equal(aggregate.outlierValueCount, 1);
});

test('aggregatePlayerEvaluations keeps small samples intact', () => {
  const aggregate = aggregatePlayerEvaluations(
    [evaluation('a', 7), evaluation('b', 9.5), evaluation('c', 2)],
    baseAttributes,
  );

  assert.equal(aggregate.attributes.ataque, 6.2);
  assert.equal(aggregate.outlierValueCount, 0);
});

test('simulateLocalConsensus works for new/local players without evaluations', () => {
  const player: Player = {
    id: 'player-new',
    nome: 'Atleta Novo',
    apelido: '',
    genero: 'M',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    maoDominante: 'direita',
    atributos: { ...baseAttributes, ataque: 5 },
    perfil: { nivel: 1, classe: 'Recruta', arquetipo: 'Versátil', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: '', atualizadoEm: '' },
  };

  const simulated = simulateLocalConsensus(player, { ...baseAttributes, ataque: 8 });

  assert.equal(simulated.atributos.ataque, 8);
  assert.equal(simulated.evaluationAggregate?.evaluatorCount, 1);
  assert.equal(simulated.hasOwnEvaluation, true);
});

test('simulateLocalConsensus Scenario A: User already evaluated, replaces old personal value', () => {
  const player: Player = {
    id: 'player-x',
    nome: 'Atleta X',
    apelido: '',
    genero: 'M',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    maoDominante: 'direita',
    atributos: { ...baseAttributes, ataque: 7 }, // Consenso antigo = 7
    personalAttributes: { ...baseAttributes, ataque: 6 }, // Avaliação antiga do usuário = 6
    hasOwnEvaluation: true, // Já avaliou
    evaluationAggregate: {
      attributes: { ...baseAttributes, ataque: 7 },
      evaluatorCount: 2, // Total de 2 avaliadores (o usuário e outro com nota 8)
      includedValueCount: 22,
      outlierValueCount: 0,
    },
    perfil: { nivel: 1, classe: 'Recruta', arquetipo: 'Versátil', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: '', atualizadoEm: '' },
    cloudId: 'cloud-id-x',
  };

  // Nova avaliação pessoal do usuário = 9.
  // Novo Consenso = (7 * 2 - 6 + 9) / 2 = 8.5
  const simulated = simulateLocalConsensus(player, { ...baseAttributes, ataque: 9 });

  assert.equal(simulated.atributos.ataque, 8.5);
  assert.equal(simulated.evaluationAggregate?.evaluatorCount, 2);
  assert.equal(simulated.hasOwnEvaluation, true);
});

test("simulateLocalConsensus Scenario B: User hasn't evaluated before, adds new personal value", () => {
  const player: Player = {
    id: 'player-y',
    nome: 'Atleta Y',
    apelido: '',
    genero: 'M',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    maoDominante: 'direita',
    atributos: { ...baseAttributes, ataque: 8 }, // Consenso antigo = 8 (outro avaliador)
    hasOwnEvaluation: false, // Não avaliou ainda
    evaluationAggregate: {
      attributes: { ...baseAttributes, ataque: 8 },
      evaluatorCount: 1, // 1 avaliador (outra pessoa)
      includedValueCount: 11,
      outlierValueCount: 0,
    },
    perfil: { nivel: 1, classe: 'Recruta', arquetipo: 'Versátil', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: '', atualizadoEm: '' },
    cloudId: 'cloud-id-y',
  };

  // Nova avaliação do usuário = 9.
  // Novo Consenso = (8 * 1 + 9) / 2 = 8.5
  const simulated = simulateLocalConsensus(player, { ...baseAttributes, ataque: 9 });

  assert.equal(simulated.atributos.ataque, 8.5);
  assert.equal(simulated.evaluationAggregate?.evaluatorCount, 2);
  assert.equal(simulated.hasOwnEvaluation, true);
});
