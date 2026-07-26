import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCommunities,
  normalizeGames,
  normalizeSessionDraft,
  normalizeSessions,
  normalizeTournamentConfig,
  sanitizeAndConsolidateImportedBackup,
  sanitizeImportedBackup,
} from './migrations';

test('normalizeTournamentConfig fills modern tournament defaults', () => {
  const normalized = normalizeTournamentConfig({ roundTrip: true });

  assert.equal(normalized.type, 'tournament');
  assert.equal(normalized.format, 'double_round_robin');
  assert.equal(normalized.victoryRule, 'direct_3');
  assert.deepEqual(normalized.classificationPoints, {
    win: 3,
    loss: 0,
    walkoverWin: 3,
    walkoverLoss: 0,
  });
});

test('normalizeSessions and normalizeGames migrate legacy championship records', () => {
  const [session] = normalizeSessions([
    {
      id: 'session-1',
      type: 'championship',
      config: { type: 'championship', maxPoints: 21 },
    },
  ]);
  const [game] = normalizeGames([{ id: 'game-1', type: 'championship' }]);

  assert.equal(session.type, 'tournament');
  assert.equal(session.communityId, null);
  assert.equal(session.config?.type, 'tournament');
  assert.equal(session.config?.maxPoints, 21);
  assert.equal(game.type, 'tournament');
});

test('normalizeSessionDraft and normalizeCommunities handle missing legacy fields', () => {
  const draft = normalizeSessionDraft({
    session: {
      id: 'session-draft',
      type: 'tournament',
      config: {},
    },
  });
  const [community] = normalizeCommunities([{ name: 'Terça do Vôlei' }]);

  assert.equal(draft.session.type, 'tournament');
  assert.equal(draft.session.config.format, 'round_robin');
  assert.equal(community.name, 'Terça do Vôlei');
  assert.equal(community.defaultFormat, 'free_play');
  assert.equal(community.archived, false);
});

test('normalizeCommunities preserves cloud metadata and sync state', () => {
  const [community] = normalizeCommunities([
    {
      id: 'community-local',
      name: 'Quinta Forte',
      cloudId: '4da17d42-0532-4fde-987e-a503827b57ab',
      cloudOwnerId: 'owner-cloud-id',
      visibility: 'public',
      joinCode: 'ABC123',
      syncStatus: 'synced',
      lastSyncedAt: '2026-06-24T18:00:00.000Z',
      deletedAt: '2026-06-25T10:00:00.000Z',
      createdAt: '2026-06-20T10:00:00.000Z',
      updatedAt: '2026-06-24T17:59:00.000Z',
    },
  ]);

  assert.equal(community.cloudId, '4da17d42-0532-4fde-987e-a503827b57ab');
  assert.equal(community.cloudOwnerId, 'owner-cloud-id');
  assert.equal(community.visibility, 'public');
  assert.equal(community.joinCode, 'ABC123');
  assert.equal(community.syncStatus, 'synced');
  assert.equal(community.lastSyncedAt, '2026-06-24T18:00:00.000Z');
  assert.equal(community.deletedAt, '2026-06-25T10:00:00.000Z');
  assert.equal(community.defaultFormat, 'free_play');
});

test('normalizers return empty arrays for invalid collection inputs', () => {
  assert.deepEqual(normalizeSessions(null as unknown as []), []);
  assert.deepEqual(normalizeGames(undefined as unknown as []), []);
  assert.deepEqual(normalizeCommunities('bad' as unknown as []), []);
});

test('sanitizeImportedBackup recursively removes cloudId/lastSyncedAt and sets syncStatus to pending', () => {
  const input = {
    players: [
      {
        id: 'player-1',
        nome: 'Carol Mendes',
        cloudId: 'dd346673-f27b-4a26-ae54-1b0dd511728d',
        syncStatus: 'synced',
        lastSyncedAt: '2026-06-10T21:02:10.391Z',
      },
    ],
    activeSession: {
      id: 'session-1',
      cloudId: 'some-uuid',
      syncStatus: 'synced',
      lastSyncedAt: 'yesterday',
    },
  };

  const sanitized = sanitizeImportedBackup(input);

  assert.deepEqual(sanitized, {
    players: [
      {
        id: 'player-1',
        nome: 'Carol Mendes',
        syncStatus: 'pending',
      },
    ],
    activeSession: {
      id: 'session-1',
      syncStatus: 'pending',
    },
  });
});

