export function getAccountDisplay(input: {
  profileName?: string | null;
  email?: string | null;
  fallbackName: string;
  fallbackInitials: string;
}) {
  const name = input.profileName || input.email?.split('@')[0] || input.fallbackName;
  const initialsSource = input.profileName || input.email || input.fallbackInitials;
  return {
    name,
    initials: initialsSource.slice(0, 2).toUpperCase(),
  };
}

import type { ConnectivityState } from '../logic/connectivity';

export interface PendingDeliveryNotice {
  visible: boolean;
  message: string;
}

/**
 * Aviso persistente de trabalho que nao chegou na nuvem.
 *
 * So aparece quando ha pendente E algo de fato impede a entrega (sem rede, ou falha
 * aberta). Pendente com rede e sem falha e apenas o sync que ainda nao rodou — avisar
 * ali treinaria a pessoa a ignorar o aviso.
 *
 * A palavra importa: "3 pendentes" descreve uma fila, "3 alteracoes ainda nao foram
 * para a nuvem" descreve uma perda possivel.
 */
export function buildPendingDeliveryNotice(input: {
  pendingChanges: number;
  connectivity: ConnectivityState;
  hasOpenFailure: boolean;
}): PendingDeliveryNotice | null {
  if (input.pendingChanges <= 0) return null;
  if (input.connectivity === 'online' && !input.hasOpenFailure) return null;

  const plural =
    input.pendingChanges === 1 ? 'alteração ainda não foi' : 'alterações ainda não foram';
  return {
    visible: true,
    message: `${input.pendingChanges} ${plural} para a nuvem.`,
  };
}
