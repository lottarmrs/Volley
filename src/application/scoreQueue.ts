import type { Game, GameReport, PointEvent, Session } from '@shared/types';
import type { SessionBundle } from './sessionDataQueries';
import { diffById } from './rowDiff';

export interface ScoreRows {
  games: Game[];
  pointEvents: PointEvent[];
  gameReports: GameReport[];
}

export interface ScoreQueueEntry {
  seq: number;
  at: string;
  sessionId: string;
  sessionBefore: Session;
  sessionAfter: Session | null;
  upserts: ScoreRows;
  removals: ScoreRows;
}

export interface ScoreQueueState {
  userId: string;
  sessionId: string;
  base: SessionBundle;
  knownPointIds: string[];
  entries: ScoreQueueEntry[];
  forced?: boolean;
}

export interface LiveScoreState {
  controlledByUserId: string | null;
  controllerName: string | null;
  pointIds: string[];
  sessionEnded: boolean;
}

export interface ScoreQueueConflict {
  takenOverBy: string | null;
  foreignPoints: number;
  myPoints: number;
  sessionEnded: boolean;
}

const SCORE_FIELDS = ['games', 'pointEvents', 'gameReports'] as const;

function emptyRows(): ScoreRows {
  return { games: [], pointEvents: [], gameReports: [] };
}

export function sliceForSession(bundle: SessionBundle, sessionId: string): SessionBundle {
  return {
    sessions: bundle.sessions.filter((row) => row.id === sessionId),
    teams: bundle.teams.filter((row) => row.sessionId === sessionId),
    games: bundle.games.filter((row) => row.sessionId === sessionId),
    pointEvents: bundle.pointEvents.filter((row) => row.sessionId === sessionId),
    gameReports: bundle.gameReports.filter((row) => row.sessionId === sessionId),
    sessionReports: [],
  };
}

function changed<T extends { id: string }>(prev: T[], next: T[]) {
  const { upserted, removed } = diffById(prev, next);
  return { upserted, removed, any: upserted.length > 0 || removed.length > 0 };
}

export function isScoringChange(
  prev: SessionBundle,
  next: SessionBundle,
  sessionId: string,
): boolean {
  const session = prev.sessions.find((row) => row.id === sessionId);
  if (!session) return false;
  if (changed(prev.teams, next.teams).any) return false;
  if (changed(prev.sessionReports, next.sessionReports).any) return false;
  const roots = changed(prev.sessions, next.sessions);
  if (roots.removed.length > 0) return false;
  if (roots.upserted.some((row) => row.id !== sessionId || row.status !== session.status)) {
    return false;
  }
  return SCORE_FIELDS.every((field) => {
    const diff = changed<{ id: string; sessionId: string }>(prev[field], next[field]);
    return [...diff.upserted, ...diff.removed].every((row) => row.sessionId === sessionId);
  });
}

export function entryFromChange(
  prev: SessionBundle,
  next: SessionBundle,
  sessionId: string,
  seq: number,
  at: string,
): ScoreQueueEntry {
  const sessionBefore = prev.sessions.find((row) => row.id === sessionId)!;
  const sessionNow = next.sessions.find((row) => row.id === sessionId) ?? sessionBefore;
  const upserts = emptyRows();
  const removals = emptyRows();
  for (const field of SCORE_FIELDS) {
    const before = prev[field].filter((row) => row.sessionId === sessionId);
    const after = next[field].filter((row) => row.sessionId === sessionId);
    const diff = diffById<{ id: string }>(before, after);
    (upserts[field] as { id: string }[]) = diff.upserted;
    (removals[field] as { id: string }[]) = diff.removed;
  }
  return {
    seq,
    at,
    sessionId,
    sessionBefore,
    sessionAfter: sessionNow === sessionBefore ? null : sessionNow,
    upserts,
    removals,
  };
}

export function bundlesForEntry(entry: ScoreQueueEntry): {
  prev: SessionBundle;
  next: SessionBundle;
} {
  const before = entry.sessionBefore;
  return {
    prev: {
      sessions: [before],
      teams: [],
      games: entry.removals.games,
      pointEvents: entry.removals.pointEvents,
      gameReports: entry.removals.gameReports,
      sessionReports: [],
    },
    next: {
      sessions: [entry.sessionAfter ?? before],
      teams: [],
      games: entry.upserts.games,
      pointEvents: entry.upserts.pointEvents,
      gameReports: entry.upserts.gameReports,
      sessionReports: [],
    },
  };
}

