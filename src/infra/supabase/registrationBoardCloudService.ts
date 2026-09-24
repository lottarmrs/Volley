import type {
  RegistrationBoard,
  RegistrationBoardEntry,
  RegistrationBoardStatus,
  RegistrationEntryStatus,
  RegistrationPendingCut,
} from '@shared/types';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { RpcClient } from './sessionCohortCloudService';

export interface RegistrationBoardService {
  readBoard(windowId: string): Promise<RegistrationBoard>;
  readSessionBoard(sessionId: string): Promise<RegistrationBoard | null>;
  join(input: {
    commandId: string;
    entryId: string;
    windowId: string;
  }): Promise<RegistrationEntryStatus>;
  leave(input: { commandId: string; windowId: string }): Promise<void>;
  markPayment(input: {
    commandId: string;
    windowId: string;
    playerId: string;
    paid: boolean;
  }): Promise<void>;
  setPaymentDue(input: {
    commandId: string;
    windowId: string;
    dueAt: string | null;
  }): Promise<void>;
  boostReserve(input: { commandId: string; windowId: string; playerId: string }): Promise<void>;
  applyPaymentDeadline(input: { commandId: string; windowId: string }): Promise<void>;
}

const WINDOW_STATUSES = new Set<string>(['DRAFT', 'OPEN', 'CLOSED', 'LOCKED']);
const ENTRY_STATUSES = new Set<string>(['CONFIRMED', 'WAITLISTED']);

function invalid(label: string): Error {
  return new Error(`Invalid ${label} response`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(label);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(label);
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid(label);
  return value;
}

function optionalText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length === 0) throw invalid(label);
  return value;
}

function playerIds(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw invalid(label);
  return value.map((item) => text(item, label));
}

function pendingCut(value: unknown, label: string): RegistrationPendingCut | null {
  if (value === null || value === undefined) return null;
  const row = record(value, label);
  return {
    demoted: playerIds(row.demoted, label),
    promoted: playerIds(row.promoted, label),
  };
}

function entry(value: unknown, label: string): RegistrationBoardEntry {
  const row = record(value, label);
  const status = text(row.status, label);
  if (!ENTRY_STATUSES.has(status)) throw invalid(label);
  const position = row.queue_position;
  if (position !== null && typeof position !== 'number') throw invalid(label);
  return {
    entryId: text(row.entry_id, label),
    playerId: text(row.player_id, label),
    status: status as RegistrationEntryStatus,
    queuePosition: position as number | null,
    source: text(row.source, label),
    joinedAt: text(row.joined_at, label),
    paidAt: optionalText(row.paid_at, label),
    paymentLapsedAt: optionalText(row.payment_lapsed_at, label),
  };
}

function board(value: unknown, label: string): RegistrationBoard {
  const row = record(value, label);
  const status = text(row.status, label);
  if (!WINDOW_STATUSES.has(status)) throw invalid(label);
  if (!Array.isArray(row.entries)) throw invalid(label);
  const viewerStatus = row.viewer_entry_status;
  if (viewerStatus !== null && typeof viewerStatus !== 'string') throw invalid(label);
  return {
    windowId: text(row.window_id, label),
    sessionId: text(row.session_id, label),
    sessionName: optionalText(row.session_name, label),
    sessionDate: optionalText(row.session_date, label),
    sessionLifecycleStatus: optionalText(row.session_lifecycle_status, label),
    status: status as RegistrationBoardStatus,
    revision: integer(row.revision, label),
    capacity: integer(row.capacity, label),
    confirmedCount: integer(row.confirmed_count, label),
    waitlistedCount: integer(row.waitlisted_count, label),
    paymentDueAt: optionalText(row.payment_due_at, label),
    paidCount: integer(row.paid_count, label),
    viewerCanManage: row.viewer_can_manage === true,
    viewerPlayerId: typeof row.viewer_player_id === 'string' ? row.viewer_player_id : null,
    viewerEntryStatus: (viewerStatus as RegistrationEntryStatus | null) ?? null,
    viewerQueuePosition:
      typeof row.viewer_queue_position === 'number' ? row.viewer_queue_position : null,
    viewerPaidAt: optionalText(row.viewer_paid_at, label),
    pendingDeadlineCut: pendingCut(row.pending_deadline_cut, label),
    entries: row.entries.map((item) => entry(item, label)),
  };
}

export function createRegistrationBoardCloudService(client: RpcClient): RegistrationBoardService {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  return {
    async readBoard(windowId) {
      const label = 'read_registration_board';
      return board(await call(label, { p_window_id: windowId }), label);
    },
    async readSessionBoard(sessionId) {
      const label = 'read_session_registration';
      const data = await call(label, { p_session_id: sessionId });
      return data === null || data === undefined ? null : board(data, label);
    },
    async join(input) {
      const label = 'join_registration';
      const data = await call(label, {
        p_command_id: input.commandId,
        p_entry_id: input.entryId,
        p_window_id: input.windowId,
      });
      const row = record(Array.isArray(data) ? data[0] : data, label);
      const status = text(row.entry_status, label);
      if (!ENTRY_STATUSES.has(status)) throw invalid(label);
      return status as RegistrationEntryStatus;
    },
    async leave(input) {
      await call('leave_registration', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
      });
    },
    async markPayment(input) {
      await call('mark_registration_payment', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_player_id: input.playerId,
        p_paid: input.paid,
      });
    },
    async setPaymentDue(input) {
      await call('set_registration_payment_due', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_due_at: input.dueAt,
      });
    },
    async boostReserve(input) {
      await call('boost_registration_reserve_entry', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_player_id: input.playerId,
      });
    },
    async applyPaymentDeadline(input) {
      await call('apply_registration_payment_deadline', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
      });
    },
  };
}

export const registrationBoardCloudService: RegistrationBoardService = isSupabaseConfigured
  ? createRegistrationBoardCloudService(supabase)
  : createRegistrationBoardCloudService({
      rpc: async () => {
        throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
      },
    });
