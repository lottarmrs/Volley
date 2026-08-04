import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryViewContract } from './historyViewContract';
import type { HistoryViewContractInput } from './historyViewContract';
import type { Session } from '@shared/types';

function spy() {
  const calls: unknown[][] = [];
  const fn = (...a: unknown[]) => {
    calls.push(a);
  };
  return { fn, calls };
}

type Spy = ReturnType<typeof spy>;

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    name: 'Sessão',
    type: 'free_play',
    status: 'finished',
    date: '2026-01-01',
    selectedPlayerIds: [],
    teamIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as Session;
}

function makeInput(overrides: Partial<HistoryViewContractInput> = {}): HistoryViewContractInput {
  return {
    sessions: [],
    games: [],
    pointEvents: [],
    teams: [],
    players: [],
    sessionReports: [],
    selectedHistorySessionId: null,
    setSelectedHistorySessionId: () => {},
    onDeleteSession: () => {},
    onBackToDashboard: () => {},
    ...overrides,
  };
}

test('buildModel projeta os 6 campos de dados + selectedHistorySessionId', () => {
  const session = makeSession({ name: 'A' });
  const c = buildHistoryViewContract(
    makeInput({
      sessions: [session],
      games: [{ id: 'g1' } as never],
      pointEvents: [{ id: 'pe1' } as never],
      teams: [{ id: 't1' } as never],
      players: [{ id: 'p1' } as never],
      sessionReports: [{ id: 'r1' } as never],
      selectedHistorySessionId: 's1',
    }),
  );
  assert.equal(c.model.sessions.length, 1);
  assert.equal(c.model.games.length, 1);
  assert.equal(c.model.pointEvents.length, 1);
  assert.equal(c.model.teams.length, 1);
  assert.equal(c.model.players.length, 1);
  assert.equal(c.model.sessionReports.length, 1);
  assert.equal(c.model.selectedHistorySessionId, 's1');
});

test('buildModel projeta initialTab e hideTabs quando fornecidos', () => {
  const c = buildHistoryViewContract(makeInput({ initialTab: 'stats', hideTabs: true }));
  assert.equal(c.model.initialTab, 'stats');
  assert.equal(c.model.hideTabs, true);
});

test('buildModel deixa initialTab e hideTabs undefined quando omitidos', () => {
  const c = buildHistoryViewContract(makeInput());
  assert.equal(c.model.initialTab, undefined);
  assert.equal(c.model.hideTabs, undefined);
});

test('setSelectedSessionId chama setSelectedHistorySessionId com o id', async () => {
  const setSelectedHistorySessionId = spy() as unknown as Spy;
  const c = buildHistoryViewContract(
    makeInput({ setSelectedHistorySessionId: setSelectedHistorySessionId.fn as never }),
  );
  await c.dispatch({ kind: 'setSelectedSessionId', id: 's1' });
  assert.equal(setSelectedHistorySessionId.calls.length, 1);
  assert.deepEqual(setSelectedHistorySessionId.calls[0], ['s1']);
});

test('setSelectedSessionId aceita null', async () => {
  const setSelectedHistorySessionId = spy() as unknown as Spy;
  const c = buildHistoryViewContract(
    makeInput({ setSelectedHistorySessionId: setSelectedHistorySessionId.fn as never }),
  );
  await c.dispatch({ kind: 'setSelectedSessionId', id: null });
  assert.equal(setSelectedHistorySessionId.calls.length, 1);
  assert.deepEqual(setSelectedHistorySessionId.calls[0], [null]);
});

test('deleteSession chama onDeleteSession com o id', async () => {
  const onDeleteSession = spy() as unknown as Spy;
  const c = buildHistoryViewContract(makeInput({ onDeleteSession: onDeleteSession.fn as never }));
  await c.dispatch({ kind: 'deleteSession', id: 's1' });
  assert.equal(onDeleteSession.calls.length, 1);
  assert.deepEqual(onDeleteSession.calls[0], ['s1']);
});

test('backToDashboard chama onBackToDashboard', async () => {
  const onBackToDashboard = spy() as unknown as Spy;
  const c = buildHistoryViewContract(
    makeInput({ onBackToDashboard: onBackToDashboard.fn as never }),
  );
  await c.dispatch({ kind: 'backToDashboard' });
  assert.equal(onBackToDashboard.calls.length, 1);
});

test('cada intent chama apenas o seu callback (mutual exclusion)', async () => {
  const setSelectedHistorySessionId = spy() as unknown as Spy;
  const onDeleteSession = spy() as unknown as Spy;
  const onBackToDashboard = spy() as unknown as Spy;
  const c = buildHistoryViewContract(
    makeInput({
      setSelectedHistorySessionId: setSelectedHistorySessionId.fn as never,
      onDeleteSession: onDeleteSession.fn as never,
      onBackToDashboard: onBackToDashboard.fn as never,
    }),
  );
  await c.dispatch({ kind: 'setSelectedSessionId', id: 's1' });
  assert.equal(setSelectedHistorySessionId.calls.length, 1);
  assert.equal(onDeleteSession.calls.length, 0);
  assert.equal(onBackToDashboard.calls.length, 0);

  await c.dispatch({ kind: 'deleteSession', id: 's1' });
  assert.equal(setSelectedHistorySessionId.calls.length, 1);
  assert.equal(onDeleteSession.calls.length, 1);
  assert.equal(onBackToDashboard.calls.length, 0);

  await c.dispatch({ kind: 'backToDashboard' });
  assert.equal(setSelectedHistorySessionId.calls.length, 1);
  assert.equal(onDeleteSession.calls.length, 1);
  assert.equal(onBackToDashboard.calls.length, 1);
});
