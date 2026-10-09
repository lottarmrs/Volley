import test from 'node:test';
import assert from 'node:assert/strict';
import type { Community, Game, Player, Session, Team } from '@shared/types';
import { buildMyCards } from './myCards';

const ana = {
  id: 'ana',
  nome: 'Ana',
  apelido: 'Ana',
  genero: 'F',
  ativo: true,
  posicaoPrincipal: 'ponteiro',
  posicoesSecundarias: [],
  maoDominante: 'direita',
  atributos: {},
  perfil: { nivel: 3, classe: '', arquetipo: '', especialidade: '', fraqueza: '' },
  formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
  status: { lesionado: false, limitacaoFisica: null },
  metadata: { criadoEm: '2026-01-01', atualizadoEm: '2026-01-01' },
  communityIds: ['c1', 'c2', 'c3'],
} as unknown as Player;

const comunidades = [
  { id: 'c1', name: 'Terça' },
  { id: 'c2', name: 'Quinta' },
  { id: 'c3', name: 'Aberta' },
  { id: 'c4', name: 'De outra pessoa' },
] as unknown as Community[];

function pelada(sid: string, communityId: string, date: string) {
  return {
    session: { id: sid, communityId, name: sid, date, status: 'finished' } as unknown as Session,
    teams: [
      { id: `${sid}-a`, sessionId: sid, name: 'A', playerIds: ['ana'] },
      { id: `${sid}-b`, sessionId: sid, name: 'B', playerIds: ['bia'] },
    ] as unknown as Team[],
    games: [
      {
        id: `${sid}-g`,
        sessionId: sid,
        teamAId: `${sid}-a`,
        teamBId: `${sid}-b`,
        scoreA: 15,
        scoreB: 10,
        winnerTeamId: `${sid}-a`,
        status: 'finished',
      },
    ] as unknown as Game[],
  };
}

const peladas = [
  pelada('s1', 'c1', '2026-09-01'),
  pelada('s3', 'c1', '2026-08-15'),
  pelada('s2', 'c2', '2026-09-20'),
];
const history = {
  sessions: peladas.map((p) => p.session),
  teams: peladas.flatMap((p) => p.teams),
  games: peladas.flatMap((p) => p.games),
  pointEvents: [],
  players: [ana],
  sessionReports: [],
};

test('uma carta por comunidade do elenco, ordenada pela ultima pelada jogada', () => {
  const cartas = buildMyCards({
    player: ana,
    communities: comunidades,
    history,
    skillValuesByCommunity: new Map([
      ['c1', new Map([['ana', { ataque: 8 }]])],
      ['c2', new Map([['ana', { ataque: 6 }]])],
      ['c3', new Map()],
    ]),
  });
  assert.deepEqual(
    cartas.map((c) => c.community.id),
    ['c2', 'c1', 'c3'],
  );
  assert.equal(cartas[0].lastPlayedAt, '2026-09-20');
  assert.equal(cartas[2].lastPlayedAt, null);
});

test('o historico de uma carta nao vaza para outra', () => {
  const cartas = buildMyCards({
    player: ana,
    communities: comunidades,
    history,
    skillValuesByCommunity: new Map([
      ['c1', new Map()],
      ['c2', new Map()],
      ['c3', new Map()],
    ]),
  });
  const c1 = cartas.find((c) => c.community.id === 'c1')!;
  const c2 = cartas.find((c) => c.community.id === 'c2')!;
  assert.equal(c1.lastPlayedAt, '2026-09-01');
  assert.equal(c2.lastPlayedAt, '2026-09-20');
  const cria = (c: typeof c1) => c.card.achievements.find((a) => a.id === 'shared_cria')!;
  assert.equal(cria(c1).current, 2);
  assert.equal(cria(c2).current, 1);
});

