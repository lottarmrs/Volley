import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardContract } from './dashboardContract';
import type { DashboardContractInput } from './dashboardContract';
import type { Session } from '@shared/types';
import type { SessionDraft } from '@logic/sessionDraft';

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
    status: 'active',
    date: '2026-01-01T00:00:00.000Z',
    teams: [],
    players: [],
    games: [],
    ...overrides,
  } as unknown as Session;
}

function makeDraft(overrides: Partial<SessionDraft> = {}): SessionDraft {
  return {
    session: makeSession(),
    wizardStep: 0,
    bestDivisions: [],
    selectedDivisionIndex: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as SessionDraft;
}

function makeInput(overrides: Partial<DashboardContractInput> = {}): DashboardContractInput {
  return {
    activeSession: null,
    sessionDraft: null,
    games: [],
    onNewSession: () => {},
    onResumeSession: () => {},
    onResumeDraft: () => {},
    onClearDraft: () => {},
    onClearActiveSession: () => {},
    onPlayers: () => {},
    onHistory: () => {},
    onExportBackup: () => {},
    onImportBackup: () => {},
    onCommunities: () => {},
    sessions: [],
    communities: [],
    today: '2026-09-22',
    ...overrides,
  };
}

test('buildModel projeta activeSession e sessionDraft', () => {
  const session = makeSession({ name: 'A' });
  const draft = makeDraft();
  const c = buildDashboardContract(makeInput({ activeSession: session, sessionDraft: draft }));
  assert.equal(c.model.activeSession, session);
  assert.equal(c.model.sessionDraft, draft);
});

test('buildModel lida com valores nulos', () => {
  const c = buildDashboardContract(makeInput());
  assert.equal(c.model.activeSession, null);
  assert.equal(c.model.sessionDraft, null);
});

test('newSession chama onNewSession', async () => {
  const onNewSession = spy() as unknown as Spy;
  const c = buildDashboardContract(makeInput({ onNewSession: onNewSession.fn as never }));
  await c.dispatch({ kind: 'newSession' });
  assert.equal(onNewSession.calls.length, 1);
});

test('resumeSession chama onResumeSession', async () => {
  const onResumeSession = spy() as unknown as Spy;
  const c = buildDashboardContract(makeInput({ onResumeSession: onResumeSession.fn as never }));
  await c.dispatch({ kind: 'resumeSession' });
  assert.equal(onResumeSession.calls.length, 1);
});

test('resumeDraft repassa o draft ao callback', async () => {
  const onResumeDraft = spy() as unknown as Spy;
  const c = buildDashboardContract(makeInput({ onResumeDraft: onResumeDraft.fn as never }));
  const draft = makeDraft();
  await c.dispatch({ kind: 'resumeDraft', draft });
  assert.equal(onResumeDraft.calls.length, 1);
  assert.deepEqual(onResumeDraft.calls[0], [draft]);
});

test('clearDraft chama onClearDraft', async () => {
  const onClearDraft = spy() as unknown as Spy;
  const c = buildDashboardContract(makeInput({ onClearDraft: onClearDraft.fn as never }));
  await c.dispatch({ kind: 'clearDraft' });
  assert.equal(onClearDraft.calls.length, 1);
});

test('clearActiveSession chama onClearActiveSession', async () => {
  const onClearActiveSession = spy() as unknown as Spy;
  const c = buildDashboardContract(
    makeInput({ onClearActiveSession: onClearActiveSession.fn as never }),
  );
  await c.dispatch({ kind: 'clearActiveSession' });
  assert.equal(onClearActiveSession.calls.length, 1);
});

test('players chama onPlayers', async () => {
  const onPlayers = spy() as unknown as Spy;
  const c = buildDashboardContract(makeInput({ onPlayers: onPlayers.fn as never }));
  await c.dispatch({ kind: 'players' });
  assert.equal(onPlayers.calls.length, 1);
});

test('history chama onHistory', async () => {
  const onHistory = spy() as unknown as Spy;
  const c = buildDashboardContract(makeInput({ onHistory: onHistory.fn as never }));
  await c.dispatch({ kind: 'history' });
  assert.equal(onHistory.calls.length, 1);
});

test('exportBackup chama onExportBackup', async () => {
  const onExportBackup = spy() as unknown as Spy;
  const c = buildDashboardContract(makeInput({ onExportBackup: onExportBackup.fn as never }));
  await c.dispatch({ kind: 'exportBackup' });
  assert.equal(onExportBackup.calls.length, 1);
});

test('importBackup repassa o file ao callback', async () => {
  const onImportBackup = spy() as unknown as Spy;
  const c = buildDashboardContract(makeInput({ onImportBackup: onImportBackup.fn as never }));
  const file = new File(['x'], 'backup.json', { type: 'application/json' });
  await c.dispatch({ kind: 'importBackup', file });
  assert.equal(onImportBackup.calls.length, 1);
  assert.equal(onImportBackup.calls[0][0], file);
});

test('communities chama onCommunities', async () => {
  const onCommunities = spy() as unknown as Spy;
  const c = buildDashboardContract(makeInput({ onCommunities: onCommunities.fn as never }));
  await c.dispatch({ kind: 'communities' });
  assert.equal(onCommunities.calls.length, 1);
});

test('a proxima pelada aponta para a inscricao da sessao futura mais proxima', () => {
  const c = buildDashboardContract(
    makeInput({
      communities: [{ id: 'c1', name: 'Panelinha' } as never],
      sessions: [
        makeSession({ id: 's2', name: 'Pelada de sabado', date: '2026-09-26', communityId: 'c1' }),
        makeSession({ id: 's1', name: 'Pelada de quinta', date: '2026-09-24', communityId: 'c1' }),
      ],
    }),
  );
  assert.deepEqual(c.model.proximaPelada, {
    to: '/comunidades/c1/sessoes/s1/inscricao',
    title: 'Pelada de quinta',
    subtitle: 'quinta-feira, 24 de setembro',
  });
});

test('sem sessao futura, a proxima pelada e nula', () => {
  const c = buildDashboardContract(
    makeInput({
      communities: [{ id: 'c1', name: 'Panelinha' } as never],
      sessions: [
        makeSession({ id: 's0', name: 'Pelada antiga', date: '2026-09-01', communityId: 'c1' }),
      ],
    }),
  );
  assert.equal(c.model.proximaPelada, null);
});
