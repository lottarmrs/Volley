import test from 'node:test';
import assert from 'node:assert/strict';
import type { Game, Player, PointEvent, Session, Team } from '@shared/types';
import { buildAthleteNight } from './athleteNight';

const atleta = (id: string) =>
  ({
    id,
    nome: id,
    apelido: id,
    genero: 'F',
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
    perfil: { nivel: 3, classe: '', arquetipo: '', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null },
    metadata: { criadoEm: '2026-01-01', atualizadoEm: '2026-01-01' },
  }) as unknown as Player;

const ana = atleta('ana');
const bia = atleta('bia');

const pelada = (id: string, date: string) =>
  ({ id, name: id, date, status: 'finished' }) as unknown as Session;

const timesDe = (sid: string) =>
  [
    { id: `${sid}-a`, sessionId: sid, name: 'A', playerIds: ['ana'] },
    { id: `${sid}-b`, sessionId: sid, name: 'B', playerIds: ['bia'] },
  ] as unknown as Team[];

const jogo = (sid: string, n: number) =>
  ({
    id: `${sid}-g${n}`,
    sessionId: sid,
    teamAId: `${sid}-a`,
    teamBId: `${sid}-b`,
    scoreA: 25,
    scoreB: 18,
    winnerTeamId: `${sid}-a`,
    status: 'finished',
  }) as unknown as Game;

const ponto = (sid: string, gameId: string, n: number) =>
  ({
    id: `${gameId}-p${n}`,
    sessionId: sid,
    gameId,
    sequenceNumber: n,
    pointType: 'winner',
    skill: 'ataque',
    playerId: 'ana',
    scoringTeamId: `${sid}-a`,
    concedingTeamId: `${sid}-b`,
    scoreBefore: { teamA: n - 1, teamB: 0 },
    scoreAfter: { teamA: n, teamB: 0 },
    timestamp: '2026-06-01T20:00:00.000Z',
  }) as unknown as PointEvent;

function historico(sessoes: Session[]) {
  const teams = sessoes.flatMap((s) => timesDe(s.id));
  const games = sessoes.flatMap((s) => [jogo(s.id, 1), jogo(s.id, 2)]);
  const pointEvents = games.flatMap((g) => [1, 2, 3].map((n) => ponto(g.sessionId, g.id, n)));
  return {
    sessions: sessoes,
    teams,
    games,
    pointEvents,
    players: [ana, bia],
    sessionReports: [],
  };
}

test('a noite traz os numeros so daquela pelada', () => {
  const s1 = pelada('s1', '2026-06-01');
  const s2 = pelada('s2', '2026-06-08');
  const night = buildAthleteNight({ player: ana, session: s2, history: historico([s1, s2]) });
  assert.ok(night);
  assert.equal(night.sessionId, 's2');
  assert.equal(night.games, 2);
  assert.equal(night.wins, 2);
  assert.equal(night.points, 6);
  assert.equal(typeof night.rating, 'number');
});

test('conquista nova e a que nao existia antes da pelada', () => {
  const s1 = pelada('s1', '2026-06-01');
  const s2 = pelada('s2', '2026-06-08');
  const base = historico([s1, s2]);
  const extras = Array.from({ length: 100 }, (_, n) => ponto('s2', 's2-g1', n + 10));
  const history = { ...base, pointEvents: [...base.pointEvents, ...extras] };

  const night = buildAthleteNight({ player: ana, session: s2, history });
  assert.ok(night);
  assert.ok(night.newAchievements.map((a) => a.id).includes('shared_ponto'));
  assert.ok(night.card.achievements.find((a) => a.id === 'shared_ponto')?.unlocked);

  const anterior = buildAthleteNight({ player: ana, session: s1, history: historico([s1]) });
  assert.ok(anterior);
  assert.ok(!anterior.newAchievements.map((a) => a.id).includes('shared_ponto'));
  assert.ok(anterior.nearAchievements.length <= 2);
  assert.ok(anterior.nearAchievements.every((a) => !a.unlocked));
});

test('quem lidera a pelada ganha edicao especial', () => {
  const s1 = pelada('s1', '2026-06-01');
  const night = buildAthleteNight({ player: ana, session: s1, history: historico([s1]) });
  assert.ok(night);
  assert.equal(night.card.edition.kind, 'mvp');
  assert.equal(night.specialEdition, true);
});

test('noite sem nada novo ainda devolve numeros', () => {
  const s1 = pelada('s1', '2026-06-01');
  const night = buildAthleteNight({ player: bia, session: s1, history: historico([s1]) });
  assert.ok(night);
  assert.equal(night.wins, 0);
  assert.equal(night.games, 2);
});

test('quem nao jogou a pelada nao tem noite', () => {
  const s1 = pelada('s1', '2026-06-01');
  const ninguem = atleta('carla');
  assert.equal(buildAthleteNight({ player: ninguem, session: s1, history: historico([s1]) }), null);
});
