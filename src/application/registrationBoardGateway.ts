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
  createTargetSession(input: CreateTargetSessionInput): Promise<{ id: string }>;
  readTargetSession(sessionId: string): Promise<{ id: string }>;
  readonly registration: RegistrationGateway;
}
