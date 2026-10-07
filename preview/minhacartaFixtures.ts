import type { Attributes, Community, Game, PointEvent, Session, Team } from '../src/types';
import { buildMyCards, type MyCard } from '../src/application/myCards';
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

const comunidade = (id: string, name: string): Community => ({
  id,
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

export const TERCA = comunidade('terca', 'Vôlei de Terça');
export const QUINTA = comunidade('quinta', 'Quinta na Areia');
export const PARQUE = comunidade(
  'parque',
  'Panelinha do Parque Barigui — quadra 2, turma das terças e quintas',
);
export const ABERTA = comunidade('aberta', 'Rachão de Domingo');
export const SEM_NOTA = comunidade('sem-nota', 'Clube dos Calouros');
export const CARREGANDO = comunidade('carregando', 'Vôlei da Firma');

export const ANA = makePlayer('ana', {
  nome: 'Ana Souza',
  apelido: 'Ana',
  genero: 'F',
  posicaoPrincipal: 'ponteiro',
  atributos: atributos(7),
  communityIds: [TERCA.id, QUINTA.id, PARQUE.id, ABERTA.id, SEM_NOTA.id, CARREGANDO.id],
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
  communityId: string;
  date: string;
  jogos: number;
  vitoriasDeA: number;
  pontos: Record<string, number>;
  assistenciasDaAna?: number;
  defesas?: Record<string, number>;
}

function montar(roteiros: Roteiro[]) {
  const sessions: Session[] = [];
  const teams: Team[] = [];
  const games: Game[] = [];
  const pointEvents: PointEvent[] = [];
  for (const r of roteiros) {
    sessions.push({
      id: r.id,
      communityId: r.communityId,
      name: r.id,
      date: r.date,
      status: 'finished',
    } as Session);
    const a = `${r.id}-a`;
    const b = `${r.id}-b`;
    teams.push(
      { id: a, sessionId: r.id, name: 'Azul', playerIds: ['ana', 'caio'] } as Team,
      { id: b, sessionId: r.id, name: 'Laranja', playerIds: ['bia', 'duda'] } as Team,
    );
    let assistencias = r.assistenciasDaAna ?? 0;
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
      const ponto = (playerId: string, skill: PointEvent['skill'], extra = {}) => {
        seq += 1;
        const time = ['ana', 'caio'].includes(playerId) ? a : b;
        pointEvents.push({
          id: `${gameId}-${playerId}-${seq}`,
          sessionId: r.id,
          gameId,
          sequenceNumber: seq,
          pointType: 'winner',
          skill,
          playerId,
          scoringTeamId: time,
          concedingTeamId: time === a ? b : a,
          scoreBefore: { teamA: 0, teamB: 0 },
          scoreAfter: { teamA: 0, teamB: 0 },
          timestamp: `${r.date}T20:00:00.000Z`,
          ...extra,
        } as PointEvent);
      };
      for (const [playerId, total] of Object.entries(r.pontos)) {
        const porJogo = Math.floor(total / r.jogos) + (n < total % r.jogos ? 1 : 0);
        for (let p = 0; p < porJogo; p += 1) {
          if (playerId === 'caio' && assistencias > 0) {
            assistencias -= 1;
            ponto(playerId, 'ataque', { assistPlayerId: 'ana' });
          } else {
            ponto(playerId, playerId === 'duda' ? 'levantamento' : 'ataque');
          }
        }
      }
      if (n === 0) {
        for (const [playerId, total] of Object.entries(r.defesas ?? {})) {
          for (let p = 0; p < total; p += 1) ponto(playerId, 'defesa');
        }
      }
    }
  }
  return { sessions, teams, games, pointEvents, players: JOGADORES, sessionReports: [] };
}

const comum = { jogos: 2, vitoriasDeA: 1, pontos: { ana: 4, bia: 5, caio: 3, duda: 2 } };
const mvp = { jogos: 5, vitoriasDeA: 4, pontos: { ana: 23, bia: 9, caio: 8, duda: 4 } };
const maestro = {
  jogos: 3,
  vitoriasDeA: 1,
  pontos: { ana: 3, bia: 16, caio: 9, duda: 4 },
  assistenciasDaAna: 9,
};
const muralha = {
  jogos: 3,
  vitoriasDeA: 1,
  pontos: { ana: 3, bia: 16, caio: 5, duda: 4 },
  defesas: { ana: 6, duda: 1 },
};

const ROTEIROS: Roteiro[] = [
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `terca-${i + 1}`,
    communityId: TERCA.id,
    date: `2026-0${1 + Math.floor(i / 2)}-${String(3 + (i % 2) * 14).padStart(2, '0')}`,
    ...comum,
  })),
  { id: 'terca-mvp-1', communityId: TERCA.id, date: '2026-06-02', ...mvp },
  { id: 'terca-maestro', communityId: TERCA.id, date: '2026-08-11', ...maestro },
  { id: 'terca-mvp-2', communityId: TERCA.id, date: '2026-09-22', ...mvp },
  { id: 'terca-ultima', communityId: TERCA.id, date: '2026-10-04', ...mvp },
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `quinta-${i + 1}`,
    communityId: QUINTA.id,
    date: `2026-0${3 + i}-12`,
    ...comum,
  })),
  { id: 'quinta-muralha', communityId: QUINTA.id, date: '2026-09-17', ...muralha },
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `parque-${i + 1}`,
    communityId: PARQUE.id,
    date: `2026-0${5 + i}-20`,
    ...comum,
  })),
  { id: 'parque-maestro', communityId: PARQUE.id, date: '2026-07-25', ...maestro },
  { id: 'sem-nota-1', communityId: SEM_NOTA.id, date: '2026-09-28', ...comum },
  { id: 'carregando-1', communityId: CARREGANDO.id, date: '2026-09-30', ...comum },
];

const HISTORICO = montar(ROTEIROS);

const notas = (nivel: number): Map<string, Partial<Attributes>> =>
  new Map([
    ['ana', atributos(nivel)],
    ['bia', atributos(6)],
    ['caio', atributos(6)],
    ['duda', atributos(5)],
  ]);

const NOTAS = new Map<string, Map<string, Partial<Attributes>> | undefined>([
  [TERCA.id, notas(8)],
  [QUINTA.id, notas(6)],
  [PARQUE.id, notas(5)],
  [ABERTA.id, notas(6)],
  [SEM_NOTA.id, new Map()],
  [CARREGANDO.id, undefined],
]);

function cartas(communities: Community[]): MyCard[] {
  return buildMyCards({
    player: ANA,
    communities,
    history: HISTORICO,
    skillValuesByCommunity: NOTAS,
  });
}

export const CARTAS_TRES = cartas([TERCA, QUINTA, PARQUE]);
export const CARTAS_UMA = cartas([TERCA]);
export const CARTAS_SEM_PELADA = cartas([TERCA, ABERTA]);
export const CARTAS_SEM_AVALIACAO = cartas([TERCA, SEM_NOTA]);
export const CARTAS_CARREGANDO = cartas([TERCA, CARREGANDO]);
export const CARTAS_NENHUMA: MyCard[] = [];
