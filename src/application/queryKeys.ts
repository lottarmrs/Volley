export const queryKeys = {
  comunidades: (userId: string) => ['comunidades', userId] as const,
  atletas: (userId: string) => ['atletas', userId] as const,
  regras: (userId: string) => ['regras', userId] as const,
  peladas: (userId: string) => ['peladas', userId] as const,
  membros: (communityCloudId: string) => ['comunidade', communityCloudId, 'membros'] as const,
  numerosDaCarta: (communityCloudId: string) =>
    ['comunidade', communityCloudId, 'numeros-da-carta'] as const,
  noite: (userId: string) => ['noite', userId] as const,
};
