export type CloudHealthLevel = 'operational' | 'attention' | 'offline';

export interface CloudHealthInput {
  isSupabaseConfigured: boolean;
  hasUser: boolean;
  lastSyncedAt: string | null;
  checkedAt?: string;
  openIssueCount: number;
  totalOpenOccurrences: number;
}

export interface CloudHealthViewModel {
  level: CloudHealthLevel;
  title: string;
  detail: string;
}

export function buildCloudHealthViewModel(input: CloudHealthInput): CloudHealthViewModel {
  if (!input.isSupabaseConfigured) {
    return {
      level: 'offline',
      title: 'Nuvem indisponivel',
      detail: 'Supabase não configurado',
    };
  }

  if (!input.hasUser) {
    return {
      level: 'attention',
      title: 'Login necessario',
      detail: 'Entre na conta para sincronizar',
    };
  }

  if (input.openIssueCount > 0) {
    return {
      level: 'attention',
      title: 'Requer atenção',
      detail: `${input.openIssueCount} falha(s) aberta(s), ${input.totalOpenOccurrences} ocorrencia(s)`,
    };
  }

  if (isLastSyncStale(input.lastSyncedAt, input.checkedAt)) {
    return {
      level: 'attention',
      title: 'Backup desatualizado',
      detail: 'Última sincronização há mais de 48h',
    };
  }

  return {
    level: 'operational',
    title: 'Operacional',
    detail: input.lastSyncedAt
      ? 'Última sincronização registrada'
      : 'Pronto para primeira sincronizacao',
  };
}

function isLastSyncStale(lastSyncedAt: string | null, checkedAt?: string): boolean {
  if (!lastSyncedAt) return false;

  const lastSyncTime = Date.parse(lastSyncedAt);
  const checkedTime = checkedAt ? Date.parse(checkedAt) : Date.now();
  if (!Number.isFinite(lastSyncTime) || !Number.isFinite(checkedTime)) return false;

  const staleThresholdMs = 48 * 60 * 60 * 1000;
  return checkedTime - lastSyncTime > staleThresholdMs;
}
