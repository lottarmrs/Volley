import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRankingViewModel, getRankDisplay, rankingPositionLabels } from './rankingViewModel';
import { makePlayer } from '../test/fixtures';

test('buildRankingViewModel filters active players by name or nickname and sorts by overall', () => {
  const low = makePlayer('player-low', {
    nome: 'Ana Baixa',
    apelido: 'Canhota',
    atributos: {
      saque: 4,
      recepcao: 4,
      levantamento: 4,
      ataque: 4,
      bloqueio: 4,
      defesa: 4,
      velocidade: 4,
      resistencia: 4,
      leituraDeJogo: 4,
      regularidade: 4,
      controleEmocional: 4,
    },
  });
  const high = makePlayer('player-high', {
    nome: 'Ana Forte',
    apelido: 'Muralha',
    atributos: {
      saque: 8,
      recepcao: 8,
      levantamento: 8,
      ataque: 8,
      bloqueio: 8,
      defesa: 8,
      velocidade: 8,
      resistencia: 8,
      leituraDeJogo: 8,
      regularidade: 8,
      controleEmocional: 8,
    },
  });
  const inactive = makePlayer('player-inactive', {
    nome: 'Ana Arquivada',
    ativo: false,
  });

  const rankings = buildRankingViewModel({
    players: [low, high, inactive],
    games: [],
    pointEvents: [],
    teams: [],
    sessions: [],
    search: 'ana',
    sort: 'overall',
  });

  assert.deepEqual(
    rankings.map((ranking) => ranking.player.id),
    ['player-high', 'player-low'],
  );
});

test('buildRankingViewModel searches by nickname', () => {
  const rankings = buildRankingViewModel({
    players: [
      makePlayer('player-1', { nome: 'Ana', apelido: 'Canhota' }),
      makePlayer('player-2', { nome: 'Bruna', apelido: 'Central' }),
    ],
    games: [],
    pointEvents: [],
    teams: [],
    sessions: [],
    search: 'canhota',
    sort: 'overall',
  });

  assert.deepEqual(
    rankings.map((ranking) => ranking.player.id),
    ['player-1'],
  );
});

test('getRankDisplay and rankingPositionLabels keep UI labels centralized', () => {
  assert.equal(getRankDisplay(0), '🥇');
  assert.equal(getRankDisplay(1), '🥈');
  assert.equal(getRankDisplay(2), '🥉');
  assert.equal(getRankDisplay(3), '#4');
  assert.equal(rankingPositionLabels.ponteiro, 'Ponteiro');
  assert.equal(rankingPositionLabels['all-rounder'], 'Coringa');
});
