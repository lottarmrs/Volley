export interface StartupCloudDownloadInput {
  authState:
    | 'initializing'
    | 'anonymous'
    | 'email_verification'
    | 'onboarding'
    | 'mfa_required'
    | 'mfa_setup_required'
    | 'ready'
    | 'recoverable_error';
  isSupabaseConfigured: boolean;
  userId: string | null;
  autoSyncedForUserId: string | null;
  cacheOwnerId: string | null;
  pendingChanges: number;
}

export interface StartupCloudDownloadPlan {
  shouldDownload: boolean;
  nextAutoSyncedForUserId: string | null;
}

export function planStartupCloudDownload(
  input: StartupCloudDownloadInput,
): StartupCloudDownloadPlan {
  if (input.authState !== 'ready') {
    return { shouldDownload: false, nextAutoSyncedForUserId: null };
  }

  if (!input.isSupabaseConfigured) {
    return {
      shouldDownload: false,
      nextAutoSyncedForUserId: input.autoSyncedForUserId,
    };
  }

  if (!input.userId) {
    return {
      shouldDownload: false,
      nextAutoSyncedForUserId: null,
    };
  }

  if (input.autoSyncedForUserId === input.userId) {
    return {
      shouldDownload: false,
      nextAutoSyncedForUserId: input.autoSyncedForUserId,
    };
  }

  if (input.cacheOwnerId && input.cacheOwnerId !== input.userId) {
    return {
      shouldDownload: true,
      nextAutoSyncedForUserId: input.userId,
    };
  }

  if (input.pendingChanges > 0) {
    return {
      shouldDownload: false,
      nextAutoSyncedForUserId: input.autoSyncedForUserId,
    };
  }

  return {
    shouldDownload: true,
    nextAutoSyncedForUserId: input.userId,
  };
}