test('sanitizeAndConsolidateImportedBackup merges duplicate local players and remaps references', () => {
  const imported = sanitizeAndConsolidateImportedBackup({
    players: [
      {
        id: 'player-empty',
        nome: 'Vitur',
        genero: 'M',
        posicaoPrincipal: 'oposto',
        alturaCm: 176,
        updatedAt: '2026-07-01T10:00:00.000Z',
        cloudId: 'cloud-empty',
        syncStatus: 'synced',
      },
      {
        id: 'player-active',
        nome: 'Vitur',
        genero: 'M',
        posicaoPrincipal: 'oposto',
        alturaCm: 176,
        updatedAt: '2026-06-01T10:00:00.000Z',
        cloudId: 'cloud-active',
        syncStatus: 'synced',
      },
    ],
    sessions: [
      {
        id: 'session-1',
        selectedPlayerIds: ['player-empty', 'player-active'],
        config: {
          playerPositions: { 'player-empty': 'oposto' },
          balanceConstraints: {
            lockedPlayerIdxs: { 'player-empty': 0 },
            pairsTogether: [['player-empty', 'player-active']],
          },
        },
      },
    ],
    teams: [{ id: 'team-1', playerIds: ['player-empty', 'player-active'] }],
    championships: [{ id: 'champ-1', communityId: 'community-1' }],
    championshipTeams: [
      {
        id: 'champ-team-1',
        championshipId: 'champ-1',
        playerIds: ['player-empty', 'player-active'],
      },
    ],
    pointEvents: [
      {
        id: 'point-1',
        playerId: 'player-active',
        assistPlayerId: 'player-empty',
      },
    ],
  });

  assert.equal(imported.players.length, 1);
  assert.equal(imported.players[0].id, 'player-active');
  assert.equal(imported.players[0].cloudId, undefined);
  assert.equal(imported.players[0].syncStatus, 'pending');
  assert.deepEqual(imported.sessions[0].selectedPlayerIds, ['player-active']);
  assert.deepEqual(imported.teams[0].playerIds, ['player-active']);
  assert.deepEqual(imported.championshipTeams[0].playerIds, ['player-active']);
  assert.equal(imported.pointEvents[0].playerId, 'player-active');
  assert.equal(imported.pointEvents[0].assistPlayerId, 'player-active');
  assert.deepEqual(imported.sessions[0].config.playerPositions, { 'player-active': 'oposto' });
  assert.deepEqual(imported.sessions[0].config.balanceConstraints.lockedPlayerIdxs, {
    'player-active': 0,
  });
  assert.deepEqual(imported.sessions[0].config.balanceConstraints.pairsTogether, []);
});

