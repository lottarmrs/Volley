import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCommunityToDb, mapDbToCommunity } from './communityCloudService';
import { mapDbToPlayer, mapPlayerToDb } from './playerCloudService';
import { mapDbToRules, mapRulesToDb } from './communityRulesCloudService';
import { mapDbToTemplate, mapTemplateToDb } from './whatsappTemplateCloudService';
import {
  mapDbToDraft,
  mapDbToGame,
  mapDbToGameReport,
  mapDbToPointEvent,
  mapDbToPresence,
  mapDbToSession,
  mapDbToSessionReport,
  mapDbToTeam,
  mapDraftToDb,
  mapGameReportToDb,
  mapGameToDb,
  mapPointEventToDb,
  mapPresenceToDb,
  mapSessionReportToDb,
  mapSessionToDb,
  mapTeamToDb,
} from './operationalCloudService';
import { mapDbToCommunityMember } from './membershipCloudService';
import {
  deduplicatePlayerEvaluationRecords,
  mapDbToPlayerEvaluation,
  mapPlayerEvaluationToDb,
} from './playerEvaluationCloudService';
import {
  Community,
  CommunityPresence,
  CommunityRules,
  Game,
  GameReport,
  Player,
  PointEvent,
  Session,
  SessionReport,
  Team,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '../../types';

const now = '2026-06-09T12:00:00.000Z';

const player: Player = {
  id: 'player-local',
  nome: 'Matheus',
  apelido: 'Math',
  genero: 'M',
  ativo: true,
  posicaoPrincipal: 'ponteiro',
  posicoesSecundarias: ['oposto'],
  alturaCm: 180,
  maoDominante: 'direita',
  atributos: {
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
  },
  perfil: {
    nivel: 1,
    classe: 'Atacante',
    arquetipo: 'Oposto',
    especialidade: 'Ataque',
    fraqueza: 'Passe',
  },
  formaAtual: {
    valor: 0,
    observacao: '',
    ultimasPartidas: [],
  },
  status: {
    lesionado: false,
    limitacaoFisica: null,
    presencaFrequente: true,
  },
  metadata: {
    criadoEm: now,
    atualizadoEm: now,
  },
  communityIds: ['community-local'],
  updatedAt: now,
};

test('community mapper preserves local and cloud identifiers', () => {
  const community: Community = {
    id: 'community-local',
    name: 'Panelinha',
    defaultFormat: 'free_play',
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  const db = mapCommunityToDb(community, 'owner-id');
  assert.equal(db.owner_id, 'owner-id');
  assert.equal(db.local_id, 'community-local');
  assert.equal(db.default_format, 'free_play');

  const mapped = mapDbToCommunity({
    id: 'community-cloud',
    local_id: 'community-local',
    name: 'Panelinha',
    default_format: 'tournament',
    archived: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  assert.equal(mapped.id, 'community-local');
  assert.equal(mapped.cloudId, 'community-cloud');
  assert.equal(mapped.defaultFormat, 'tournament');
});

test('player mapper round-trips structured fields and numeric values', () => {
  const db = mapPlayerToDb(player, 'owner-id');

  assert.equal(db.owner_id, 'owner-id');
  assert.equal(db.local_id, 'player-local');
  assert.equal(db.height, 180);
  assert.deepEqual(db.attributes, player.atributos);

  const mapped = mapDbToPlayer({
    id: 'player-cloud',
    local_id: 'player-local',
    name: 'Matheus',
    nickname: 'Math',
    gender: 'M',
    height: '180',
    dominant_hand: 'direita',
    primary_position: 'ponteiro',
    secondary_positions: ['oposto'],
    active: true,
    attributes: player.atributos,
    profile: player.perfil,
    forma_atual: player.formaAtual,
    status: player.status,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  assert.equal(mapped.id, 'player-local');
  assert.equal(mapped.cloudId, 'player-cloud');
  assert.equal(mapped.alturaCm, 180);
  assert.deepEqual(mapped.atributos, player.atributos);
});

test('player mapper tolerates a missing metadata object (I1: no crash)', () => {
  // Regressão: mapPlayerToDb usava local.metadata.atualizadoEm sem optional
  // chaining. Um player sem metadata derrubava o upload inteiro (via C3).
  const playerNoMeta = { ...player, updatedAt: undefined, metadata: undefined } as any;

  assert.doesNotThrow(() => mapPlayerToDb(playerNoMeta, 'owner-id'));
  const db = mapPlayerToDb(playerNoMeta, 'owner-id');
  assert.equal(typeof db.updated_at, 'string');
  assert.ok(!Number.isNaN(new Date(db.updated_at).getTime()));
});

test('community rules mapper preserves community ids and rule payloads', () => {
  const rules: CommunityRules = {
    communityId: 'community-local',
    defaultFormat: 'free_play',
    freePlay: { maxPoints: 12, teamCount: 3 },
    tournament: { maxPoints: 21 },
    balanceWeights: { overall: 2 },
    defaultTeamNames: ['Azul', 'Verde'],
    defaultTeamColors: ['blue', 'green'],
    updatedAt: now,
  };

  const db = mapRulesToDb(rules, 'owner-id', 'community-cloud');
  assert.equal(db.owner_id, 'owner-id');
  assert.equal(db.community_id, 'community-cloud');
  assert.deepEqual(db.free_play_rules, rules.freePlay);

  const mapped = mapDbToRules(
    {
      id: 'rules-cloud',
      default_format: 'tournament',
      default_location: 'Quadra 1',
      default_day: 'terça',
      default_start_time: '20:00',
      default_end_time: '22:00',
      free_play_rules: rules.freePlay,
      tournament_rules: rules.tournament,
      balance_weights: rules.balanceWeights,
      default_team_names: rules.defaultTeamNames,
      default_team_colors: rules.defaultTeamColors,
      updated_at: now,
    },
    'community-local',
  );

  assert.equal(mapped.communityId, 'community-local');
  assert.equal(mapped.cloudId, 'rules-cloud');
  assert.equal(mapped.defaultLocation, 'Quadra 1');
  assert.deepEqual(mapped.defaultTeamNames, ['Azul', 'Verde']);
});

test('whatsapp template mapper preserves zero-valued default payments', () => {
  const template: WhatsAppListTemplate = {
    id: 'template-local',
    communityId: 'community-local',
    name: 'Lista grátis',
    title: 'Vôlei Free',
    defaultValue: 0,
    settersCount: 2,
    mainSlotsCount: 12,
    reserveSlotsCount: 3,
    settersSectionTitle: 'LEVANTADORES',
    reserveSectionTitle: 'RESERVAS',
    showLockIcon: false,
    paymentSymbol: '$',
    createdAt: now,
    updatedAt: now,
  };

  const db = mapTemplateToDb(template, 'owner-id', 'community-cloud');
  assert.equal(db.default_value, 0);
  assert.equal(db.show_lock_icon, false);

  const mapped = mapDbToTemplate(
    {
      id: 'template-cloud',
      local_id: 'template-local',
      name: 'Lista grátis',
      title: 'Vôlei Free',
      default_value: 0,
      setters_count: 2,
      main_slots_count: 12,
      reserve_slots_count: 3,
      setters_section_title: 'LEVANTADORES',
      reserve_section_title: 'RESERVAS',
      show_lock_icon: false,
      payment_symbol: '$',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    'community-local',
  );

  assert.equal(mapped.id, 'template-local');
  assert.equal(mapped.cloudId, 'template-cloud');
  assert.equal(mapped.defaultValue, 0);
  assert.equal(mapped.showLockIcon, false);
});

test('session mapper preserves operational config and ids', () => {
  const session: Session = {
    id: 'session-local',
    communityId: 'community-cloud',
    name: 'Treino',
    date: '2026-06-09',
    location: 'Quadra 1',
    notes: null,
    status: 'active',
    type: 'free_play',
    selectedPlayerIds: ['player-local'],
    teamIds: ['team-local'],
    config: {
      type: 'free_play',
      teamCount: 3,
      maxPoints: 15,
      tieBreakMethod: 'win_by_2',
      rotationSystem: 'winner_stays',
      initialCourtTeams: ['team-a', 'team-b'],
      initialQueue: ['team-c'],
      queuePolicy: 'fifo',
    },
    createdAt: now,
    updatedAt: now,
  };

  const db = mapSessionToDb(session, 'owner-id');
  assert.equal(db.owner_id, 'owner-id');
  assert.equal(db.community_id, 'community-cloud');
  assert.equal(db.local_id, 'session-local');
  assert.deepEqual(db.config, session.config);

  const mapped = mapDbToSession({
    ...db,
    id: 'session-cloud',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  assert.equal(mapped.id, 'session-local');
  assert.equal(mapped.cloudId, 'session-cloud');
  assert.equal(mapped.communityId, 'community-cloud');
  assert.deepEqual(mapped.selectedPlayerIds, ['player-local']);
});

test('team, game and point mappers preserve relationships through local ids', () => {
  const team: Team = {
    id: 'team-local',
    sessionId: 'session-local',
    name: 'Azul',
    color: '#0000ff',
    playerIds: ['player-local'],
    generatedByAlgorithm: true,
    locked: false,
    championshipTeamId: 'champ-team-local',
    strengthSnapshot: {
      overall: 7,
      attack: 8,
      reception: 6,
      setting: 5,
      defense: 7,
      block: 6,
      serve: 7,
      regularity: 6,
      stamina: 6,
      gameReading: 7,
      averageHeight: 180,
      netPresence: 6,
      maleCount: 1,
      femaleCount: 0,
    },
  };

  const game: Game = {
    id: 'game-local',
    sessionId: 'session-local',
    type: 'free_play',
    sequenceNumber: 1,
    stage: 'free_play',
    teamAId: 'team-a',
    teamBId: 'team-b',
    scoreA: 15,
    scoreB: 12,
    winnerTeamId: 'team-a',
    loserTeamId: 'team-b',
    status: 'finished',
    pointIds: ['point-local'],
    sets: [
      { scoreA: 12, scoreB: 9 },
      { scoreA: 10, scoreB: 12 },
    ],
    setTargets: [12, 12, 7],
    metadata: { court: '1' },
  };

  const point: PointEvent = {
    id: 'point-local',
    sessionId: 'session-local',
    gameId: 'game-local',
    sequenceNumber: 1,
    scoringTeamId: 'team-a',
    concedingTeamId: 'team-b',
    playerId: 'player-local',
    reason: 'attack',
    eventKind: 'point',
    assistPlayerId: 'setter-local',
    scoreBefore: { teamA: 0, teamB: 0 },
    scoreAfter: { teamA: 1, teamB: 0 },
    timestamp: now,
  };

  const mappedTeam = mapDbToTeam({
    ...mapTeamToDb(team, 'owner-id', 'community-cloud', 'champ-team-cloud'),
    id: 'team-cloud',
    updated_at: now,
    deleted_at: null,
  });
  const mappedGame = mapDbToGame({
    ...mapGameToDb(game, 'owner-id', 'community-cloud'),
    id: 'game-cloud',
    updated_at: now,
    deleted_at: null,
  });
  const mappedPoint = mapDbToPointEvent({
    ...mapPointEventToDb(point, 'owner-id', 'community-cloud'),
    id: 'point-cloud',
    updated_at: now,
    deleted_at: null,
  });

  assert.equal(mappedTeam.sessionId, 'session-local');
  assert.equal(mappedTeam.cloudId, 'team-cloud');
  assert.deepEqual(mappedTeam.playerIds, ['player-local']);
  assert.equal(mappedTeam.championshipTeamId, 'champ-team-cloud');
  assert.equal(mappedGame.sessionId, 'session-local');
  assert.equal(mappedGame.teamAId, 'team-a');
  assert.deepEqual(mappedGame.sets, [
    { scoreA: 12, scoreB: 9 },
    { scoreA: 10, scoreB: 12 },
  ]);
  assert.deepEqual(mappedGame.setTargets, [12, 12, 7]);
  assert.equal(mappedPoint.gameId, 'game-local');
  assert.equal(mappedPoint.reason, 'attack');
  assert.equal(mappedPoint.eventKind, 'point');
  assert.equal(mappedPoint.assistPlayerId, 'setter-local');
});

test('report, presence and draft mappers preserve JSON payloads', () => {
  const gameReport: GameReport = {
    id: 'game-report-local',
    sessionId: 'session-local',
    gameId: 'game-local',
    sequenceNumber: 1,
    generatedAt: now,
    teamA: { id: 'team-a', name: 'A', playerIds: [], playerNames: [], score: 15 },
    teamB: { id: 'team-b', name: 'B', playerIds: [], playerNames: [], score: 12 },
    winnerTeamId: 'team-a',
    winnerTeamName: 'A',
    loserTeamId: 'team-b',
    loserTeamName: 'B',
    totalPoints: 27,
    playerStats: [],
  };
  const sessionReport: SessionReport = {
    id: 'session-report-local',
    sessionId: 'session-local',
    generatedAt: now,
    sessionName: 'Treino',
    date: '2026-06-09',
    type: 'free_play',
    rules: { maxPoints: 15, tieBreakMethod: 'win_by_2' },
    totalGames: 1,
    totalPoints: 27,
    gamesByWalkover: 0,
    teamStandings: [],
    playerRanking: [],
    games: [gameReport],
  };
  const presence: CommunityPresence = {
    communityId: 'community-local',
    date: '2026-06-09',
    items: [{ playerId: 'player-local', status: 'present' }],
    updatedAt: now,
  };
  const draft: WhatsAppListDraft = {
    id: 'draft-local',
    communityId: 'community-local',
    title: 'Lista',
    date: '2026-06-09',
    value: 0,
    setters: [{ index: 0, displayName: 'Levantador' }],
    mainSlots: [],
    reserveSlots: [],
    settersSectionTitle: 'LEVANTADORES',
    reserveSectionTitle: 'RESERVAS',
    showLockIcon: false,
    paymentSymbol: '$',
    createdAt: now,
    updatedAt: now,
  };

  const mappedGameReport = mapDbToGameReport({
    ...mapGameReportToDb(gameReport, 'owner-id', 'community-cloud'),
    id: 'game-report-cloud',
    updated_at: now,
    deleted_at: null,
  });
  const mappedSessionReport = mapDbToSessionReport({
    ...mapSessionReportToDb(sessionReport, 'owner-id', 'community-cloud'),
    id: 'session-report-cloud',
    updated_at: now,
    deleted_at: null,
  });
  const mappedPresence = mapDbToPresence({
    ...mapPresenceToDb(presence, 'owner-id'),
    id: 'presence-cloud',
    updated_at: now,
    deleted_at: null,
  });
  const mappedDraft = mapDbToDraft({
    ...mapDraftToDb(draft, 'owner-id'),
    id: 'draft-cloud',
    updated_at: now,
    created_at: now,
    deleted_at: null,
  });

  assert.equal(mappedGameReport.totalPoints, 27);
  assert.equal(mappedGameReport.cloudId, 'game-report-cloud');
  assert.equal(mappedSessionReport.games[0].id, 'game-report-local');
  assert.deepEqual(mappedPresence.items, [{ playerId: 'player-local', status: 'present' }]);
  assert.equal(mappedDraft.value, 0);
  assert.equal(mappedDraft.showLockIcon, false);
});

test('community member mapper reads embedded profile data', () => {
  const mapped = mapDbToCommunityMember(
    {
      id: 'member-cloud',
      community_id: 'community-cloud',
      user_id: 'user-id',
      role: 'moderator',
      status: 'active',
      profiles: { name: 'Ana', email: 'ana@example.com' },
      created_at: now,
      updated_at: now,
    },
    'community-local',
  );

  assert.equal(mapped.communityId, 'community-local');
  assert.equal(mapped.userId, 'user-id');
  assert.equal(mapped.role, 'moderator');
  assert.equal(mapped.status, 'active');
  assert.equal(mapped.name, 'Ana');
  assert.equal(mapped.email, 'ana@example.com');
});

test('community member mapper accepts profile data fetched separately', () => {
  const mapped = mapDbToCommunityMember(
    {
      id: 'member-cloud',
      community_id: 'community-cloud',
      user_id: 'user-id',
      role: 'owner',
      status: 'active',
      created_at: now,
      updated_at: now,
    },
    'community-local',
    { name: 'Lottar', email: 'lottar@example.com' },
  );

  assert.equal(mapped.communityId, 'community-local');
  assert.equal(mapped.userId, 'user-id');
  assert.equal(mapped.role, 'owner');
  assert.equal(mapped.name, 'Lottar');
  assert.equal(mapped.email, 'lottar@example.com');
});

test('player evaluation mapper omits the id key so the DB default applies', () => {
  const db = mapPlayerEvaluationToDb(player, 'owner-id', 'player-cloud-uuid');

  // Regressão: Object.keys({id: undefined}) ainda contém 'id', e o supabase-js
  // (defaultToNull) enviaria id=null, violando o NOT NULL e o default
  // gen_random_uuid(). A chave NÃO pode existir no objeto.
  assert.equal(Object.prototype.hasOwnProperty.call(db, 'id'), false);
  assert.equal(db.owner_id, 'owner-id');
  assert.equal(db.player_id, 'player-cloud-uuid');
  assert.equal(db.local_id, 'player-local');
});

test('player evaluation mapper forwards evaluationCommunityId as community_id', () => {
  const playerWithCommunity: Player = { ...player, evaluationCommunityId: 'community-cloud' };
  const db = mapPlayerEvaluationToDb(playerWithCommunity, 'owner-id', 'player-cloud-uuid');

  assert.equal(db.community_id, 'community-cloud');
});

test('player evaluation mapper reads community_id from the DB row', () => {
  const mapped = mapDbToPlayerEvaluation({
    id: 'evaluation-cloud',
    owner_id: 'owner-id',
    player_id: 'player-cloud-uuid',
    community_id: 'community-cloud',
    attributes: player.atributos,
    local_id: 'player-local',
    created_at: now,
    updated_at: now,
  });

  assert.equal(mapped.communityId, 'community-cloud');
});

test('player evaluation bulk records are deduplicated by owner and cloud player id', () => {
  const records = deduplicatePlayerEvaluationRecords([
    {
      owner_id: 'OWNER-ID',
      player_id: 'PLAYER-CLOUD-UUID',
      local_id: 'old-local',
      updated_at: '2026-06-09T10:00:00.000Z',
    },
    {
      owner_id: 'owner-id',
      player_id: 'player-cloud-uuid',
      local_id: 'new-local',
      updated_at: '2026-06-09T12:00:00.000Z',
    },
    {
      owner_id: 'owner-id',
      player_id: 'other-player-cloud-uuid',
      local_id: 'other-local',
      updated_at: '2026-06-09T11:00:00.000Z',
    },
  ]);

  assert.equal(records.length, 2);
  assert.equal(
    records.find((record) => record.player_id === 'player-cloud-uuid')?.local_id,
    'new-local',
  );
  assert.equal(
    records.find((record) => record.player_id === 'other-player-cloud-uuid')?.local_id,
    'other-local',
  );
});
