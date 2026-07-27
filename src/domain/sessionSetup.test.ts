import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSessionWizardStep,
  hasPlayableRuleSnapshot,
  getFreePlaySetupConfig,
  addPlayerPairConstraint,
  removePlayerPairConstraint,
  selectPlayablePlayerIds,
  toggleLockedPlayerTeam,
  toggleSessionPlayerSelection,
} from './sessionSetup';
import { makeFreePlayConfig, makeSession } from '../test/fixtures';
import type { Player, TournamentConfig } from '../types';

test('step 0 requires name and date', () => {
  const errors = validateSessionWizardStep(makeSession('s1', { name: ' ', date: '' }), 0);

  assert.equal(errors.name, 'O nome da sessão é obrigatório.');
  assert.equal(errors.date, 'A data é obrigatória.');
});

test('step 1 requires at least four selected athletes', () => {
  const errors = validateSessionWizardStep(
    makeSession('s1', { selectedPlayerIds: ['p1', 'p2', 'p3'] }),
    1,
  );

  assert.equal(errors.players, 'Selecione pelo menos 4 atletas.');
});

test('free play step 3 requires enough players and at least three teams', () => {
  const errors = validateSessionWizardStep(
    makeSession('s1', {
      type: 'free_play',
      selectedPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      config: makeFreePlayConfig({ teamCount: 2 }),
    }),
    3,
  );

  assert.equal(errors.teamCount, 'Jogo livre exige pelo menos 3 times.');
});

test('free play step 3 requires enough selected players for team count', () => {
  const errors = validateSessionWizardStep(
    makeSession('s1', {
      type: 'free_play',
      selectedPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      config: makeFreePlayConfig({ teamCount: 3 }),
    }),
    3,
  );

  assert.equal(errors.teamCount, 'Para 3 times, selecione pelo menos 9 jogadores.');
});

test('tournament group formats require at least four teams', () => {
  const errors = validateSessionWizardStep(
    makeSession('s1', {
      type: 'tournament',
      selectedPlayerIds: Array.from({ length: 12 }, (_, index) => `p${index}`),
      config: {
        type: 'tournament',
        format: 'group_stage',
        teamCount: 3,
        useGroupStage: true,
        roundTrip: false,
        maxPoints: 12,
        tieBreakMethod: 'direct_3',
        hasFinal: true,
        hasThirdPlaceMatch: true,
        classificationPoints: { win: 3, loss: 0 },
        standingsRules: ['wins'],
      },
    }),
    3,
  );

  assert.equal(errors.teamCount, 'Fase de grupos exige pelo menos 4 times.');
});

test('hasPlayableRuleSnapshot requires matching session and config types', () => {
  assert.equal(
    hasPlayableRuleSnapshot(
      makeSession('s1', {
        type: 'free_play',
        config: makeFreePlayConfig({ type: 'free_play' }),
      }),
    ),
    true,
  );
  assert.equal(
    hasPlayableRuleSnapshot(
      makeSession('s2', {
        type: 'tournament',
        config: makeFreePlayConfig({ type: 'free_play' }),
      }),
    ),
    false,
  );
});

test('getFreePlaySetupConfig returns matching free play config', () => {
  const config = makeFreePlayConfig({ teamCount: 4 });
  const session = makeSession('s1', {
    type: 'free_play',
    config,
  });

  assert.equal(getFreePlaySetupConfig(session), config);
});

test('getFreePlaySetupConfig returns null for free play session with tournament config', () => {
  const session = makeSession('s1', {
    type: 'free_play',
    config: makeTournamentConfig(),
  });

  assert.equal(getFreePlaySetupConfig(session), null);
});

test('getFreePlaySetupConfig returns null for tournament session', () => {
  const session = makeSession('s1', {
    type: 'tournament',
    config: makeTournamentConfig(),
  });

  assert.equal(getFreePlaySetupConfig(session), null);
});

test('toggleSessionPlayerSelection adds and removes a player id', () => {
  assert.deepEqual(toggleSessionPlayerSelection(['p1'], 'p2'), ['p1', 'p2']);
  assert.deepEqual(toggleSessionPlayerSelection(['p1', 'p2'], 'p1'), ['p2']);
});

test('selectPlayablePlayerIds returns only active and healthy players', () => {
  const players = [
    player('active'),
    player('inactive', { ativo: false }),
    player('injured', {
      status: { lesionado: true, limitacaoFisica: null, presencaFrequente: true },
    }),
  ];

  assert.deepEqual(selectPlayablePlayerIds(players), ['active']);
});

test('toggleLockedPlayerTeam adds switches and removes locked team constraints', () => {
  const config = makeFreePlayConfig();
  const locked = toggleLockedPlayerTeam(config, 'p1', 0);
  const switched = toggleLockedPlayerTeam(locked, 'p1', 1);
  const removed = toggleLockedPlayerTeam(switched, 'p1', 1);

  // Session['config'] e opcional, entao o retorno e possivelmente undefined. Afirmar
  // que veio preenchido faz parte do contrato sob teste — nao e ruido de tipo.
  assert.ok(locked);
  assert.ok(switched);
  assert.ok(removed);

  assert.equal(locked.balanceConstraints?.lockedPlayerIdxs?.p1, 0);
  assert.equal(switched.balanceConstraints?.lockedPlayerIdxs?.p1, 1);
  assert.deepEqual(removed.balanceConstraints?.lockedPlayerIdxs, {});
});

test('player pair constraints are unique and removable regardless of pair order', () => {
  const withPair = addPlayerPairConstraint(makeFreePlayConfig(), 'p1', 'p2', 'together');
  const duplicate = addPlayerPairConstraint(withPair, 'p2', 'p1', 'together');
  const separated = addPlayerPairConstraint(duplicate, 'p1', 'p3', 'separated');
  const removed = removePlayerPairConstraint(separated, 'p2', 'p1', 'together');

  assert.ok(withPair);
  assert.ok(duplicate);
  assert.ok(separated);
  assert.ok(removed);

  assert.deepEqual(withPair.balanceConstraints?.pairsTogether, [['p1', 'p2']]);
  assert.deepEqual(duplicate.balanceConstraints?.pairsTogether, [['p1', 'p2']]);
  assert.deepEqual(separated.balanceConstraints?.pairsSeparated, [['p1', 'p3']]);
  assert.deepEqual(removed.balanceConstraints?.pairsTogether, []);
  assert.deepEqual(removed.balanceConstraints?.pairsSeparated, [['p1', 'p3']]);
});

function makeTournamentConfig(): TournamentConfig {
  return {
    type: 'tournament',
    format: 'knockout',
    teamCount: 4,
    useGroupStage: false,
    roundTrip: false,
    maxPoints: 12,
    tieBreakMethod: 'direct_3',
    hasFinal: true,
    hasThirdPlaceMatch: true,
    classificationPoints: { win: 3, loss: 0 },
    standingsRules: ['wins'],
  };
}

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    nome: id,
    apelido: id,
    genero: 'M',
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
    perfil: { nivel: 1, classe: '', arquetipo: '', especialidade: '', fraqueza: '' },
    formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
    status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
    metadata: { criadoEm: '2026-01-01T12:00:00.000Z', atualizadoEm: '2026-01-01T12:00:00.000Z' },
    ...overrides,
  };
}
