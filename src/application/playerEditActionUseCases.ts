export const PLAYER_PERMISSION_DENIED_MESSAGE =
  'Erro: Ação não autorizada pelo nível de permissão.';

export function getPlayerEditActionErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message === 'PERMISSION_DENIED') {
    return PLAYER_PERMISSION_DENIED_MESSAGE;
  }

  return null;
}
