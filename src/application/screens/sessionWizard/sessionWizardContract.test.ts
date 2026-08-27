import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionWizardContract } from './sessionWizardContract';
import type { SessionWizardHookApi } from './sessionWizardContract';

function spy() {
  const calls: unknown[][] = [];
  const fn = (...a: unknown[]) => {
    calls.push(a);
  };
  return { fn, calls };
}

type Spy = ReturnType<typeof spy>;

function makeHookApi(overrides: Partial<Record<keyof SessionWizardHookApi, unknown>> = {}) {
  const noop = { fn: () => {} };
  const base: Record<string, unknown> = {
    wizardStep: 0,
    validationErrors: {},
    bestDivisions: [],
    setBestDivisions: noop,
    selectedDivisionIndex: 0,
    setSelectedDivisionIndex: noop,
    isGenerating: false,
    progress: 0,
    nextStep: noop,
    prevStep: noop,
    updateSession: noop,
    togglePlayer: noop,
    selectAllActivePlayers: noop,
    clearSelectedPlayers: noop,
    useLastSelection: noop,
    validateCurrentStep: () => true,
    generateDivisions: noop,
    cancelGeneration: noop,
    confirmDivision: noop,
    startGeneratedTournament: noop,
    cancelWizard: noop,
    togglePlayerLock: noop,
    addPairConstraint: noop,
    removePairConstraint: noop,
    partnershipMatrix: undefined,
  };
  for (const [k, v] of Object.entries(overrides)) base[k] = v;
  return base as unknown as SessionWizardHookApi;
}

function makeInput(
  hookApi: SessionWizardHookApi,
  applyGuestPlayer: (...a: never[]) => void = () => {},
) {
  return {
    activeSession: null,
    players: [],
    communities: [],
    hookApi,
    applyGuestPlayer,
  };
}

test('next despacha nextStep quando validateCurrentStep é true', async () => {
  const nextStep = spy();
  const c = buildSessionWizardContract(
    makeInput(
      makeHookApi({
        nextStep: nextStep.fn as never,
        validateCurrentStep: ((): boolean => true) as never,
      }),
    ),
  );
  await c.dispatch({ kind: 'next' });
  assert.equal(nextStep.calls.length, 1);
});

test('next não despacha nextStep quando validateCurrentStep é false', async () => {
  const nextStep = spy();
  const c = buildSessionWizardContract(
    makeInput(
      makeHookApi({
        nextStep: nextStep.fn as never,
        validateCurrentStep: ((): boolean => false) as never,
      }),
    ),
  );
  await c.dispatch({ kind: 'next' });
  assert.equal(nextStep.calls.length, 0);
});

test('prev despacha prevStep', async () => {
  const prevStep = spy();
  const c = buildSessionWizardContract(makeInput(makeHookApi({ prevStep: prevStep.fn as never })));
  await c.dispatch({ kind: 'prev' });
  assert.equal(prevStep.calls.length, 1);
});

test('cancel despacha cancelWizard', async () => {
  const cancelWizard = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ cancelWizard: cancelWizard.fn as never })),
  );
  await c.dispatch({ kind: 'cancel' });
  assert.equal(cancelWizard.calls.length, 1);
});

test('updateSession repassa o patch', async () => {
  const updateSession = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ updateSession: updateSession.fn as never })),
  );
  const patch = { name: 'X' };
  await c.dispatch({ kind: 'updateSession', patch });
  assert.equal(updateSession.calls.length, 1);
  assert.deepEqual(updateSession.calls[0], [patch]);
});

test('togglePlayer repassa o id', async () => {
  const togglePlayer = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ togglePlayer: togglePlayer.fn as never })),
  );
  await c.dispatch({ kind: 'togglePlayer', id: 'p1' });
  assert.deepEqual(togglePlayer.calls[0], ['p1']);
});

test('selectAllActive despacha selectAllActivePlayers', async () => {
  const selectAllActivePlayers = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ selectAllActivePlayers: selectAllActivePlayers.fn as never })),
  );
  await c.dispatch({ kind: 'selectAllActive' });
  assert.equal(selectAllActivePlayers.calls.length, 1);
});

test('clearSelection despacha clearSelectedPlayers', async () => {
  const clearSelectedPlayers = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ clearSelectedPlayers: clearSelectedPlayers.fn as never })),
  );
  await c.dispatch({ kind: 'clearSelection' });
  assert.equal(clearSelectedPlayers.calls.length, 1);
});