test('comunidade sem pelada: album sem desbloqueadas e sem perto; sem avaliacao: carta "?"', () => {
  const cartas = buildMyCards({
    player: ana,
    communities: comunidades,
    history,
    skillValuesByCommunity: new Map([
      ['c1', new Map()],
      ['c2', new Map()],
      ['c3', new Map()],
    ]),
  });
  const aberta = cartas.find((c) => c.community.id === 'c3')!;
  assert.deepEqual(
    aberta.achievements.unlocked.map((a) => a.id),
    ['shared_qualquer'],
  );
  assert.deepEqual(
    aberta.achievements.near.map((a) => a.id),
    ['shared_selecao'],
  );
  assert.equal(aberta.editions.length, 0);
  assert.equal(aberta.card.achievements.find((a) => a.id === 'shared_cria')!.current, 0);
  assert.equal(aberta.card.stats.rated, false);
  assert.equal(aberta.loading, false);
});

test('numeros ainda nao chegaram: carta carregando', () => {
  const cartas = buildMyCards({
    player: ana,
    communities: comunidades,
    history,
    skillValuesByCommunity: new Map([['c1', undefined]]),
  });
  assert.equal(cartas.find((c) => c.community.id === 'c1')!.loading, true);
});

test('jogo e fundamentos: numeros da comunidade, sem vazar de outra', () => {
  const cartas = buildMyCards({
    player: ana,
    communities: comunidades,
    history,
    skillValuesByCommunity: new Map([
      ['c1', new Map([['ana', { ataque: 8 }]])],
      ['c2', new Map()],
      ['c3', new Map()],
    ]),
  });
  const c1 = cartas.find((c) => c.community.id === 'c1')!;
  const c3 = cartas.find((c) => c.community.id === 'c3')!;
  assert.deepEqual(c1.jogo, { peladas: 2, jogos: 2, vitorias: 2, aproveitamento: 100, pontos: 0 });
  assert.deepEqual(c1.fundamentos, { ataque: 8 });
  assert.deepEqual(c3.jogo, { peladas: 0, jogos: 0, vitorias: 0, aproveitamento: 0, pontos: 0 });
  assert.equal(c3.fundamentos, null);
});

test('estava num time, mas o time nao jogou jogo encerrado: a pelada nao conta', () => {
  const banco = {
    id: 's4',
    communityId: 'c3',
    name: 's4',
    date: '2026-09-30',
    status: 'finished',
  } as unknown as Session;
  const timesDoBanco = [
    { id: 's4-a', sessionId: 's4', name: 'A', playerIds: ['ana'] },
    { id: 's4-b', sessionId: 's4', name: 'B', playerIds: ['bia'] },
    { id: 's4-c', sessionId: 's4', name: 'C', playerIds: ['cris'] },
  ] as unknown as Team[];
  const jogosDoBanco = [
    {
      id: 's4-g1',
      sessionId: 's4',
      teamAId: 's4-b',
      teamBId: 's4-c',
      scoreA: 15,
      scoreB: 10,
      winnerTeamId: 's4-b',
      status: 'finished',
    },
    {
      id: 's4-g2',
      sessionId: 's4',
      teamAId: 's4-a',
      teamBId: 's4-b',
      scoreA: 0,
      scoreB: 0,
      status: 'in_progress',
    },
  ] as unknown as Game[];
  const cartas = buildMyCards({
    player: ana,
    communities: comunidades,
    history: {
      ...history,
      sessions: [...history.sessions, banco],
      teams: [...history.teams, ...timesDoBanco],
      games: [...history.games, ...jogosDoBanco],
    },
    skillValuesByCommunity: new Map([
      ['c1', new Map()],
      ['c2', new Map()],
      ['c3', new Map()],
    ]),
  });
  const c3 = cartas.find((c) => c.community.id === 'c3')!;
  assert.equal(c3.jogo.peladas, 0);
  assert.equal(c3.lastPlayedAt, null);
  assert.deepEqual(
    cartas.map((c) => c.community.id),
    ['c2', 'c1', 'c3'],
  );
});

test('numeros da avaliacao falharam: carta com erro, nao carregando', () => {
  const cartas = buildMyCards({
    player: ana,
    communities: comunidades,
    history,
    skillValuesByCommunity: new Map([
      ['c1', undefined],
      ['c2', new Map()],
      ['c3', new Map()],
    ]),
    erros: new Set(['c1']),
  });
  const c1 = cartas.find((c) => c.community.id === 'c1')!;
  assert.equal(c1.erro, true);
  assert.equal(c1.loading, false);
  assert.equal(cartas.find((c) => c.community.id === 'c2')!.erro, false);
});
