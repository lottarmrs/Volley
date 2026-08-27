import type { Community, Division, Player, Session } from '@shared/types';
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
  partnershipMatrix?: PartnershipMatrix;
  stepLabels: string[];
  positionLabels: Record<string, string>;
  positionOrder: string[];
}
