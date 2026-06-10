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
    communityId: 'community-local',
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

  const db = mapSessionToDb(session, 'owner-id', 'community-cloud');
  assert.equal(db.owner_id, 'owner-id');
  assert.equal(db.community_id, 'community-cloud');
  assert.equal(db.local_id, 'session-local');
  assert.deepEqual(db.config, session.config);

  const mapped = mapDbToSession(
    {
      ...db,
      id: 'session-cloud',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    'community-local',
  );

  assert.equal(mapped.id, 'session-local');
  assert.equal(mapped.cloudId, 'session-cloud');
  assert.equal(mapped.communityId, 'community-local');
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
    scoreBefore: { teamA: 0, teamB: 0 },
    scoreAfter: { teamA: 1, teamB: 0 },
    timestamp: now,
  };

  const mappedTeam = mapDbToTeam(
    {
      ...mapTeamToDb(team, 'owner-id', 'session-cloud', 'community-cloud'),
      id: 'team-cloud',
      updated_at: now,
      deleted_at: null,
    },
    'session-local',
  );
  const mappedGame = mapDbToGame(
    {
      ...mapGameToDb(game, 'owner-id', 'session-cloud', 'community-cloud'),
      id: 'game-cloud',
      updated_at: now,
      deleted_at: null,
    },
    'session-local',
  );
  const mappedPoint = mapDbToPointEvent(
    {
      ...mapPointEventToDb(point, 'owner-id', 'session-cloud', 'community-cloud'),
      id: 'point-cloud',
      updated_at: now,
      deleted_at: null,
    },
    'session-local',
  );

  assert.equal(mappedTeam.sessionId, 'session-local');
  assert.equal(mappedTeam.cloudId, 'team-cloud');
  assert.deepEqual(mappedTeam.playerIds, ['player-local']);
  assert.equal(mappedGame.sessionId, 'session-local');
  assert.equal(mappedGame.teamAId, 'team-a');
  assert.equal(mappedPoint.gameId, 'game-local');
  assert.equal(mappedPoint.reason, 'attack');
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

  const mappedGameReport = mapDbToGameReport(
    {
      ...mapGameReportToDb(gameReport, 'owner-id', 'session-cloud', 'community-cloud'),
      id: 'game-report-cloud',
      updated_at: now,
      deleted_at: null,
    },
    'session-local',
  );
  const mappedSessionReport = mapDbToSessionReport(
    {
      ...mapSessionReportToDb(sessionReport, 'owner-id', 'session-cloud', 'community-cloud'),
      id: 'session-report-cloud',
      updated_at: now,
      deleted_at: null,
    },
    'session-local',
  );
  const mappedPresence = mapDbToPresence(
    {
      ...mapPresenceToDb(presence, 'owner-id', 'community-cloud'),
      id: 'presence-cloud',
      updated_at: now,
      deleted_at: null,
    },
    'community-local',
  );
  const mappedDraft = mapDbToDraft(
    {
      ...mapDraftToDb(draft, 'owner-id', 'community-cloud'),
      id: 'draft-cloud',
      updated_at: now,
      created_at: now,
      deleted_at: null,
    },
    'community-local',
  );

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
      role: 'organizer',
      profiles: { name: 'Ana', email: 'ana@example.com' },
      created_at: now,
      updated_at: now,
    },
    'community-local',
  );

  assert.equal(mapped.communityId, 'community-local');
  assert.equal(mapped.userId, 'user-id');
  assert.equal(mapped.name, 'Ana');
  assert.equal(mapped.email, 'ana@example.com');
});
