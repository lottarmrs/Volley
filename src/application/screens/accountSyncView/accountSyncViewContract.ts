import type { Player, UserProfile } from '@shared/types';
import type { RecoverableSyncActions, SyncIssueSummary } from '@logic/syncIssueLedger';
import type { SyncConflictItem } from '../../../components/account/SyncConflictSection';
import type { ScreenContract } from '../screenContract';
import type { AccountSyncViewModel } from './accountSyncViewModel';
import type { AccountSyncViewIntent } from './accountSyncViewIntents';

export interface AccountSyncViewContractInput {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
  isSupabaseConfigured: boolean;
  lastSyncedAt: string | null;
  syncLoading: boolean;
  players: Player[];
  recoverableSyncActions?: RecoverableSyncActions;
  syncIssueSummary?: SyncIssueSummary;
  syncConflicts?: SyncConflictItem[];

  onSync: () => Promise<void>;
  onRepairDuplicates: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onLinkGoogleIdentity: () => Promise<void>;
  onRetryPrimarySyncAction?: () => Promise<void> | void;
  onClearResolvedSyncIssues?: () => Promise<void> | void;
  onKeepMineConflict?: (sessionId: string) => void;
  onKeepTheirsConflict?: (sessionId: string) => void;
}

function buildModel(input: AccountSyncViewContractInput): AccountSyncViewModel {
  return {
    user: input.user,
    profile: input.profile,
    loading: input.loading,
    isSupabaseConfigured: input.isSupabaseConfigured,
    lastSyncedAt: input.lastSyncedAt,
    syncLoading: input.syncLoading,
    players: input.players,
    recoverableSyncActions: input.recoverableSyncActions,
    syncIssueSummary: input.syncIssueSummary,
    syncConflicts: input.syncConflicts,
  };
}

export function buildAccountSyncViewContract(
  input: AccountSyncViewContractInput,
): ScreenContract<AccountSyncViewModel, AccountSyncViewIntent> {
  const model = buildModel(input);
  const dispatch = async (intent: AccountSyncViewIntent): Promise<void> => {
    switch (intent.kind) {
      case 'sync':
        await input.onSync();
        return;
      case 'repairDuplicates':
        await input.onRepairDuplicates();
        return;
      case 'signOut':
        await input.onSignOut();
        return;
      case 'linkGoogleIdentity':
        await input.onLinkGoogleIdentity();
        return;
      case 'retryPrimarySyncAction':
        if (input.onRetryPrimarySyncAction) await input.onRetryPrimarySyncAction();
        return;
      case 'clearResolvedSyncIssues':
        if (input.onClearResolvedSyncIssues) await input.onClearResolvedSyncIssues();
        return;
      case 'keepMineConflict':
        if (input.onKeepMineConflict) input.onKeepMineConflict(intent.sessionId);
        return;
      case 'keepTheirsConflict':
        if (input.onKeepTheirsConflict) input.onKeepTheirsConflict(intent.sessionId);
        return;
    }
  };
  return { model, dispatch };
}
