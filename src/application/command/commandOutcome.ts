import type { AppError, AppResult } from '../appResult';

/**
 * XS-W0-05 — bounded-context stable result classification.
 *
 * C6.01 asks to "preserve useful categories from current AppResult, but START bounded-context
 * stable error/result codes". This is additive on purpose: `AppResult` has 27 consumers and
 * rewriting it would be a large, risky change with no architectural payoff in W0. Instead
 * every existing `AppError` maps onto one stable outcome category, so new target commands
 * speak the target vocabulary while existing use cases keep working unchanged.
 */

export const COMMAND_OUTCOMES = [
  'ACCEPTED',
  'DOMAIN_REJECTION',
  'AUTHORIZATION_REJECTION',
  'CONFLICT',
  'TECHNICAL_FAILURE',
  'OFFLINE_UNAVAILABLE',
  'UNKNOWN_OUTCOME',
] as const;

export type CommandOutcome = (typeof COMMAND_OUTCOMES)[number];

/**
 * UNKNOWN_OUTCOME is the category that does not exist in the current AppResult and is the
 * reason this layer exists at all.
 *
 * GINV-REL-002: when a mutation's response is lost after the server may already have
 * committed, the caller must NOT treat it as a failure and must NOT blindly re-run it as a
 * new intent. It retries the SAME commandId so the server can recognise the duplicate.
 * Collapsing this into TECHNICAL_FAILURE is how double-effects get shipped.
 */
export const RETRIABLE_WITH_SAME_COMMAND_ID: readonly CommandOutcome[] = [
  'UNKNOWN_OUTCOME',
  'TECHNICAL_FAILURE',
  'OFFLINE_UNAVAILABLE',
];

export interface CommandRejection {
  readonly outcome: Exclude<CommandOutcome, 'ACCEPTED'>;
  readonly message: string;
  /** Echoed so a caller can correlate a rejection with the intent that caused it. */
  readonly commandId: string;
  /** True when the caller may retry reusing the same commandId. */
  readonly retriable: boolean;
  readonly cause?: unknown;
}

export interface CommandAccepted<TValue> {
  readonly outcome: 'ACCEPTED';
  readonly value: TValue;
  readonly commandId: string;
}

export type CommandResult<TValue> = CommandAccepted<TValue> | CommandRejection;

export function isAccepted<TValue>(
  result: CommandResult<TValue>,
): result is CommandAccepted<TValue> {
  return result.outcome === 'ACCEPTED';
}

/** Maps a current AppError kind onto the stable target category. */
export function classifyAppError(error: AppError): Exclude<CommandOutcome, 'ACCEPTED'> {
  switch (error.kind) {
    case 'authorization':
      return 'AUTHORIZATION_REJECTION';
    case 'conflict':
      return 'CONFLICT';
    case 'offline_unavailable':
      return 'OFFLINE_UNAVAILABLE';
    case 'validation':
      return 'DOMAIN_REJECTION';
    case 'product':
      // A product error is a refusal by domain rules, except where the code names an
      // authorization or availability condition. Those keep their real meaning so callers
      // do not retry something that will never be permitted.
      if (error.code === 'permission_denied' || error.code === 'not_authenticated') {
        return 'AUTHORIZATION_REJECTION';
      }
      if (error.code === 'cloud_unavailable') return 'OFFLINE_UNAVAILABLE';
      if (error.code === 'conflict') return 'CONFLICT';
      return 'DOMAIN_REJECTION';
    case 'technical':
    case 'unexpected':
      return 'TECHNICAL_FAILURE';
    default: {
      // Exhaustiveness: a new AppError kind must be classified deliberately rather than
      // silently defaulting to a retriable category.
      const unreachable: never = error;
      void unreachable;
      return 'TECHNICAL_FAILURE';
    }
  }
}

export function rejection(
  outcome: Exclude<CommandOutcome, 'ACCEPTED'>,
  message: string,
  commandId: string,
  cause?: unknown,
): CommandRejection {
  return {
    outcome,
    message,
    commandId,
    retriable: RETRIABLE_WITH_SAME_COMMAND_ID.includes(outcome),
    ...(cause === undefined ? {} : { cause }),
  };
}

export function accepted<TValue>(value: TValue, commandId: string): CommandAccepted<TValue> {
  return { outcome: 'ACCEPTED', value, commandId };
}

/** Bridges an existing use case's AppResult into the stable command vocabulary. */
export function fromAppResult<TValue>(
  result: AppResult<TValue>,
  commandId: string,
): CommandResult<TValue> {
  if (result.ok) return accepted(result.value, commandId);
  return rejection(classifyAppError(result.error), result.error.message, commandId, result.error);
}
