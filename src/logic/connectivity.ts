/**
 * Estado de rede do app.
 *
 * `navigator.onLine` responde `true` num wi-fi sem internet — o caso do ginasio com
 * roteador sem link. Por isso ele e PISTA, nao veredito: quem manda e o resultado de
 * uma requisicao de verdade. O evento do browser serve para ANTECIPAR uma tentativa,
 * nao para declarar o estado.
 */
export type ConnectivityState = 'online' | 'offline' | 'unknown';

export type RequestOutcome = 'success' | 'network_failure';

export function nextConnectivityState(input: {
  current: ConnectivityState;
  browserOnline: boolean;
  lastOutcome?: RequestOutcome | null;
}): ConnectivityState {
  if (input.lastOutcome === 'success') return 'online';
  if (input.lastOutcome === 'network_failure') return 'offline';
  return input.browserOnline ? 'online' : 'offline';
}
