import type { Game, GameReport, PointEvent, Session, SessionReport, Team } from '@shared/types';
import {
  operationalCloudService,
  type OperationalTable,
} from '@infra/supabase/operationalCloudService';
import {
  targetSessionLifecycleCloudService,
  type TargetSessionLifecycleService,
} from '@infra/supabase/targetSessionLifecycleCloudService';
import { sessionCohortCloudService } from '@infra/supabase/sessionCohortCloudService';
import type { CreateTargetSessionInput } from './sessionCohortCutover';
import type { SessionBundle } from './sessionDataQueries';
import { diffById } from './rowDiff';
import { rulesPayloadFor, targetStepFor } from './targetSessionLifecycle';

type SessionsById = Map<string, Session>;

export interface SessionWriteGateway {
  upsertSession(session: Session, ownerId: string): Promise<unknown>;
  softDelete(table: OperationalTable, cloudId: string): Promise<void>;
  bulkUpsertTeams(items: Team[], ownerId: string, sessionsById: SessionsById): Promise<unknown>;
  bulkUpsertGames(items: Game[], ownerId: string, sessionsById: SessionsById): Promise<unknown>;
  bulkUpsertPointEvents(
    items: PointEvent[],
    ownerId: string,
    sessionsById: SessionsById,
  ): Promise<unknown>;
  bulkUpsertGameReports(
    items: GameReport[],
    ownerId: string,
    sessionsById: SessionsById,
  ): Promise<unknown>;
  bulkUpsertSessionReports(
    items: SessionReport[],
    ownerId: string,
    sessionsById: SessionsById,
  ): Promise<unknown>;
  createTargetSession(input: CreateTargetSessionInput): Promise<{ id: string }>;
  lifecycle: TargetSessionLifecycleService;
}

export interface SessionWriteContext {
  userId: string;
  communityCloudId(appCommunityId: string | null | undefined): string | null;
}

const ENDED_GAME = new Set(['finished', 'cancelled', 'walkover']);
const isTarget = (session: Session) => session.authorityModel === 'target';

