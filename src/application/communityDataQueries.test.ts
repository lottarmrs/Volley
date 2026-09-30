import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attributes, Community, Player, PlayerEvaluation } from '@shared/types';
import { assembleRoster } from './communityDataQueries';

const atributos = { saque: 3 } as unknown as Attributes;

function atleta(id: string, cloudId = id): Player {
  return { id, cloudId, nome: id, atributos } as unknown as Player;
}

function relacao(community_id: string, player_id: string, active = true) {
  return { owner_id: 'o', community_id, player_id, active };
}

test('atleta com duas relacoes ativas ganha as duas comunidades; inativa nao conta', () => {
  const [ana] = assembleRoster({
    players: [atleta('ana')],
    relations: [relacao('c1', 'ana'), relacao('c2', 'ANA'), relacao('c3', 'ana', false)],
    evaluations: [],
  });
  assert.deepEqual(ana.communityIds, ['c1', 'c2']);
  assert.equal(ana.hasOwnEvaluation, false);
});

test('relacao pelo id da nuvem e comunidade traduzida para o id do app', () => {
  const [ana] = assembleRoster({
    players: [atleta('local-ana', 'nuvem-ana')],
    relations: [relacao('nuvem-c1', 'nuvem-ana')],
    evaluations: [],
    communities: [{ id: 'local-c1', cloudId: 'nuvem-c1' } as Community],
  });
  assert.deepEqual(ana.communityIds, ['local-c1']);
});

test('avaliacoes aplicam o agregado e marcam a avaliacao propria', () => {
  const avaliacao = {
    id: 'e1',
    playerId: 'ana',
    ownerId: 'u1',
    communityId: 'c1',
    attributes: atributos,
    createdAt: '',
    updatedAt: '',
  } as PlayerEvaluation;
  const [ana, bia] = assembleRoster({
    players: [atleta('ana'), atleta('bia')],
    relations: [],
    evaluations: [avaliacao],
    ownerId: 'u1',
  });
  assert.equal(ana.hasOwnEvaluation, true);
  assert.ok(ana.evaluationAggregate);
  assert.equal(bia.hasOwnEvaluation, false);
});
