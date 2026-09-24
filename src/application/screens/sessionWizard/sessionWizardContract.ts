import type {
  AuthorizedFormationStage,
  CandidateSetPublicationState,
  Community,
  Division,
  Player,
  Session,
} from '@shared/types';
import type { PartnershipMatrix } from '@logic/partnershipHistory';
import type { ScreenContract } from '../screenContract';
import type { SessionWizardModel } from './sessionWizardModel';
import type { SessionWizardIntent } from './sessionWizardIntents';

export type SessionWizardHookApi = {
  /** Guarda a pelada na lista do grupo antes do sorteio, para a inscricao
   *  ter onde acontecer. */
  scheduleSession: () => void;
  canSchedule: boolean;
  isScheduled: boolean;
  scheduleError: string | null;
  wizardStep: number;
  validationErrors: Record<string, string>;
  bestDivisions: Division[];
  setBestDivisions: (d: Division[]) => void;
  selectedDivisionIndex: number;
  setSelectedDivisionIndex: (i: number) => void;
  isGenerating: boolean;
  progress: number;
  generationStage: AuthorizedFormationStage | null;
  authorizedDraw: { estimatedCount: number; participantCount: number } | null;
  publicationState: CandidateSetPublicationState;
  publicationError: string | null;
  publishCandidateSet: () => Promise<void>;
  nextStep: () => void;
  prevStep: () => void;
  updateSession: (patch: Partial<Session>) => void;
  togglePlayer: (id: string) => void;
  selectAllActivePlayers: () => void;
  clearSelectedPlayers: () => void;
  useLastSelection: () => void;
  validateCurrentStep: () => boolean;
  generateDivisions: (advanceStep?: boolean) => void;
  cancelGeneration: () => void;
  confirmDivision: () => void;
  startGeneratedTournament: () => void;
  cancelWizard: () => void;
  togglePlayerLock: (playerId: string, teamIdx: number) => void;
  addPairConstraint: (p1: string, p2: string, type: 'together' | 'separated') => void;
  removePairConstraint: (p1: string, p2: string, type: 'together' | 'separated') => void;
  partnershipMatrix?: PartnershipMatrix;
};

export interface SessionWizardContractInput {
  activeSession: Session | null;
  players: Player[];
  communities: Community[];
  hookApi: SessionWizardHookApi;
  applyGuestPlayer: (player: Player, editDetails: boolean) => void;
}

function buildModel(input: SessionWizardContractInput): SessionWizardModel {
  const h = input.hookApi;
  return {
    activeSession: input.activeSession,
    players: input.players,
    communities: input.communities,
    wizardStep: h.wizardStep,
    validationErrors: h.validationErrors,
    bestDivisions: h.bestDivisions,
    selectedDivisionIndex: h.selectedDivisionIndex,
    isGenerating: h.isGenerating,
    generationProgress: h.progress,
    generationStage: h.generationStage,
    authorizedDraw: h.authorizedDraw,
    publicationState: h.publicationState,
    publicationError: h.publicationError,
    partnershipMatrix: h.partnershipMatrix,
    canSchedule: h.canSchedule,
    isScheduled: h.isScheduled,
    scheduleError: h.scheduleError,
    stepLabels: ['Sessão', 'Atletas', 'Formato', 'Regras', 'Revisão', 'Times', 'Tabela'],
    positionLabels: {
      levantador: 'Levantador',
      ponteiro: 'Ponteiro',
      oposto: 'Oposto',
      central: 'Central',
      libero: 'Líbero',
      'all-rounder': 'Curinga',
    },
    positionOrder: ['levantador', 'ponteiro', 'oposto', 'central', 'libero', 'all-rounder'],
  };
}

export function buildSessionWizardContract(
  input: SessionWizardContractInput,
): ScreenContract<SessionWizardModel, SessionWizardIntent> {
  const model = buildModel(input);
  const dispatch = async (intent: SessionWizardIntent): Promise<void> => {
    const h = input.hookApi;
    switch (intent.kind) {
      case 'next':
        if (h.validateCurrentStep()) h.nextStep();
        return;
      case 'prev':
        h.prevStep();
        return;
      case 'cancel':
        h.cancelWizard();
        return;
      case 'scheduleSession':
        h.scheduleSession();
        return;
      case 'updateSession':
        h.updateSession(intent.patch);
        return;
      case 'togglePlayer':
        h.togglePlayer(intent.id);
        return;
      case 'selectAllActive':
        h.selectAllActivePlayers();
        return;
      case 'clearSelection':
        h.clearSelectedPlayers();
        return;
      case 'useLastSelection':
        h.useLastSelection();
        return;
      case 'generateDivisions':
        h.generateDivisions(intent.advanceStep);
        return;
      case 'cancelGeneration':
        h.cancelGeneration();
        return;
      case 'publishCandidateSet':
        await h.publishCandidateSet();
        return;
      case 'confirmDivision':
        h.confirmDivision();
        return;
      case 'startGeneratedTournament':
        h.startGeneratedTournament();
        return;
      case 'selectDivisionIndex':
        h.setSelectedDivisionIndex(intent.index);
        return;
      case 'togglePlayerLock':
        h.togglePlayerLock(intent.playerId, intent.teamIdx);
        return;
      case 'addPairConstraint':
        h.addPairConstraint(intent.p1, intent.p2, intent.type);
        return;
      case 'removePairConstraint':
        h.removePairConstraint(intent.p1, intent.p2, intent.type);
        return;
      case 'setBestDivisions':
        h.setBestDivisions(intent.divisions);
        return;
      case 'addGuestPlayer':
        input.applyGuestPlayer(intent.player, intent.editDetails);
        return;
    }
  };
  return { model, dispatch };
}
