import { withAttempt, type CommandEnvelope } from './commandEnvelope';
import type { CommandResult } from './commandOutcome';
import type { CommandPort } from './commandPort';

/**
 * XS-W2-06 — semantic Community write commands.
 *
 * "Use Application use cases/gateways. Do not have React components know target table
 * shape." So each command names an INTENT and carries a typed payload; nothing here
 * exposes a row, a column set or a patch object. A component asks to rename a community;
 * it does not learn that `communities.name` exists.
 *
 * This is also why there is no generic update. A patch-shaped command would let a caller
 * reach owner_id or authority_model and quietly change who owns the row -- the exact defect
 * the slice removes at the database level.
 */

export const COMMUNITY_OPERATIONS = {
  create: 'create_community_with_owner',
  updateProfile: 'update_community_profile',
  archive: 'archive_community',
  transferOwnership: 'transfer_community_ownership_v2',
} as const;

export interface CreateCommunityPayload {
  readonly p_name: string;
}

export interface UpdateCommunityProfilePayload {
  readonly p_community_id: string;
  readonly p_name?: string;
  readonly p_description?: string;
  readonly p_default_location?: string;
}

export interface ArchiveCommunityPayload {
  readonly p_community_id: string;
}

export interface TransferCommunityOwnershipPayload {
  readonly p_community_id: string;
  readonly p_new_owner_user_id: string;
}

function envelope<TPayload>(payload: TPayload): CommandEnvelope<TPayload> {
  return { commandId: globalThis.crypto.randomUUID(), payload };
}

export function createCommunityCommand(name: string): CommandEnvelope<CreateCommunityPayload> {
  return envelope({ p_name: name });
}

/**
 * Only the fields actually being changed travel.
 *
 * Sending every field on every edit is how one client silently reverts another's change:
 * the payload carries stale values for fields the user never touched.
 */
export function updateCommunityProfileCommand(
  communityId: string,
  changes: { name?: string; description?: string; defaultLocation?: string },
): CommandEnvelope<UpdateCommunityProfilePayload> {
  return envelope({
    p_community_id: communityId,
    ...(changes.name === undefined ? {} : { p_name: changes.name }),
    ...(changes.description === undefined ? {} : { p_description: changes.description }),
    ...(changes.defaultLocation === undefined
      ? {}
      : { p_default_location: changes.defaultLocation }),
  });
}

export function archiveCommunityCommand(
  communityId: string,
): CommandEnvelope<ArchiveCommunityPayload> {
  return envelope({ p_community_id: communityId });
}

export function transferCommunityOwnershipCommand(
  communityId: string,
  newOwnerUserId: string,
): CommandEnvelope<TransferCommunityOwnershipPayload> {
  return envelope({ p_community_id: communityId, p_new_owner_user_id: newOwnerUserId });
}

/**
 * There is deliberately no restoreCommunityCommand.
 *
 * C6.01 describes RestoreCommunity as "if/when policy accepted", and that policy has not
 * been accepted. Shipping one now would decide, by implementation, who may bring an
 * archived community back and under what conditions.
 */

export async function executeCommunityCommand<TPayload, TValue = void>(
  port: CommandPort,
  operation: (typeof COMMUNITY_OPERATIONS)[keyof typeof COMMUNITY_OPERATIONS],
  command: CommandEnvelope<TPayload>,
  clientRelease?: string,
): Promise<CommandResult<TValue>> {
  return port.execute<TPayload, TValue>(operation, withAttempt(command, clientRelease));
}
