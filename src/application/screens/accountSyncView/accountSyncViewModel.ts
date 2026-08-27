import type { Player, UserProfile } from '@shared/types';
import type { RecoverableSyncActions, SyncIssueSummary } from '@logic/syncIssueLedger';
import type { SyncConflictItem } from '../../../components/account/SyncConflictSection';

export interface AccountSyncViewModel {
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
}
