import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Attributes } from '../../types';
import { mapDbToSelfEvaluation, mapSelfEvaluationToDb } from './selfEvaluationCloudService';

const attributes: Attributes = {
  saque: 7,
  recepcao: 6,
  levantamento: 5,
  ataque: 8,
  bloqueio: 6,
  defesa: 6,
  velocidade: 7,
  resistencia: 7,
  leituraDeJogo: 6,
  regularidade: 6,
  controleEmocional: 6,
};

test('mapDbToSelfEvaluation returns null when no row exists', () => {
  assert.equal(mapDbToSelfEvaluation(null), null);
});

test('mapDbToSelfEvaluation maps attributes and updated_at correctly', () => {
  const mapped = mapDbToSelfEvaluation({
    attributes,
    updated_at: '2026-07-24T12:00:00.000Z',
  });

  assert.deepEqual(mapped, {
    attributes,
    updatedAt: '2026-07-24T12:00:00.000Z',
  });
});

test('mapSelfEvaluationToDb builds the upsert payload keyed by player_id', () => {
  const db = mapSelfEvaluationToDb('player-cloud-uuid', attributes);

  assert.equal(db.player_id, 'player-cloud-uuid');
  assert.deepEqual(db.attributes, attributes);
  assert.equal(typeof db.updated_at, 'string');
  assert.ok(!Number.isNaN(new Date(db.updated_at).getTime()));
});

test('self evaluation cloud service upserts against the player_id conflict target', () => {
  const source = readFileSync(new URL('./selfEvaluationCloudService.ts', import.meta.url), 'utf8');

  assert.match(source, /\.from\('self_evaluations'\)/);
  assert.match(source, /onConflict:\s*'player_id'/);
  assert.match(source, /\.eq\('player_id', playerId\)/);
  assert.match(source, /\.maybeSingle\(\)/);
});
