import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCommunityToDb, mapDbToCommunity } from './communityCloudService';
import { mapDbToPlayer, mapPlayerToDb } from './playerCloudService';
import { mapDbToRules, mapRulesToDb } from './communityRulesCloudService';
import { mapDbToTemplate, mapTemplateToDb } from './whatsappTemplateCloudService';
import { Community, CommunityRules, Player, WhatsAppListTemplate } from '../../types';

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