function overlay<T extends { id: string }>(rows: T[], upserts: T[], removals: T[]): T[] {
  if (upserts.length === 0 && removals.length === 0) return rows;
  const gone = new Set(removals.map((row) => row.id));
  const replaced = new Map(upserts.map((row) => [row.id, row]));
  const kept = rows.filter((row) => !gone.has(row.id)).map((row) => replaced.get(row.id) ?? row);
  const present = new Set(rows.map((row) => row.id));
  return [...kept, ...upserts.filter((row) => !present.has(row.id))];
}

export function applyQueue(bundle: SessionBundle, entries: ScoreQueueEntry[]): SessionBundle {
  return entries.reduce<SessionBundle>((acc, entry) => {
    const next = { ...acc };
    for (const field of SCORE_FIELDS) {
      (next[field] as { id: string }[]) = overlay<{ id: string }>(
        acc[field],
        entry.upserts[field],
        entry.removals[field],
      );
    }
    if (entry.sessionAfter) {
      const existing = acc.sessions.find((row) => row.id === entry.sessionAfter!.id);
      const root = existing
        ? { ...entry.sessionAfter, status: existing.status, deletedAt: existing.deletedAt }
        : entry.sessionAfter;
      next.sessions = overlay(acc.sessions, [root], []);
    }
    return next;
  }, bundle);
}

export function startScoreQueue(input: {
  userId: string;
  sessionId: string;
  base: SessionBundle;
}): ScoreQueueState {
  return {
    userId: input.userId,
    sessionId: input.sessionId,
    base: input.base,
    knownPointIds: input.base.pointEvents.map((row) => row.id),
    entries: [],
  };
}

export function pushEntry(state: ScoreQueueState, entry: ScoreQueueEntry): ScoreQueueState {
  return { ...state, entries: [...state.entries, entry] };
}

export function nextSeq(state: ScoreQueueState | null): number {
  if (!state || state.entries.length === 0) return 1;
  return state.entries[state.entries.length - 1].seq + 1;
}

function latestQueuedPoints(state: ScoreQueueState): Map<string, PointEvent> {
  const latest = new Map<string, PointEvent>();
  for (const entry of state.entries) {
    for (const point of entry.upserts.pointEvents) latest.set(point.id, point);
  }
  return latest;
}

export function queuedPointCount(state: ScoreQueueState | null): number {
  if (!state) return 0;
  let count = 0;
  for (const point of latestQueuedPoints(state).values()) {
    if (point.eventKind !== 'highlight' && !point.deletedAt) count += 1;
  }
  return count;
}

export function detectQueueConflict(input: {
  state: ScoreQueueState;
  live: LiveScoreState;
}): ScoreQueueConflict | null {
  const { state, live } = input;
  if (live.sessionEnded) {
    return {
      takenOverBy: null,
      foreignPoints: 0,
      myPoints: queuedPointCount(state),
      sessionEnded: true,
    };
  }
  const mine = latestQueuedPoints(state);
  const known = new Set(state.knownPointIds);
  const foreignPoints = live.pointIds.filter((id) => !known.has(id) && !mine.has(id)).length;
  const tookOver = !!live.controlledByUserId && live.controlledByUserId !== state.userId;
  if (!tookOver && foreignPoints === 0) return null;
  return {
    takenOverBy: tookOver ? (live.controllerName ?? 'outra pessoa') : null,
    foreignPoints,
    myPoints: queuedPointCount(state),
    sessionEnded: false,
  };
}

function pontos(n: number): string {
  return n === 1 ? '1 ponto' : `${n} pontos`;
}

function guardados(n: number): string {
  return n === 1 ? '1 ponto guardado' : `${n} pontos guardados`;
}

export function conflictMessage(conflict: ScoreQueueConflict): string {
  if (conflict.sessionEnded) {
    return `A pelada foi encerrada enquanto você estava sem sinal. Você tem ${guardados(conflict.myPoints)}.`;
  }
  const quem = conflict.takenOverBy ?? 'outra pessoa';
  const feito = conflict.takenOverBy
    ? conflict.foreignPoints > 0
      ? `assumiu o placar e marcou ${pontos(conflict.foreignPoints)}`
      : 'assumiu o placar'
    : `marcou ${pontos(conflict.foreignPoints)}`;
  return `Enquanto você estava sem sinal, ${quem} ${feito}. Você tem ${guardados(conflict.myPoints)}.`;
}

export function pendingLabel(count: number): string {
  return `Sem sinal · ${guardados(count)} no aparelho`;
}
