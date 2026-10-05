export const SCORING_READ_ONLY_MESSAGE =
  'Você está acompanhando ao vivo. Só quem organiza marca o placar.';

export const SCORING_OFFLINE_MESSAGE = 'Sem conexão. O placar volta quando o sinal voltar.';

export const SCORING_SENDING_MESSAGE = 'Enviando…';
export const SCORING_OFFLINE_EMPTY_MESSAGE =
  'Sem sinal. Os pontos marcados ficam guardados no aparelho.';
export const SCORING_WAITING_MESSAGE = 'Pontos guardados no aparelho, aguardando para enviar.';
export const FINISH_NEEDS_SIGNAL_MESSAGE =
  'Encerre quando o sinal voltar e os pontos forem enviados.';

export function scoringOfflineFor(input: {
  online: boolean;
  connectivity: 'online' | 'offline' | 'unknown';
  lastWriteOffline: boolean;
}): boolean {
  if (!input.online) return false;
  return input.connectivity === 'offline' || input.lastWriteOffline;
}

const STALE_AFTER_MS = 3 * 60_000;

export function staleScoreNotice(input: {
  readOnly: boolean;
  gameActive: boolean;
  lastPointAt: string | null;
  now: number;
}): string | null {
  if (!input.readOnly || !input.gameActive || !input.lastPointAt) return null;
  const decorrido = input.now - new Date(input.lastPointAt).getTime();
  if (decorrido < STALE_AFTER_MS) return null;
  return `Último ponto há ${Math.floor(decorrido / 60_000)} min — quem marca pode estar sem sinal`;
}
