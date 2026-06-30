import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSessionWizardStep, hasPlayableRuleSnapshot, getFreePlaySetupConfig } from './sessionSetup';
import { makeFreePlayConfig, makeSession } from '../test/fixtures';
import type { TournamentConfig } from '../types';

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
