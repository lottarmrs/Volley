export const SCORING_READ_ONLY_MESSAGE =
  'Você está acompanhando ao vivo. Só quem organiza marca o placar.';

export const SCORING_OFFLINE_MESSAGE = 'Sem conexão. O placar volta quando o sinal voltar.';

export const SCORING_SENDING_MESSAGE = 'Enviando…';
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
