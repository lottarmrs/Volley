/**
 * XS-W0-05 — Command execution foundation.
 *
 * A reusable envelope for target shared commands, deliberately NOT a generic domain
 * service: each command keeps its own payload type and its own use case.
 *
 * What the envelope carries and what it must never carry:
 *
 *   commandId          stable LOGICAL intent identity. A retry of the same intent reuses
 *                      it, which is what makes a command idempotent (ADR-API-006).
 *   payload            the domain intent itself.
 *   expectedRevision   optimistic concurrency by semantic revision, never by updated_at
 *   expectedSequence   (GINV-API-004). Only one of these is meaningful per command.
 *   controlEpoch       Match control fencing (GINV-MATCH-004); unused outside Match.
 *
 * The envelope carries NO caller identity, role, capability or client clock. GINV-AUTH-003
 * makes those server-derived: the server resolves who is calling from the authenticated
 * session, resolves the resource context from the authoritative resource, and stamps its
 * own order and time. A field here claiming any of that would be forgeable by the browser,
 * which is exactly the class of bug AF-FREEZE-005 blocks in the repository guards.
 */

export interface CommandEnvelope<TPayload> {
  /** Stable across retries of the same logical intent. Distinct from requestId. */
  readonly commandId: string;
  readonly payload: TPayload;
  /** Semantic optimistic concurrency. Never a timestamp. */
  readonly expectedRevision?: number;
  readonly expectedSequence?: number;
  /** Match control fencing only. */
  readonly controlEpoch?: number;
}

/**
 * Per-attempt transport metadata.
 *
 * ADR-API-006 separates these deliberately: `commandId` identifies the intent, `requestId`
 * identifies one delivery attempt of it. Three retries of one intent are three requestIds
 * and one commandId, which is what lets the server recognise a duplicate rather than
 * executing it twice.
 */
export interface CommandTransport {
  readonly requestId: string;
  readonly clientRelease?: string;
}

export interface CommandContext<TPayload> {
  readonly envelope: CommandEnvelope<TPayload>;
  readonly transport: CommandTransport;
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** Starts a new logical intent. Use once per user action, not once per attempt. */
export function newCommand<TPayload>(
  payload: TPayload,
  options: Omit<CommandEnvelope<TPayload>, 'commandId' | 'payload'> = {},
): CommandEnvelope<TPayload> {
  return { commandId: newId(), payload, ...options };
}

/**
 * Produces the transport metadata for one attempt of an existing intent.
 *
 * Retrying keeps the envelope untouched and only mints a new requestId, so a caller cannot
 * accidentally turn a retry into a second logical command.
 */
export function newAttempt(clientRelease?: string): CommandTransport {
  return clientRelease ? { requestId: newId(), clientRelease } : { requestId: newId() };
}

export function withAttempt<TPayload>(
  envelope: CommandEnvelope<TPayload>,
  clientRelease?: string,
): CommandContext<TPayload> {
  return { envelope, transport: newAttempt(clientRelease) };
}
