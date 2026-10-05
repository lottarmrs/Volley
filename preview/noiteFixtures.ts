import type { Game, Player, PointEvent, Session, Team } from '../src/types';
import type { BuildVutCardContext } from '../src/logic/futCards';
import { buildAthleteNight, type AthleteNight } from '../src/application/athleteNight';
import { makePlayer } from '../src/test/fixtures';

const atributos = (nivel: number) => ({
  saque: nivel,
  recepcao: nivel,
  levantamento: nivel - 1,
  ataque: nivel + 1,
  bloqueio: nivel,
  defesa: nivel,
  velocidade: nivel,
  resistencia: nivel,
  leituraDeJogo: nivel,
  regularidade: nivel,
  controleEmocional: nivel,
});

const ANA = makePlayer('ana', {
  nome: 'Ana Souza',
  apelido: 'Ana',
  genero: 'F',
  posicaoPrincipal: 'ponteiro',
  atributos: atributos(7),
});
const BIA = makePlayer('bia', {
  nome: 'Beatriz Lopes',
  apelido: 'Bia',
  genero: 'F',
  posicaoPrincipal: 'central',
  atributos: atributos(6),
});
const CAIO = makePlayer('caio', {
  nome: 'Caio Medeiros',
  apelido: 'Caião',
  posicaoPrincipal: 'oposto',
  atributos: atributos(6),
});
const DUDA = makePlayer('duda', {
  nome: 'Duda Rocha',
  apelido: 'Duda',
  genero: 'F',
  posicaoPrincipal: 'levantador',
  atributos: atributos(5),
});

const JOGADORES = [ANA, BIA, CAIO, DUDA];

interface Roteiro {
  id: string;
  date: string;
  jogos: number;
  vitoriasDeA: number;
  pontos: Record<string, number>;
}

function montar(roteiros: Roteiro[]): BuildVutCardContext {
  const sessions: Session[] = [];
  const teams: Team[] = [];
  const games: Game[] = [];
  const pointEvents: PointEvent[] = [];
  for (const r of roteiros) {
    sessions.push({ id: r.id, name: r.id, date: r.date, status: 'finished' } as Session);
    const a = `${r.id}-a`;
    const b = `${r.id}-b`;
    teams.push(
      { id: a, sessionId: r.id, name: 'Azul', playerIds: ['ana', 'caio'] } as Team,
      { id: b, sessionId: r.id, name: 'Laranja', playerIds: ['bia', 'duda'] } as Team,
    );
    for (let n = 0; n < r.jogos; n += 1) {
      const vence = n < r.vitoriasDeA ? a : b;
      const gameId = `${r.id}-g${n}`;
      games.push({
        id: gameId,
        sessionId: r.id,
        teamAId: a,
        teamBId: b,
        scoreA: vence === a ? 25 : 19,
        scoreB: vence === a ? 19 : 25,
        winnerTeamId: vence,
        status: 'finished',
      } as Game);
      let seq = 0;
      for (const [playerId, total] of Object.entries(r.pontos)) {
        const porJogo = Math.floor(total / r.jogos) + (n < total % r.jogos ? 1 : 0);
        const time = ['ana', 'caio'].includes(playerId) ? a : b;
        for (let p = 0; p < porJogo; p += 1) {
          seq += 1;
          pointEvents.push({
            id: `${gameId}-${playerId}-${p}`,
            sessionId: r.id,
            gameId,
            sequenceNumber: seq,
            pointType: 'winner',
            skill: playerId === 'duda' ? 'levantamento' : 'ataque',
            playerId,
            scoringTeamId: time,
            concedingTeamId: time === a ? b : a,
            scoreBefore: { teamA: 0, teamB: 0 },
            scoreAfter: { teamA: 0, teamB: 0 },
            timestamp: `${r.date}T20:00:00.000Z`,
          } as PointEvent);
        }
      }
    }
  }
  return { sessions, teams, games, pointEvents, players: JOGADORES, sessionReports: [] };
}

function noite(
  player: Player,
  roteiros: Roteiro[],
  extra: Partial<BuildVutCardContext> = {},
): AthleteNight {
  const history = { ...montar(roteiros), ...extra };
  const session = history.sessions[history.sessions.length - 1];
  const night = buildAthleteNight({ player, session, history });
  if (!night) throw new Error('A atleta não jogou a pelada do exemplo.');
  return night;
}

const anteriores = (quantas: number): Roteiro[] =>
  Array.from({ length: quantas }, (_, i) => ({
    id: `s${i + 1}`,
    date: `2026-0${1 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
    jogos: 2,
    vitoriasDeA: 1,
    pontos: { ana: 4, bia: 5, caio: 3, duda: 2 },
  }));

const DA_NOITE = '2026-10-04';

export const NOITE_MVP = noite(ANA, [
  ...anteriores(6),
  {
    id: 'hoje',
    date: DA_NOITE,
    jogos: 5,
    vitoriasDeA: 4,
    pontos: { ana: 23, bia: 9, caio: 8, duda: 4 },
  },
]);

const NOITE_DISCRETA_REAL = noite(DUDA, [
  ...anteriores(6),
  {
    id: 'hoje',
    date: DA_NOITE,
    jogos: 4,
    vitoriasDeA: 2,
    pontos: { ana: 8, bia: 10, caio: 6, duda: 3 },
  },
]);

export const NOITE_SO_NUMEROS: AthleteNight = {
  ...NOITE_DISCRETA_REAL,
  newAchievements: [],
  nearAchievements: [],
};

export const NOITE_TRES_CONQUISTAS = noite(BIA, [
  ...anteriores(19),
  {
    id: 'hoje',
    date: DA_NOITE,
    jogos: 12,
    vitoriasDeA: 4,
    pontos: { ana: 30, bia: 12, caio: 30, duda: 6 },
  },
]);

export const NOITE_SEM_AVALIACAO = noite(
  CAIO,
  [
    {
      id: 'hoje',
      date: DA_NOITE,
      jogos: 3,
      vitoriasDeA: 2,
      pontos: { ana: 7, bia: 9, caio: 6, duda: 2 },
    },
  ],
  { skillValues: new Map() },
);
