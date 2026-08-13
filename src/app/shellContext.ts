import { useOutletContext } from 'react-router';
import type { Community, CommunityRules, Player } from '@shared/types';
import type { AppResult } from '@app/appResult';
import type { SessionContextValue } from '@ui/common/useSession';
import type { usePlayers } from '../hooks/usePlayers';
import type { useCommunities } from '../hooks/useCommunities';
import type { useCommunityPresence } from '../hooks/useCommunityPresence';
import type { useCommunityRules } from '../hooks/useCommunityRules';
import type { useWhatsAppListTemplates } from '../hooks/useWhatsAppListTemplates';
import type { useChampionships } from '../hooks/useChampionships';
import type { useAuth } from '../hooks/useAuth';
import type { useToast } from '@ui/common/useToast';
import type { useCloudSync } from '../hooks/useCloudSync';
import type { useSessionWizard } from '../hooks/useSessionWizard';
import type { SessionDraft } from '../logic/sessionDraft';

export interface ShellApi {
  sess: SessionContextValue;
  play: ReturnType<typeof usePlayers>;
  comm: ReturnType<typeof useCommunities>;
  communityPresence: ReturnType<typeof useCommunityPresence>;
  communityRules: ReturnType<typeof useCommunityRules>;
  whatsAppLists: ReturnType<typeof useWhatsAppListTemplates>;
  championships: ReturnType<typeof useChampionships>;
  auth: ReturnType<typeof useAuth>;
  toasts: ReturnType<typeof useToast>;
  cloudSync: ReturnType<typeof useCloudSync>;
  wizard: ReturnType<typeof useSessionWizard>;
  currentDeviceId: string;
  sessionDraft: SessionDraft | null;
  pendingChanges: number;
  handleExportBackup: () => void;
  handleImportBackup: (file: File) => void;
  handleFinishSession: () => void;
  createSessionFromCommunity: (
    community: Community,
    playerIds: string[],
    rules: CommunityRules,
  ) => void;
  createPlayerForCommunity: (name: string, communityId: string) => void;
  materializeChampionshipRound: (roundId: string) => AppResult<{ sessionId: string }>;
  deleteChampionshipAggregate: (championshipId: string) => void;
  deleteCommunityAggregate: (communityId: string) => void;
  handlePlayerEditActionError: (error: unknown) => void;
  applyGuestPlayer: (player: Player, editDetails: boolean) => void;
}

export function useShell(): ShellApi {
  return useOutletContext<ShellApi>();
}

export interface CommunityShellApi extends ShellApi {
  community: Community;
}

export function useCommunityShell(): CommunityShellApi {
  return useOutletContext<CommunityShellApi>();
}
