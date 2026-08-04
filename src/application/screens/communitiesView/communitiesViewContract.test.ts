import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommunitiesViewContract } from './communitiesViewContract';
import type { CommunitiesViewContractInput } from './communitiesViewContract';
import type {
  Championship,
  Community,
  CommunityRules,
  Player,
} from '@shared/types';

function spy() {
  const calls: unknown[][] = [];
  const fn = (...a: unknown[]) => {
    calls.push(a);
  };
  return { fn, calls };
}

type Spy = ReturnType<typeof spy>;

const noopPresenceApi = {
  getPresence: () => null,
  setPresenceStatus: () => {},
  clearPresence: () => {},
  selectFrequentPlayers: () => {},
  useLastPresence: () => {},
  addGuest: () => {},
  getPresentPlayers: (_id: string, players: Player[]) => players,
} as CommunitiesViewContractInput['presenceApi'];

const noopWhatsAppApi = {
  saveTemplate: () => {},
  saveDraft: () => {},
  getCommunityTemplates: () => [],
  getLatestDraft: () => undefined,
} as CommunitiesViewContractInput['whatsAppApi'];

const noopRulesApi = {
  getRules: (_c: Community) => ({ communityId: 'x' } as CommunityRules),
  saveRules: () => {},
  removeRules: () => {},
} as CommunitiesViewContractInput['rulesApi'];

