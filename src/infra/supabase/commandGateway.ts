import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommandContext } from '../../application/command/commandEnvelope';
import { accepted, rejection, type CommandResult } from '../../application/command/commandOutcome';
import type { CommandPort } from '../../application/command/commandPort';

/**
 * XS-W0-05 — RPC adapter for the command port.
 *
 * Lives under `src/infra/supabase/` because that is where provider access belongs
 * (AF-FREEZE-004 / GINV-API-001): the Application layer states intent, only infrastructure
 * speaks to the database.
 *
 * The adapter never sends caller identity. `auth.uid()` is resolved inside the SECURITY
 * DEFINER function from the authenticated session, so a browser cannot claim to be someone
 * else by editing a payload.
 */

/** PostgreSQL SQLSTATEs that map to a stable command category rather than a generic failure. */
const SQLSTATE_OUTCOME: Record<
  string,
  'AUTHORIZATION_REJECTION' | 'CONFLICT' | 'DOMAIN_REJECTION'
> = {
  '42501': 'AUTHORIZATION_REJECTION', // insufficient_privilege
  '28000': 'AUTHORIZATION_REJECTION', // invalid_authorization_specification
  '23505': 'CONFLICT', // unique_violation
  '40001': 'CONFLICT', // serialization_failure
  '23503': 'DOMAIN_REJECTION', // foreign_key_violation
  '23514': 'DOMAIN_REJECTION', // check_violation
  '23502': 'DOMAIN_REJECTION', // not_null_violation
  P0001: 'DOMAIN_REJECTION', // raise_exception from a domain guard
};

/**
 * Network-ish failures where the request may or may not have committed.
 *
 * GINV-REL-002: this is NOT a plain failure. The caller must retry the SAME commandId so
 * the server can recognise the duplicate, instead of issuing a second logical command.
 */
function isUnknownOutcome(error: { message?: string; code?: string }): boolean {
  if (!error.code) return true;
  return error.code === 'PGRST504' || error.code === '57014' || error.code === '08006';
}

export function createSupabaseCommandGateway(client: SupabaseClient): CommandPort {
  return {
    async execute<TPayload, TValue>(
      operation: string,
      context: CommandContext<TPayload>,
    ): Promise<CommandResult<TValue>> {
      const { envelope } = context;

      try {
        const { data, error } = await client.rpc(
          operation,
          (envelope.payload ?? {}) as Record<string, unknown>,
        );

        if (error) {
          if (isUnknownOutcome(error)) {
            return rejection(
              'UNKNOWN_OUTCOME',
              `${operation} outcome unknown; retry with the same commandId`,
              envelope.commandId,
              error,
            );
          }
          const outcome = SQLSTATE_OUTCOME[error.code ?? ''] ?? 'TECHNICAL_FAILURE';
          return rejection(outcome, error.message, envelope.commandId, error);
        }

        return accepted(data as TValue, envelope.commandId);
      } catch (cause) {
        // A thrown transport error means the response never arrived. The command may still
        // have committed, so it is explicitly unknown rather than failed.
        return rejection(
          'UNKNOWN_OUTCOME',
          `${operation} did not return a response; retry with the same commandId`,
          envelope.commandId,
          cause,
        );
      }
    },
  };
}
