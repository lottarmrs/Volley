import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommunityDeletion,
  applyCommunityHistoryClear,
  applyCommunityMembershipDuplicate,
  applyLocalCommunityDeletion,
  applyLocalCommunityUpdate,
  createLocalCommunity,
  duplicateLocalCommunity,
  applyLinkedCloudPlayer,
  applyPlayerCommunityMemberships,
  validateLocalCommunitySave,
} from './localCommunityUseCases';
import type {
  Community,
  CommunityPresence,
  Player,
  Session,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '../types';

const now = '2026-07-13T12:00:00.000Z';

function community(id: string, name: string): Community {
  return {
    id,
    name,
    description: '',
    defaultLocation: '',
    defaultDay: '',
    defaultStartTime: '',
    defaultEndTime: '',
    defaultFormat: 'free_play',
    color: 'primary',
    icon: 'volleyball',
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

function player(id: string, communityIds: string[] = []): Player {
  return {
    id,
    nome: id,
    apelido: id,
    genero: 'M',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    maoDominante: 'direita',
    atributos: {
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
    },
    perfil: { nivel: 1, classe: '', arquetipo: '', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: now, atualizadoEm: now },
    communityIds,
  };
}

test('applyCommunityDeletion removes the community and local operational references', () => {
  const result = applyCommunityDeletion({
    communityId: 'c1',
    communities: [{ id: 'c1' }, { id: 'c2' }] as Community[],
    players: [player('p1', ['c1', 'c2']), player('p2', ['c2'])],
    presenceRecords: [{ communityId: 'c1' }, { communityId: 'c2' }] as CommunityPresence[],
    templates: [{ communityId: 'c1' }, { communityId: 'c2' }] as WhatsAppListTemplate[],
    drafts: [{ communityId: 'c1' }, { communityId: 'c2' }] as WhatsAppListDraft[],
  });

  assert.deepEqual(
    result.communities.map((community) => community.id),
    ['c2'],
  );
  assert.deepEqual(result.players[0].communityIds, ['c2']);
  assert.deepEqual(
    result.presenceRecords.map((record) => record.communityId),
    ['c2'],
  );
  assert.deepEqual(
    result.templates.map((template) => template.communityId),
    ['c2'],
  );
  assert.deepEqual(
    result.drafts.map((draft) => draft.communityId),
    ['c2'],
  );
});

test('validateLocalCommunitySave requires a non-empty community name', () => {
  const result = validateLocalCommunitySave({
    communities: [],
    community: community('c1', '   '),
  });

  assert.equal(result.name, 'O nome da comunidade é obrigatório.');
});

test('validateLocalCommunitySave detects active semantic duplicate names', () => {
  const result = validateLocalCommunitySave({
    communities: [community('c1', 'Terça do Vôlei')],
    community: community('c2', ' Terca do Volei '),
  });

  assert.equal(result.name, 'Ja existe uma comunidade com esse nome: Terça do Vôlei.');
});

test('validateLocalCommunitySave ignores deleted archived and self duplicates', () => {
  const result = validateLocalCommunitySave({
    communities: [
      community('c1', 'Terça do Vôlei'),
      { ...community('c2', 'Terça do Vôlei'), deletedAt: now },
      { ...community('c3', 'Terça do Vôlei'), archived: true },
    ],
    community: community('c1', 'Terça do Vôlei'),
  });

  assert.deepEqual(result, {});
});

test('applyLocalCommunityDeletion soft-deletes cloud communities', () => {
  const result = applyLocalCommunityDeletion({
    communities: [{ ...community('c1', 'Domingo'), cloudId: 'cloud-c1' }],
    communityId: 'c1',
    now,
  });

  assert.equal(result[0].deletedAt, now);
  assert.equal(result[0].syncStatus, 'pending');
});

test('applyLocalCommunityDeletion removes local-only communities', () => {
  const result = applyLocalCommunityDeletion({
    communities: [community('c1', 'Domingo')],
    communityId: 'c1',
    now,
  });

  assert.deepEqual(result, []);
});

test('applyLocalCommunityUpdate rejects active semantic duplicate names', () => {
  const result = applyLocalCommunityUpdate({
    communities: [community('c1', 'Terca do Volei'), community('c2', 'Livre')],
    communityId: 'c2',
    patch: { name: ' Ter\u00e7a do V\u00f4lei ' },
    now,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors?.name, 'Ja existe uma comunidade com esse nome: Terca do Volei.');
});

test('createLocalCommunity generates a unique local community name', () => {
  const result = createLocalCommunity({
    communities: [community('c1', 'Nova comunidade')],
    input: {},
    id: 'c2',
    now,
  });

  assert.equal(result.name, 'Nova comunidade 2');
  assert.equal(result.id, 'c2');
  assert.equal(result.syncStatus, 'local');
});

test('duplicateLocalCommunity copies a source with a unique local name and no cloud id', () => {
  const result = duplicateLocalCommunity({
    communities: [
      { ...community('c1', 'Domingo'), cloudId: 'cloud-c1', archived: true },
      community('c2', 'Domingo (copia)'),
    ],
    communityId: 'c1',
    includeAthletes: true,
    id: 'c3',
    now,
  });

  assert.equal(result?.includeAthletes, true);
  assert.equal(result?.duplicate.id, 'c3');
  assert.equal(result?.duplicate.name, 'Domingo (copia) 2');
  assert.equal(result?.duplicate.archived, false);
  assert.equal(result?.duplicate.cloudId, undefined);
  assert.equal(result?.duplicate.syncStatus, 'local');
});

test('applyCommunityMembershipDuplicate adds the duplicated community to source members once', () => {
  const result = applyCommunityMembershipDuplicate([player('p1', ['c1']), player('p2', ['c2'])], {
    sourceCommunityId: 'c1',
    duplicateCommunityId: 'c3',
  });

  assert.deepEqual(result[0].communityIds, ['c1', 'c3']);
  assert.deepEqual(result[1].communityIds, ['c2']);
  assert.deepEqual(
    applyCommunityMembershipDuplicate(result, {
      sourceCommunityId: 'c1',
      duplicateCommunityId: 'c3',
    })[0].communityIds,
    ['c1', 'c3'],
  );
});

test('applyPlayerCommunityMemberships makes selected players the only community members', () => {
  const result = applyPlayerCommunityMemberships(
    [player('p1', []), player('p2', ['c1']), player('p3', ['c1', 'c2'])],
    'c1',
    ['p1', 'p3'],
  );

  assert.deepEqual(
    result.map((item) => item.communityIds),
    [['c1'], [], ['c1', 'c2']],
  );
});

test('applyCommunityHistoryClear detaches sessions from a community', () => {
  const sessions = [
    { id: 's1', communityId: 'c1' },
    { id: 's2', communityId: 'c2' },
  ] as Session[];

  assert.deepEqual(
    applyCommunityHistoryClear(sessions, 'c1').map((session) => session.communityId),
    [null, 'c2'],
  );
});

test('applyLinkedCloudPlayer upserts a synced player and ensures community membership', () => {
  const remote = { ...player('p2', []), syncStatus: 'pending' as const };

  const inserted = applyLinkedCloudPlayer([player('p1')], remote, 'c1');
  assert.equal(inserted.length, 2);
  assert.deepEqual(inserted[1].communityIds, ['c1']);
  assert.equal(inserted[1].syncStatus, 'synced');

  const updated = applyLinkedCloudPlayer(inserted, { ...remote, nome: 'Atualizado' }, 'c2');
  assert.equal(updated.length, 2);
  assert.equal(updated[1].nome, 'Atualizado');
  assert.deepEqual(updated[1].communityIds, ['c2']);
});
