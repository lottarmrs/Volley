import type { CommandContext } from './commandEnvelope';
import type { CommandResult } from './commandOutcome';

/**
 * XS-W0-05 — the Application→infrastructure boundary for target commands.
 *
 * Flow (N2.15): UI → Application use case → Command port → adapter/RPC.
 *
 * The port is intentionally narrow. C6.01 warns against "a giant generic domain service",
 * so this does not become a CRUD gateway: each command names a semantic server operation
 * and passes a typed payload. A caller cannot express "update this table" through it.
 */
export interface CommandPort {
  /**
   * Executes one attempt of a semantic server command.
   *
   * Implementations must not add caller identity or capability to the request. The server
   * resolves those from the authenticated session (GINV-AUTH-003).
   */
  execute<TPayload, TValue>(
    operation: string,
    context: CommandContext<TPayload>,
  ): Promise<CommandResult<TValue>>;
}

/** Semantic operations reachable through the port. Deliberately an allowlist, not a string. */
export const COMMAND_OPERATIONS = {
  ensureAccountReady: 'ensure_account_ready',
} as const;

export type CommandOperation = (typeof COMMAND_OPERATIONS)[keyof typeof COMMAND_OPERATIONS];
