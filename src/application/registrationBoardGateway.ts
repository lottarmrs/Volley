import type { RegistrationBoard, RegistrationEntryStatus } from '@shared/types';
import type { RegistrationGateway } from './authorizedFormationGateways';
import type { CreateTargetSessionInput } from './sessionCohortCutover';

export interface RegistrationBoardGateway {
  readSessionBoard(sessionId: string): Promise<RegistrationBoard | null>;
  readBoard(windowId: string): Promise<RegistrationBoard>;
  join(input: {
    commandId: string;
    entryId: string;
    windowId: string;
  }): Promise<RegistrationEntryStatus>;
  leave(input: { commandId: string; windowId: string }): Promise<void>;
  createTargetSession(input: CreateTargetSessionInput): Promise<{ id: string }>;
  readTargetSession(sessionId: string): Promise<{ id: string }>;
  readonly registration: RegistrationGateway;
}