test('sanitizeAndConsolidateImportedBackup prunes orphaned active references', () => {
  const imported = sanitizeAndConsolidateImportedBackup({
    communities: [{ id: 'community-1', name: 'Domingo' }],
    players: [
      {
        id: 'player-1',
        nome: 'Ana',
        communityIds: ['community-1', 'missing-community', 'community-1'],
      },
    ],
    sessions: [
      {
        id: 'session-1',
        communityId: 'missing-community',
        selectedPlayerIds: ['player-1', 'missing-player', 'player-1'],
        config: {
          playerPositions: { 'player-1': 'ponteiro', 'missing-player': 'central' },
          balanceConstraints: {
            lockedPlayerIdxs: { 'player-1': 0, 'missing-player': 1 },
            pairsTogether: [['player-1', 'missing-player']],
          },
        },
      },
    ],
    teams: [{ id: 'team-1', playerIds: ['player-1', 'missing-player'] }],
    championships: [
      { id: 'champ-1', communityId: 'community-1' },
      { id: 'champ-orphan', communityId: 'missing-community' },
    ],
    championshipTeams: [
      { id: 'champ-team-a', championshipId: 'champ-1', playerIds: ['player-1'] },
      { id: 'champ-team-b', championshipId: 'champ-1', playerIds: ['player-1'] },
      { id: 'champ-team-orphan', championshipId: 'champ-orphan', playerIds: ['player-1'] },
    ],
    championshipRounds: [
      {
        id: 'round-1',
        championshipId: 'champ-1',
        teamAId: 'champ-team-a',
        teamBId: 'champ-team-b',
      },
      {
        id: 'round-orphan',
        championshipId: 'champ-orphan',
        teamAId: 'champ-team-orphan',
        teamBId: 'champ-team-orphan',
      },
    ],
    communityPresence: [
      {
        communityId: 'community-1',
        date: '2026-07-10',
        items: [
          { playerId: 'player-1', status: 'present' },
          { playerId: 'missing-player', status: 'present' },
          { temporaryName: 'Convidado', status: 'guest' },
        ],
      },
      { communityId: 'missing-community', date: '2026-07-10', items: [] },
    ],
    communityRules: [{ communityId: 'missing-community' }],
    whatsAppListTemplates: [{ communityId: 'missing-community' }],
    whatsAppListDrafts: [
      {
        communityId: 'community-1',
        setters: [{ playerId: 'missing-player', displayName: 'Fantasma' }],
        mainSlots: [{ playerId: 'player-1', displayName: 'Ana' }],
        reserveSlots: [{ temporaryName: 'Convidado' }],
      },
    ],
  });

  assert.deepEqual(imported.players[0].communityIds, ['community-1']);
  assert.equal(imported.sessions[0].communityId, null);
  assert.deepEqual(imported.sessions[0].selectedPlayerIds, ['player-1']);
  assert.deepEqual(imported.sessions[0].config.playerPositions, { 'player-1': 'ponteiro' });
  assert.deepEqual(imported.sessions[0].config.balanceConstraints.lockedPlayerIdxs, {
    'player-1': 0,
  });
  assert.deepEqual(imported.sessions[0].config.balanceConstraints.pairsTogether, []);
  assert.deepEqual(imported.teams[0].playerIds, ['player-1']);
  assert.deepEqual(imported.championships.map((item: any) => item.id), ['champ-1']);
  assert.deepEqual(imported.championshipTeams.map((item: any) => item.id), [
    'champ-team-a',
    'champ-team-b',
  ]);
  assert.deepEqual(imported.championshipRounds.map((item: any) => item.id), ['round-1']);
  assert.deepEqual(imported.communityPresence, [
    {
      communityId: 'community-1',
      date: '2026-07-10',
      items: [
        { playerId: 'player-1', status: 'present' },
        { temporaryName: 'Convidado', status: 'guest' },
      ],
    },
  ]);
  assert.deepEqual(imported.communityRules, []);
  assert.deepEqual(imported.whatsAppListTemplates, []);
  assert.deepEqual(imported.whatsAppListDrafts[0].setters, [{ displayName: 'Fantasma' }]);
});

test('sanitizeAndConsolidateImportedBackup remaps championships to a canonical community', () => {
  const imported = sanitizeAndConsolidateImportedBackup({
    communities: [
      { id: 'community-old', name: 'Liga Central', updatedAt: '2026-06-01T00:00:00.000Z' },
      { id: 'community-new', name: 'Liga Central', updatedAt: '2026-07-01T00:00:00.000Z' },
    ],
    championships: [{ id: 'champ-1', communityId: 'community-old' }],
  });

  assert.equal(imported.communities.length, 1);
  assert.equal(imported.championships[0].communityId, imported.communities[0].id);
});

test('sanitizeAndConsolidateImportedBackup rejects cross-championship and dangling-session rounds', () => {
  const imported = sanitizeAndConsolidateImportedBackup({
    communities: [{ id: 'community-1', name: 'Liga Central' }],
    sessions: [{ id: 'session-1', communityId: 'community-1' }],
    championships: [
      { id: 'champ-1', communityId: 'community-1' },
      { id: 'champ-2', communityId: 'community-1' },
    ],
    championshipTeams: [
      { id: 'team-a', championshipId: 'champ-1', playerIds: [] },
      { id: 'team-b', championshipId: 'champ-1', playerIds: [] },
      { id: 'team-c', championshipId: 'champ-2', playerIds: [] },
    ],
    championshipRounds: [
      {
        id: 'round-valid',
        championshipId: 'champ-1',
        teamAId: 'team-a',
        teamBId: 'team-b',
        sessionId: 'session-1',
      },
      {
        id: 'round-cross-scope',
        championshipId: 'champ-1',
        teamAId: 'team-a',
        teamBId: 'team-c',
      },
      {
        id: 'round-same-team',
        championshipId: 'champ-1',
        teamAId: 'team-a',
        teamBId: 'team-a',
      },
      {
        id: 'round-missing-session',
        championshipId: 'champ-1',
        teamAId: 'team-a',
        teamBId: 'team-b',
        sessionId: 'session-missing',
      },
    ],
  });

  assert.deepEqual(imported.championshipRounds.map((round: any) => round.id), [
    'round-valid',
  ]);
});
