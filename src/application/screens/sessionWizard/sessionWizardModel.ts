import type {
  AuthorizedFormationStage,
  CandidateSetPublicationState,
  Community,
  Division,
  Player,
  Session,
} from '@shared/types';
import type { PartnershipMatrix } from '@logic/partnershipHistory';

export interface SessionWizardModel {
  activeSession: Session | null;
  players: Player[];
  communities: Community[];
  wizardStep: number;
  validationErrors: Record<string, string>;
  bestDivisions: Division[];
  selectedDivisionIndex: number;
  isGenerating: boolean;
  generationProgress: number;
  generationStage: AuthorizedFormationStage | null;
  authorizedDraw: { estimatedCount: number; participantCount: number } | null;
  publicationState: CandidateSetPublicationState;
  publicationError: string | null;
  partnershipMatrix?: PartnershipMatrix;
  canSchedule: boolean;
  isScheduled: boolean;
  scheduleError: string | null;
  stepLabels: string[];
  positionLabels: Record<string, string>;
  positionOrder: string[];
}
