import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePhase, phasePermissions, isTerminalGame } from './sessionPhase';
import type { Game, Session, SessionStatus, GameStatus } from '@shared/types';

const session = (status: SessionStatus): Session =>
  ({
    id: 's1',
    name: 'Sessao',
    date: '2026-08-10',
    status,
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '2026-08-10T00:00:00Z',
    updatedAt: '2026-08-10T00:00:00Z',
  }) as Session;

const game = (status: GameStatus): Game =>
  ({
    id: 'g' + status,
    sessionId: 's1',
    status,
  }) as Game;

test('sessao sem objeto e rascunho', () => {
  assert.equal(derivePhase(null, []), 'rascunho');
});

test('status de configuracao viram rascunho', () => {
  for (const s of ['draft', 'players_selected', 'configured'] as SessionStatus[]) {
    assert.equal(derivePhase(session(s), []), 'rascunho');
  }
});

test('teams_generated vira times_gerados', () => {
  assert.equal(derivePhase(session('teams_generated'), []), 'times_gerados');
});

test('ativa sem nenhum jogo e pronta, nao em andamento', () => {
  assert.equal(derivePhase(session('active'), []), 'pronta');
});

test('ativa com jogo apenas agendado continua pronta', () => {
  assert.equal(derivePhase(session('active'), [game('scheduled')]), 'pronta');
});

test('ativa com jogo ativo e em_andamento', () => {
  assert.equal(derivePhase(session('active'), [game('scheduled'), game('active')]), 'em_andamento');
});

test('ativa com jogo terminal e nenhum ativo e entre_partidas', () => {
  assert.equal(
    derivePhase(session('active'), [game('finished'), game('scheduled')]),
    'entre_partidas',
  );
});

test('walkover conta como jogo terminal', () => {
  assert.equal(derivePhase(session('active'), [game('walkover')]), 'entre_partidas');
  assert.equal(isTerminalGame(game('walkover')), true);
  assert.equal(isTerminalGame(game('cancelled')), true);
  assert.equal(isTerminalGame(game('scheduled')), false);
});

test('pausada vence a existencia de jogo ativo', () => {
  assert.equal(derivePhase(session('paused'), [game('active')]), 'pausada');
});

test('encerrada vence tudo, inclusive jogo ativo orfao', () => {
  assert.equal(derivePhase(session('finished'), [game('active')]), 'encerrada');
  assert.equal(derivePhase(session('cancelled'), [game('active')]), 'encerrada');
});

test('jogos de outra sessao sao ignorados', () => {
  const alheio = { id: 'gx', sessionId: 'outra', status: 'active' } as Game;
  assert.equal(derivePhase(session('active'), [alheio]), 'pronta');
});

test('pausada nao permite iniciar', () => {
  const p = phasePermissions('pausada');
  assert.equal(p.podeIniciar, false);
  assert.equal(p.podeRetomar, true);
  assert.equal(p.podePontuar, false);
});

test('pronta permite iniciar e pausar mas nao pontuar', () => {
  const p = phasePermissions('pronta');
  assert.equal(p.podeIniciar, true);
  assert.equal(p.podePausar, true);
  assert.equal(p.podePontuar, false);
});

test('entre_partidas tambem permite pausar', () => {
  const p = phasePermissions('entre_partidas');
  assert.equal(p.podeIniciar, true);
  assert.equal(p.podePausar, true);
  assert.equal(p.podePontuar, false);
});

test('em_andamento permite pontuar e pausar, nao iniciar', () => {
  const p = phasePermissions('em_andamento');
  assert.equal(p.podePontuar, true);
  assert.equal(p.podePausar, true);
  assert.equal(p.podeIniciar, false);
});

test('encerrada nao permite nada alem de consultar', () => {
  const p = phasePermissions('encerrada');
  assert.deepEqual(p, {
    podeIniciar: false,
    podePausar: false,
    podeRetomar: false,
    podeEncerrar: false,
    podePontuar: false,
  });
});
