export type CloudHealthLevel = 'operational' | 'attention' | 'offline';

export interface CloudHealthInput {
  isSupabaseConfigured: boolean;
  hasUser: boolean;
  lastSyncedAt: string | null;
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
      detail: 'Supabase nao configurado',
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
      title: 'Requer atencao',
      detail: `${input.openIssueCount} falha(s) aberta(s), ${input.totalOpenOccurrences} ocorrencia(s)`,
    };
  }

  return {
    level: 'operational',
    title: 'Operacional',
    detail: input.lastSyncedAt
      ? 'Ultima sincronizacao registrada'
      : 'Pronto para primeira sincronizacao',
  };
}