function plannedStartAt(session: Session): string {
  const parsed = new Date(`${session.date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function byOwner<T extends { cloudOwnerId?: string }>(rows: T[], userId: string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const owner = row.cloudOwnerId ?? userId;
    groups.set(owner, [...(groups.get(owner) ?? []), row]);
  }
  return groups;
}

async function persistRoot(
  prev: Session | undefined,
  next: Session,
  games: Game[],
  sessionsById: SessionsById,
  ctx: SessionWriteContext,
  gateway: SessionWriteGateway,
) {
  const communityCloudId = ctx.communityCloudId(next.communityId);
  if (!prev && !next.cloudId && communityCloudId) {
    await gateway.createTargetSession({
      sessionId: next.id,
      communityId: communityCloudId,
      name: next.name,
      playMode: next.type === 'tournament' ? 'STRUCTURED_MATCHES' : 'FREE_PLAY',
      plannedStartAt: plannedStartAt(next),
    });
    return;
  }
  if (!isTarget(next)) {
    await gateway.upsertSession(
      { ...next, communityId: communityCloudId },
      next.cloudOwnerId ?? ctx.userId,
    );
    return;
  }
  const cloudId = next.cloudId ?? next.id;
  switch (targetStepFor(prev, next)) {
    case 'freezeRulesScheduleStart':
      await gateway.lifecycle.freezeRules(cloudId, rulesPayloadFor(next));
      await gateway.lifecycle.schedule(cloudId);
      await gateway.lifecycle.start(cloudId);
      return;
    case 'finish': {
      const open = games
        .filter((game) => game.sessionId === next.id && !ENDED_GAME.has(game.status))
        .map((game) => ({ ...game, status: 'cancelled' as const }));
      for (const [owner, rows] of byOwner(open, ctx.userId)) {
        await gateway.bulkUpsertGames(rows, owner, sessionsById);
      }
      await gateway.lifecycle.finish(cloudId);
      return;
    }
    case 'cancel':
      await gateway.lifecycle.cancel(cloudId, 'Cancelada no app');
      return;
    default:
      if (
        prev &&
        ((prev.location ?? null) !== (next.location ?? null) ||
          (prev.notes ?? null) !== (next.notes ?? null))
      ) {
        await gateway.lifecycle.setDetails(cloudId, {
          location: next.location ?? null,
          notes: next.notes ?? null,
        });
      }
      return;
  }
}

async function persistChildren<T extends { id: string; cloudId?: string; cloudOwnerId?: string }>(
  prev: T[],
  next: T[],
  table: OperationalTable,
  write: (items: T[], owner: string) => Promise<unknown>,
  ctx: SessionWriteContext,
  gateway: SessionWriteGateway,
) {
  const { upserted, removed } = diffById(prev, next);
  for (const [owner, rows] of byOwner(upserted, ctx.userId)) {
    await write(rows, owner);
  }
  for (const row of removed) {
    if (row.cloudId) await gateway.softDelete(table, row.cloudId);
  }
}

export async function persistSessionBundleChanges(
  prev: SessionBundle,
  next: SessionBundle,
  ctx: SessionWriteContext,
  gateway: SessionWriteGateway,
): Promise<void> {
  const sessionsById: SessionsById = new Map(
    [...prev.sessions, ...next.sessions].map((session) => [
      session.id.toLowerCase(),
      { ...session, communityId: ctx.communityCloudId(session.communityId) },
    ]),
  );
  const before = new Map(prev.sessions.map((session) => [session.id, session]));
  const roots = diffById(prev.sessions, next.sessions);
  for (const session of roots.upserted) {
    await persistRoot(before.get(session.id), session, next.games, sessionsById, ctx, gateway);
  }
  for (const session of roots.removed) {
    if (isTarget(session))
      await gateway.lifecycle.cancel(session.cloudId ?? session.id, 'Removida');
    else if (session.cloudId) await gateway.softDelete('sessions', session.cloudId);
  }

  await persistChildren(
    prev.teams,
    next.teams,
    'teams',
    (rows, owner) => gateway.bulkUpsertTeams(rows, owner, sessionsById),
    ctx,
    gateway,
  );
  await persistChildren(
    prev.games,
    next.games,
    'games',
    (rows, owner) => gateway.bulkUpsertGames(rows, owner, sessionsById),
    ctx,
    gateway,
  );
  await persistChildren(
    prev.pointEvents,
    next.pointEvents,
    'point_events',
    (rows, owner) => gateway.bulkUpsertPointEvents(rows, owner, sessionsById),
    ctx,
    gateway,
  );
  await persistChildren(
    prev.gameReports,
    next.gameReports,
    'game_reports',
    (rows, owner) => gateway.bulkUpsertGameReports(rows, owner, sessionsById),
    ctx,
    gateway,
  );
  await persistChildren(
    prev.sessionReports,
    next.sessionReports,
    'session_reports',
    (rows, owner) => gateway.bulkUpsertSessionReports(rows, owner, sessionsById),
    ctx,
    gateway,
  );
}

export const defaultSessionWriteGateway: SessionWriteGateway = {
  upsertSession: (session, ownerId) => operationalCloudService.upsertSession(session, ownerId),
  softDelete: (table, cloudId) => operationalCloudService.softDelete(table, cloudId),
  bulkUpsertTeams: (items, ownerId, sessionsById) =>
    operationalCloudService.bulkUpsertTeams(items, ownerId, sessionsById),
  bulkUpsertGames: (items, ownerId, sessionsById) =>
    operationalCloudService.bulkUpsertGames(items, ownerId, sessionsById),
  bulkUpsertPointEvents: (items, ownerId, sessionsById) =>
    operationalCloudService.bulkUpsertPointEvents(items, ownerId, sessionsById),
  bulkUpsertGameReports: (items, ownerId, sessionsById) =>
    operationalCloudService.bulkUpsertGameReports(items, ownerId, sessionsById),
  bulkUpsertSessionReports: (items, ownerId, sessionsById) =>
    operationalCloudService.bulkUpsertSessionReports(items, ownerId, sessionsById),
  createTargetSession: (input) => sessionCohortCloudService.createTargetSession(input),
  lifecycle: targetSessionLifecycleCloudService,
};
