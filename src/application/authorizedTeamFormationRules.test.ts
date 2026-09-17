import assert from 'node:assert/strict';
import test from 'node:test';
import type { Community, TeamFormationRequest } from '@shared/types';
import { makePlayer, makeSession } from '../test/fixtures';
import {
  AuthorizedFormationFailure,
  classifyAuthorizedFormationFailure,
  classifyFormationAuthority,
  precheckAuthorizedSelection,
  rekeyAuthorizedRequest,
} from './authorizedTeamFormationRules';

const CLOUD = '11111111-1111-4111-8111-111111111111';
const synced: Community = {
  id: 'community-1',
  name: 'Pelada',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cloudId: CLOUD,
};
const local: Community = { ...synced, id: 'community-2', cloudId: undefined };

test('authority: target, local-only, legacy-synced and synced Community Sessions', () => {
  assert.deepEqual(
    classifyFormationAuthority(
      makeSession('s', { communityId: 'community-1', authorityModel: 'target' }),
      [synced],
    ),
    { kind: 'authorized', communityCloudId: CLOUD },
  );
  assert.deepEqual(classifyFormationAuthority(makeSession('s', { communityId: null }), [synced]), {
    kind: 'local',
  });
  assert.deepEqual(
    classifyFormationAuthority(makeSession('s', { communityId: 'community-2' }), [local]),
    {
      kind: 'local',
    },
  );
  assert.deepEqual(
    classifyFormationAuthority(
      makeSession('s', { communityId: 'community-1', cloudId: 'legacy-row' }),
      [synced],
    ),
    { kind: 'local' },
  );
  assert.deepEqual(
    classifyFormationAuthority(makeSession('s', { communityId: 'community-1' }), [synced]),
    {
      kind: 'authorized',
      communityCloudId: CLOUD,
    },
  );
  assert.deepEqual(
    classifyFormationAuthority(
      makeSession('s', { communityId: 'gone', authorityModel: 'target' }),
      [synced],
    ),
    { kind: 'authorized', communityCloudId: null },
  );
});

test('precheck keeps selection order, names unsynced Players and Players outside the Community', () => {
  const inside = { communityIds: ['community-1'] };
  const players = [
    makePlayer('a', { ...inside, cloudId: 'cloud-a' }),
    makePlayer('b', { ...inside }),
    makePlayer('c', { ...inside }),
    makePlayer('d', { communityIds: ['other'], cloudId: 'cloud-d' }),
    makePlayer('g', { ...inside, cloudId: 'cloud-g', isGuest: true }),
  ];
  const session = (ids: string[]) =>
    makeSession('s', { communityId: 'community-1', selectedPlayerIds: ids });

  const missing = precheckAuthorizedSelection(session(['a', 'b', 'c']), players);
  assert.equal(missing.ok, false);
  assert.equal(
    !missing.ok && missing.error.message,
    'Sincronize antes de gerar os times: Atleta b e Atleta c ainda não estão na nuvem.',
  );

  const outside = precheckAuthorizedSelection(session(['a', 'd']), players);
  assert.equal(!outside.ok && outside.error.message, 'Atleta d não fazem parte desta comunidade.');

  const ok = precheckAuthorizedSelection(session(['g', 'a']), players);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.ok && ok.value.map((player) => player.id), ['g', 'a']);
});

test('rekey swaps participant ids for local Player ids and refuses a missing match', () => {
  const players = [
    makePlayer('a', { cloudId: 'CLOUD-A' }),
    makePlayer('b', { cloudId: 'cloud-b' }),
  ];
  const request = {
    participants: [{ participantId: 'pa' }, { participantId: 'pb' }],
    provenance: { kind: 'AUTHORIZED_SNAPSHOT', snapshotId: 'snap', inputFingerprint: 'fp' },
  } as unknown as TeamFormationRequest;
  const roster = {
    rosterRevisionId: 'r',
    sessionId: 's',
    entries: [
      { participantId: 'pa', identityKind: 'PLAYER' as const, playerId: 'cloud-a' },
      { participantId: 'pb', identityKind: 'PLAYER' as const, playerId: 'cloud-b' },
    ],
  };

  const rekeyed = rekeyAuthorizedRequest(request, roster, players);
  assert.deepEqual(
    rekeyed?.participants.map((p) => p.participantId),
    ['a', 'b'],
  );
  assert.deepEqual(rekeyed?.provenance, request.provenance);

  assert.equal(rekeyAuthorizedRequest(request, roster, [players[0]]), null);
});

test('failure classification maps every row of the error table', () => {
  const fail = (step: string, reason: unknown, player?: ReturnType<typeof makePlayer>) =>
    classifyAuthorizedFormationFailure(new AuthorizedFormationFailure(step, reason, player)).error;
  const coded = (code: string, message = code) => Object.assign(new Error(message), { code });

  assert.deepEqual(
    [
      fail('createSession', coded('CLOUD_UNAVAILABLE')).kind,
      fail('openWindow', new TypeError('x')).kind,
    ],
    ['offline_unavailable', 'offline_unavailable'],
  );
  assert.equal(
    fail('captureSnapshot', { message: 'TypeError: Failed to fetch' }).message,
    'Sem conexão com a nuvem. Sessões de comunidade precisam de internet para gerar os times.',
  );
  assert.equal(
    fail('createSession', coded('42501')).message,
    'Só dono, admin, moderador ou Organizador desta comunidade podem gerar os times.',
  );
  assert.equal(
    fail('addEntry:cloud-b', coded('42501'), makePlayer('b')).message,
    'Atleta b não está no elenco da comunidade na nuvem.',
  );
  assert.equal(
    fail('closeWindow', coded('40001')).message,
    'O elenco mudou em outro aparelho. Tente de novo.',
  );
  assert.equal(
    fail(
      'captureSnapshot',
      coded('23514', 'Roster entry references a Player without live Community standing'),
    ).message,
    'Um atleta saiu do elenco da comunidade. Atualize a seleção e gere de novo.',
  );
  assert.equal(
    fail('finalizeRoster', coded('23514')).message,
    'A sessão ou o elenco não estão prontos para formar times.',
  );
  assert.equal(
    fail('reopenWindow', coded('42883')).message,
    'A formação autorizada ainda não está disponível neste servidor.',
  );
  assert.equal(
    fail('rekey', new Error('x')).message,
    'Não foi possível ligar o elenco autorizado aos atletas deste aparelho. Sincronize e tente de novo.',
  );
  assert.equal(
    fail('readWindow', coded('XX000')).message,
    'Não foi possível preparar os times. Verifique a conexão e tente novamente.',
  );
});
