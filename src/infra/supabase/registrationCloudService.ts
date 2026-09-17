import type {
  RegistrationGateway,
  RegistrationWindowStatus,
  WindowCommand,
} from '@app/authorizedFormationGateways';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { RpcClient } from './sessionCohortCloudService';

const STATUSES = new Set<string>(['DRAFT', 'OPEN', 'CLOSED', 'LOCKED']);

function invalid(label: string): Error {
  return new Error(`Invalid ${label} response`);
}

function singleRow(data: unknown, label: string): Record<string, unknown> {
  const value = Array.isArray(data) ? (data.length === 1 ? data[0] : undefined) : data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(label);
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid(label);
  return value;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalid(label);
  return value;
}

export function createRegistrationCloudService(client: RpcClient): RegistrationGateway {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function windowRevision(name: string, args: Record<string, unknown>): Promise<number> {
    return integer(singleRow(await call(name, args), name).window_revision, name);
  }

  const lifecycle = (name: string) => (input: WindowCommand) =>
    windowRevision(name, {
      p_command_id: input.commandId,
      p_window_id: input.windowId,
      p_expected_revision: input.expectedRevision,
    });

  return {
    createWindow: (input) =>
      windowRevision('create_registration_window', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_session_id: input.sessionId,
        p_capacity: input.capacity,
        p_closes_at: null,
      }),
    openWindow: lifecycle('open_registration'),
    reopenWindow: lifecycle('reopen_registration'),
    closeWindow: lifecycle('close_registration'),
    lockWindow: lifecycle('lock_registration'),
    changeCapacity: (input) =>
      windowRevision('change_registration_capacity', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_capacity: input.capacity,
      }),
    addEntry: (input) =>
      windowRevision('add_registration_entry', {
        p_command_id: input.commandId,
        p_entry_id: input.entryId,
        p_window_id: input.windowId,
        p_player_id: input.playerId,
      }),
    removeEntry: (input) =>
      windowRevision('remove_registration_entry', {
        p_command_id: input.commandId,
        p_window_id: input.windowId,
        p_player_id: input.playerId,
        p_reason: input.reason,
      }),
    async finalizeRoster(input) {
      const label = 'finalize_session_roster';
      const row = singleRow(
        await call(label, {
          p_command_id: input.commandId,
          p_window_id: input.windowId,
          p_expected_registration_revision: input.expectedRevision,
        }),
        label,
      );
      return {
        rosterRevisionId: identifier(row.roster_revision_id, label),
        rosterRevisionNumber: integer(row.roster_revision_number, label),
      };
    },
    async readWindow(windowId) {
      const label = 'read_registration_window';
      const row = singleRow(await call(label, { p_window_id: windowId }), label);
      const confirmed = row.confirmed_player_ids;
      if (typeof row.status !== 'string' || !STATUSES.has(row.status)) throw invalid(label);
      if (!Array.isArray(confirmed) || !confirmed.every((id) => typeof id === 'string')) {
        throw invalid(label);
      }
      return {
        windowId: identifier(row.window_id, label),
        sessionId: identifier(row.session_id, label),
        status: row.status as RegistrationWindowStatus,
        revision: integer(row.revision, label),
        capacity: integer(row.capacity, label),
        confirmedPlayerIds: confirmed as string[],
      };
    },
  };
}

export const registrationCloudService: RegistrationGateway = isSupabaseConfigured
  ? createRegistrationCloudService(supabase)
  : createRegistrationCloudService({
      rpc: async () => {
        throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
      },
    });
