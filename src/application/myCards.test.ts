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
