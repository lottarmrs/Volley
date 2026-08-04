import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionActiveViewContract } from './sessionActiveViewContract';
import type { FreePlayConfig, Session } from '@shared/types';

function spy() {
  const calls: unknown[][] = [];
  const fn = (...a: unknown[]) => {
    calls.push(a);
  };
  return { fn, calls };
}

type Spy = ReturnType<typeof spy>;

function makeConfig(initialQueue?: string[]): FreePlayConfig {
  return {
    rotationType: '6x0',
    maxPoints: 25,
    tieBreakMethod: 'direct_3',
    initialCourtTeams: ['t1', 't2'],
    initialQueue,
  } as FreePlayConfig;
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    name: 'Sessão de Teste',
    type: 'free_play',
    teamIds: ['t1', 't2', 't3'],
    status: 'active',
    config: makeConfig(['a', 'b']),
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Session;
}

function makeInput(overrides: Partial<{
  activeSession: Session;
  onExit: (...a: never[]) => void;
  onFinishSession: (...a: never[]) => void;
  setActiveSession: (...a: never[]) => void;
}> = {}) {
  const setActiveSession = overrides.setActiveSession ?? (() => {});
  const onExit = overrides.onExit ?? (() => {});
  const onFinishSession = overrides.onFinishSession ?? (() => {});
  const activeSession = overrides.activeSession ?? makeSession();
  return {
    activeSession,
    games: [],
    pointEvents: [],
    players: [],
    sessionTeams: [],
    gameReports: [],
    currentDeviceId: 'dev-1',
    setGames: () => {},
    setPointEvents: () => {},
    setGameReports: () => {},
    setActiveSession,
    onExit,
    onFinishSession,
  };
}

test('buildModel projeta os 7 campos de dados (incl. currentDeviceId)', () => {
  const c = buildSessionActiveViewContract(
    makeInput({ activeSession: makeSession({ id: 'sX' }) }),
  );
  assert.equal(c.model.activeSession.id, 'sX');
  assert.equal(c.model.games.length, 0);
  assert.equal(c.model.pointEvents.length, 0);
  assert.equal(c.model.players.length, 0);
  assert.equal(c.model.sessionTeams.length, 0);
  assert.equal(c.model.gameReports.length, 0);
  assert.equal(c.model.currentDeviceId, 'dev-1');
});

test('buildModel repassa os 4 setters como pass-through', () => {
  const setGames = spy();
  const setPointEvents = spy();
  const setGameReports = spy();
  const setActiveSession = spy();
  const c = buildSessionActiveViewContract({
    ...makeInput({ setActiveSession: setActiveSession.fn as never }),
    setGames: setGames.fn as never,
    setPointEvents: setPointEvents.fn as never,
    setGameReports: setGameReports.fn as never,
  });
  assert.equal(c.model.setGames, setGames.fn);
  assert.equal(c.model.setPointEvents, setPointEvents.fn);
  assert.equal(c.model.setGameReports, setGameReports.fn);
  assert.equal(c.model.setActiveSession, setActiveSession.fn);
});

test('updateFreePlayQueue chama setActiveSession com newQueue em config.initialQueue preservando o resto', async () => {
  const setActiveSession = spy() as unknown as Spy;
  const sess = makeSession({ id: 's1', name: 'Original' });
  const c = buildSessionActiveViewContract(
    makeInput({ activeSession: sess, setActiveSession: setActiveSession.fn as never }),
  );
  const cfg = sess.config as FreePlayConfig;
  await c.dispatch({ kind: 'updateFreePlayQueue', newQueue: ['x', 'y', 'z'] });
  assert.equal(setActiveSession.calls.length, 1);
  const arg = setActiveSession.calls[0][0] as Session;
  assert.equal(arg.id, 's1');
  assert.equal(arg.name, 'Original');
  assert.equal(arg.teamIds, sess.teamIds);
  const newCfg = arg.config as FreePlayConfig;
  assert.deepEqual(newCfg.initialQueue, ['x', 'y', 'z']);
  // preserva resto do config
  assert.equal(newCfg.maxPoints, cfg.maxPoints);
  assert.equal(newCfg.tieBreakMethod, cfg.tieBreakMethod);
  assert.deepEqual(newCfg.initialCourtTeams, cfg.initialCourtTeams);
});

test('exit chama onExit e NÃO chama setActiveSession/onFinishSession', async () => {
  const onExit = spy();
  const onFinishSession = spy();
  const setActiveSession = spy();
  const c = buildSessionActiveViewContract(
    makeInput({
      onExit: onExit.fn as never,
      onFinishSession: onFinishSession.fn as never,
      setActiveSession: setActiveSession.fn as never,
    }),
  );
  await c.dispatch({ kind: 'exit' });
  assert.equal(onExit.calls.length, 1);
  assert.equal(onFinishSession.calls.length, 0);
  assert.equal(setActiveSession.calls.length, 0);
});

test('finishSession chama onFinishSession e NÃO chama setActiveSession/onExit', async () => {
  const onExit = spy();
  const onFinishSession = spy();
  const setActiveSession = spy();
  const c = buildSessionActiveViewContract(
    makeInput({
      onExit: onExit.fn as never,
      onFinishSession: onFinishSession.fn as never,
      setActiveSession: setActiveSession.fn as never,
    }),
  );
  await c.dispatch({ kind: 'finishSession' });
  assert.equal(onFinishSession.calls.length, 1);
  assert.equal(onExit.calls.length, 0);
  assert.equal(setActiveSession.calls.length, 0);
});

test('nenhum Intent chama setGames/setPointEvents/setGameReports (são pass-through p/ hook)', async () => {
  const setGames = spy();
  const setPointEvents = spy();
  const setGameReports = spy();
  const setActiveSession = spy();
  const onExit = spy();
  const onFinishSession = spy();
  const c = buildSessionActiveViewContract({
    activeSession: makeSession(),
    games: [],
    pointEvents: [],
    players: [],
    sessionTeams: [],
    gameReports: [],
    currentDeviceId: 'dev-1',
    setGames: setGames.fn as never,
    setPointEvents: setPointEvents.fn as never,
    setGameReports: setGameReports.fn as never,
    setActiveSession: setActiveSession.fn as never,
    onExit: onExit.fn as never,
    onFinishSession: onFinishSession.fn as never,
  });
  await c.dispatch({ kind: 'updateFreePlayQueue', newQueue: [] });
  await c.dispatch({ kind: 'exit' });
  await c.dispatch({ kind: 'finishSession' });
  assert.equal(setGames.calls.length, 0);
  assert.equal(setPointEvents.calls.length, 0);
  assert.equal(setGameReports.calls.length, 0);
});