function makeCommunity(overrides: Partial<Community> = {}): Community {
  return {
    id: 'c1',
    name: '_T_',
    description: null,
    archived: false,
    defaultFormat: 'random',
    defaultDay: null,
    defaultStartTime: null,
    defaultEndTime: null,
    defaultLocation: null,
    ownerId: 'u1',
    recurrenceRule: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Community;
}

function makeInput(
  overrides: Partial<CommunitiesViewContractInput> = {},
): CommunitiesViewContractInput {
  return {
    communities: [],
    players: [],
    sessions: [],
    games: [],
    pointEvents: [],
    teams: [],
    sessionReports: [],
    championships: [],
    championshipTeams: [],
    championshipRounds: [],
    presenceApi: noopPresenceApi,
    whatsAppApi: noopWhatsAppApi,
    rulesApi: noopRulesApi,
    currentUserId: null,
    isSupabaseConfigured: false,
    globalRole: null,
    onBack: () => {},
    onAddCommunity: ((input: Partial<Community>) => ({ ...makeCommunity(), ...input })) as never,
    onUpdateCommunity: (() => true) as never,
    onDeleteCommunity: () => {},
    onDuplicateCommunity: () => {},
    onUpdatePlayerCommunities: () => {},
    onCreatePlayer: () => {},
    onCreateSession: () => {},
    onViewSession: () => {},
    onClearCommunityHistory: () => {},
    onCreateChampionship: (() => ({ ok: true, value: null })) as never,
    onMaterializeRound: (() => ({ ok: true, value: { sessionId: 's1' } })) as never,
    onDeleteChampionship: () => {},
    onRescheduleRound: (() => ({ ok: true, value: null })) as never,
    onSetRoundSkipped: (() => ({ ok: true, value: null })) as never,
    onUpdateChampionshipRecurrence: (() => ({ ok: true, value: null })) as never,
    ...overrides,
  };
}

test('buildModel projeta os 16 campos de dados + 7 callbacks com retorno', () => {
  const community = makeCommunity({ id: 'cc' });
  const presenceApi = noopPresenceApi;
  const whatsAppApi = noopWhatsAppApi;
  const rulesApi = noopRulesApi;
  const c = buildCommunitiesViewContract(
    makeInput({
      communities: [community],
      players: [{ id: 'p1' } as Player],
      sessions: [{ id: 's1' } as never],
      games: [{ id: 'g1' } as never],
      pointEvents: [{ id: 'e1' } as never],
      teams: [{ id: 't1' } as never],
      sessionReports: [{ id: 'sr1' } as never],
      championships: [{ id: 'ch1' } as Championship],
      championshipTeams: [{ id: 'cht1' } as never],
      championshipRounds: [{ id: 'chr1' } as never],
      presenceApi,
      whatsAppApi,
      rulesApi,
      currentUserId: 'u1',
      isSupabaseConfigured: true,
      globalRole: 'admin' as never,
    }),
  );
  assert.equal(c.model.communities.length, 1);
  assert.equal(c.model.players.length, 1);
  assert.equal(c.model.sessions.length, 1);
  assert.equal(c.model.games.length, 1);
  assert.equal(c.model.pointEvents.length, 1);
  assert.equal(c.model.teams.length, 1);
  assert.equal(c.model.sessionReports.length, 1);
  assert.equal(c.model.championships.length, 1);
  assert.equal(c.model.championshipTeams.length, 1);
  assert.equal(c.model.championshipRounds.length, 1);
  assert.equal(c.model.presenceApi, presenceApi);
  assert.equal(c.model.whatsAppApi, whatsAppApi);
  assert.equal(c.model.rulesApi, rulesApi);
  assert.equal(c.model.currentUserId, 'u1');
  assert.equal(c.model.isSupabaseConfigured, true);
  assert.equal(c.model.globalRole, 'admin');
  assert.equal(typeof c.model.createChampionship, 'function');
  assert.equal(typeof c.model.materializeRound, 'function');
  assert.equal(typeof c.model.rescheduleRound, 'function');
  assert.equal(typeof c.model.setRoundSkipped, 'function');
  assert.equal(typeof c.model.updateChampionshipRecurrence, 'function');
  assert.equal(typeof c.model.addCommunity, 'function');
  assert.equal(typeof c.model.updateCommunity, 'function');
});

test('back (void-no-args) chama onBack', async () => {
  const onBack = spy() as unknown as Spy;
  const c = buildCommunitiesViewContract(makeInput({ onBack: onBack.fn as never }));
  await c.dispatch({ kind: 'back' });
  assert.equal(onBack.calls.length, 1);
  assert.deepEqual(onBack.calls[0], []);
});

test('addCommunity (com-args) repassa input ao callback', async () => {
  const onAddCommunity = spy() as unknown as Spy;
  const c = buildCommunitiesViewContract(
    makeInput({
      onAddCommunity: ((input: Partial<Community>) => {
        onAddCommunity.fn(input);
        return makeCommunity(input);
      }) as never,
    }),
  );
  const input: Partial<Community> = { name: 'X' };
  await c.dispatch({ kind: 'addCommunity', input });
  assert.equal(onAddCommunity.calls.length, 1);
  assert.deepEqual(onAddCommunity.calls[0], [input]);
});

test('updateCommunity repassa communityId, patch e allowed opcional', async () => {
  const onUpdateCommunity = spy() as unknown as Spy;
  const c = buildCommunitiesViewContract(
    makeInput({
      onUpdateCommunity: ((...a: unknown[]) => {
        onUpdateCommunity.fn(...a);
        return true;
      }) as never,
    }),
  );
  await c.dispatch({
    kind: 'updateCommunity',
    communityId: 'c1',
    patch: { archived: true },
    allowed: true,
  });
  assert.equal(onUpdateCommunity.calls.length, 1);
  assert.deepEqual(onUpdateCommunity.calls[0], ['c1', { archived: true }, true]);
});

test('createPlayer repassa name e communityId', async () => {
  const onCreatePlayer = spy() as unknown as Spy;
  const c = buildCommunitiesViewContract(
    makeInput({ onCreatePlayer: onCreatePlayer.fn as never }),
  );
  await c.dispatch({ kind: 'createPlayer', name: 'A', communityId: 'c1' });
  assert.deepEqual(onCreatePlayer.calls[0], ['A', 'c1']);
});

test('createChampionship (AppResult) chama callback e ignora retorno', async () => {
  const onCreateChampionship = spy() as unknown as Spy;
  const c = buildCommunitiesViewContract(
    makeInput({
      onCreateChampionship: (() => {
        onCreateChampionship.fn();
        return { ok: true, value: null };
      }) as never,
    }),
  );
  const input = { communityId: 'c1', name: 'Liga' } as never;
  await c.dispatch({ kind: 'createChampionship', input });
  assert.equal(onCreateChampionship.calls.length, 1);
});

test('materializeRound (AppResult<{sessionId}>) delega e ignora retorno', async () => {
  const onMaterializeRound = spy() as unknown as Spy;
  const c = buildCommunitiesViewContract(
    makeInput({
      onMaterializeRound: (() => {
        onMaterializeRound.fn();
        return { ok: true, value: { sessionId: 's1' } };
      }) as never,
    }),
  );
  await c.dispatch({ kind: 'materializeRound', roundId: 'r1' });
  assert.equal(onMaterializeRound.calls.length, 1);
});

test('linkedCloudPlayer (opcional) chama callback quando presente', async () => {
  const onLinkedCloudPlayer = spy() as unknown as Spy;
  const c = buildCommunitiesViewContract(
    makeInput({ onLinkedCloudPlayer: onLinkedCloudPlayer.fn as never }),
  );
  const player = { id: 'p1' } as Player;
  await c.dispatch({ kind: 'linkedCloudPlayer', player, communityId: 'c1' });
  assert.deepEqual(onLinkedCloudPlayer.calls[0], [player, 'c1']);
});

test('linkedCloudPlayer (opcional) nao lanca quando ausente', async () => {
  const c = buildCommunitiesViewContract(makeInput({ onLinkedCloudPlayer: undefined }));
  await c.dispatch({ kind: 'linkedCloudPlayer', player: { id: 'p1' } as Player, communityId: 'c1' });
});

test('deleteChampionship repassa championshipId', async () => {
  const onDeleteChampionship = spy() as unknown as Spy;
  const c = buildCommunitiesViewContract(
    makeInput({ onDeleteChampionship: onDeleteChampionship.fn as never }),
  );
  await c.dispatch({ kind: 'deleteChampionship', championshipId: 'ch1' });
  assert.deepEqual(onDeleteChampionship.calls[0], ['ch1']);
});
