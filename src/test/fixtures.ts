import {
  Attributes,
  FreePlayConfig,
  Game,
  Player,
  Session,
  Team,
  TeamStrengthSnapshot,
} from '../types';

const NOW = '2026-01-01T12:00:00.000Z';

const baseAttributes: Attributes = {
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
};

const baseSnapshot: TeamStrengthSnapshot = {
  overall: 5,
  attack: 5,
  reception: 5,
  setting: 5,
  defense: 5,
  block: 5,
  serve: 5,
  regularity: 5,
  stamina: 5,
  gameReading: 5,
  netPresence: 11,
  maleCount: 1,
  femaleCount: 0,
};

export function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    nome: `Atleta ${id}`,
    apelido: `Atleta ${id}`,
    genero: 'M',
    ativo: true,
    posicaoPrincipal: 'ponteiro',
    posicoesSecundarias: [],
    maoDominante: 'direita',
    atributos: { ...baseAttributes },
    perfil: {
      nivel: 1,
      classe: 'Atleta',
      arquetipo: 'Versatil',
      especialidade: 'Teste',
      fraqueza: 'Teste',
    },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: NOW, atualizadoEm: NOW },
    ...overrides,
  };
}

export function makeTeam(
  id: string,
  sessionId: string,
  playerIds: string[],
  overrides: Partial<Team> = {},
): Team {
  return {
    id,
    sessionId,
    name: `Time ${id}`,
    playerIds,
    generatedByAlgorithm: false,
    locked: false,
    strengthSnapshot: { ...baseSnapshot },
    ...overrides,
  };
}

export function makeFreePlayConfig(overrides: Partial<FreePlayConfig> = {}): FreePlayConfig {
  return {
    type: 'free_play',
    teamCount: 2,
    maxPoints: 15,
    tieBreakMethod: 'win_by_2',
    hardPointCap: null,
    rotationSystem: 'winner_stays',
    maxConsecutiveGames: 3,
    initialCourtTeams: ['team-a', 'team-b'],
    initialQueue: [],
    queuePolicy: 'fifo',
    ...overrides,
  };
}

export function makeSession(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    communityId: null,
    name: `Sessão ${id}`,
    date: '2026-01-01',
    status: 'active',
    type: 'free_play',
    selectedPlayerIds: [],
    teamIds: ['team-a', 'team-b'],
    config: makeFreePlayConfig(),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeGame(id: string, sessionId: string, overrides: Partial<Game> = {}): Game {
  return {
    id,
    sessionId,
    type: 'free_play',
    sequenceNumber: 1,
    teamAId: 'team-a',
    teamBId: 'team-b',
    scoreA: 0,
    scoreB: 0,
    status: 'active',
    startedAt: NOW,
    pointIds: [],
    ...overrides,
  };
}
