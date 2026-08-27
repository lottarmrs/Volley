import { withAttempt, type CommandEnvelope } from './commandEnvelope';
import type { CommandResult } from './commandOutcome';
import { COMMAND_OPERATIONS, type CommandPort } from './commandPort';

/**
 * XS-W0-05 exit-gate command.
 *
 * `ensure_account_ready` was chosen deliberately as the first command through the new path:
 *
 *   non-destructive   it upserts the caller's own profile and never deletes anything;
 *   naturally idempotent  repeated execution converges on the same state, so retry
 *                     semantics can be proven WITHOUT a receipts ledger;
 *   server-derived actor  the function reads auth.uid() and refuses when unauthenticated,
 *                     so no caller identity travels in the payload;
 *   already deployed  no migration, no schema change, no authority moves.
 *
 * Durable cross-session idempotency (a receipt that survives a process restart and can
 * answer "did my earlier attempt commit?") is NOT implemented here. C6.01 permits
 * `app_private.command_receipts` only once its schema and retention are resolved, and
 * `OPEN-API-002` (command receipt retention per command class) is still open. Building the
 * table now would silently close that decision, so this slice relies on the command's own
 * idempotency and records the gap.
 */

export interface EnsureAccountReadyPayload {
  /** Optional desired handle. Absent means "leave the current one alone". */
  readonly p_username?: string;
}

export interface AccountReadyState {
  readonly state: string;
  readonly profile_id: string;
  readonly username: string | null;
  readonly requires_aal2: boolean;
}

export function ensureAccountReadyCommand(
  username?: string,
): CommandEnvelope<EnsureAccountReadyPayload> {
  return {
    commandId: globalThis.crypto.randomUUID(),
    payload: username ? { p_username: username } : {},
  };
}

/**
 * Executes one attempt.
 *
 * Retrying passes the SAME envelope back in, which keeps `commandId` stable while minting a
 * fresh `requestId` for the attempt (ADR-API-006).
 */
export async function executeEnsureAccountReady(
  port: CommandPort,
  envelope: CommandEnvelope<EnsureAccountReadyPayload>,
  clientRelease?: string,
): Promise<CommandResult<AccountReadyState[]>> {
  return port.execute<EnsureAccountReadyPayload, AccountReadyState[]>(
    COMMAND_OPERATIONS.ensureAccountReady,
    withAttempt(envelope, clientRelease),
  );
}