test('useLastSelection despacha useLastSelection da hook', async () => {
  const useLastSelection = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ useLastSelection: useLastSelection.fn as never })),
  );
  await c.dispatch({ kind: 'useLastSelection' });
  assert.equal(useLastSelection.calls.length, 1);
});

test('generateDivisions repassa advanceStep', async () => {
  const generateDivisions = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ generateDivisions: generateDivisions.fn as never })),
  );
  await c.dispatch({ kind: 'generateDivisions', advanceStep: false });
  assert.deepEqual(generateDivisions.calls[0], [false]);
});

test('cancelGeneration despacha cancelGeneration da hook', async () => {
  const cancelGeneration = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ cancelGeneration: cancelGeneration.fn as never })),
  );
  await c.dispatch({ kind: 'cancelGeneration' });
  assert.equal(cancelGeneration.calls.length, 1);
});

test('confirmDivision despacha confirmDivision da hook', async () => {
  const confirmDivision = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ confirmDivision: confirmDivision.fn as never })),
  );
  await c.dispatch({ kind: 'confirmDivision' });
  assert.equal(confirmDivision.calls.length, 1);
});

test('startGeneratedTournament despacha startGeneratedTournament da hook', async () => {
  const startGeneratedTournament = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ startGeneratedTournament: startGeneratedTournament.fn as never })),
  );
  await c.dispatch({ kind: 'startGeneratedTournament' });
  assert.equal(startGeneratedTournament.calls.length, 1);
});

test('selectDivisionIndex despacha setSelectedDivisionIndex com o índice', async () => {
  const setSelectedDivisionIndex = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ setSelectedDivisionIndex: setSelectedDivisionIndex.fn as never })),
  );
  await c.dispatch({ kind: 'selectDivisionIndex', index: 2 });
  assert.deepEqual(setSelectedDivisionIndex.calls[0], [2]);
});

test('togglePlayerLock repassa playerId e teamIdx', async () => {
  const togglePlayerLock = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ togglePlayerLock: togglePlayerLock.fn as never })),
  );
  await c.dispatch({ kind: 'togglePlayerLock', playerId: 'p1', teamIdx: 1 });
  assert.deepEqual(togglePlayerLock.calls[0], ['p1', 1]);
});

test('addPairConstraint repassa p1, p2, type', async () => {
  const addPairConstraint = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ addPairConstraint: addPairConstraint.fn as never })),
  );
  await c.dispatch({ kind: 'addPairConstraint', p1: 'a', p2: 'b', type: 'together' });
  assert.deepEqual(addPairConstraint.calls[0], ['a', 'b', 'together']);
});

test('removePairConstraint repassa p1, p2, type', async () => {
  const removePairConstraint = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ removePairConstraint: removePairConstraint.fn as never })),
  );
  await c.dispatch({ kind: 'removePairConstraint', p1: 'a', p2: 'b', type: 'separated' });
  assert.deepEqual(removePairConstraint.calls[0], ['a', 'b', 'separated']);
});

test('setBestDivisions despacha setBestDivisions da hook com as divisões', async () => {
  const setBestDivisions = spy();
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ setBestDivisions: setBestDivisions.fn as never })),
  );
  const divisions = [] as never;
  await c.dispatch({ kind: 'setBestDivisions', divisions });
  assert.deepEqual(setBestDivisions.calls[0], [divisions]);
});

test('addGuestPlayer chama applyGuestPlayer, não a hook', async () => {
  const applyGuestPlayer = spy() as unknown as Spy;
  const c = buildSessionWizardContract(makeInput(makeHookApi(), applyGuestPlayer.fn as never));
  const player = { id: 'p1' } as never;
  await c.dispatch({ kind: 'addGuestPlayer', player, editDetails: true });
  assert.equal(applyGuestPlayer.calls.length, 1);
  assert.deepEqual(applyGuestPlayer.calls[0], [player, true]);
});

test('buildModel projeta campos da hook API no Model', () => {
  const c = buildSessionWizardContract(
    makeInput(makeHookApi({ wizardStep: 3, isGenerating: true, progress: 42 } as never)),
  );
  assert.equal(c.model.wizardStep, 3);
  assert.equal(c.model.isGenerating, true);
  assert.equal(c.model.generationProgress, 42);
});

test('buildModel expõe stepLabels, positionLabels e positionOrder', () => {
  const c = buildSessionWizardContract(makeInput(makeHookApi()));
  assert.equal(c.model.stepLabels.length, 7);
  assert.equal(c.model.positionOrder.length, 6);
  assert.equal(c.model.positionLabels['levantador'], 'Levantador');
});
