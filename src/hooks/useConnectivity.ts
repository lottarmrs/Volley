import { useCallback, useEffect, useState } from 'react';
import {
  nextConnectivityState,
  type ConnectivityState,
  type RequestOutcome,
} from '../logic/connectivity';

/**
 * Observa a rede e expoe o estado para quem precisa decidir se tenta de novo.
 *
 * `onlineAt` e um carimbo que muda toda vez que a rede VOLTA. Ele existe para servir
 * de dependencia de efeito: quem quiser reagir a "a rede voltou" observa esse numero,
 * em vez de tentar comparar estados anteriores na mao.
 */
export function useConnectivity() {
  const [state, setState] = useState<ConnectivityState>(() =>
    typeof navigator === 'undefined' ? 'unknown' : navigator.onLine ? 'online' : 'offline',
  );
  const [onlineAt, setOnlineAt] = useState(() => Date.now());

  const apply = useCallback((outcome: RequestOutcome | null) => {
    setState((current) => {
      const next = nextConnectivityState({
        current,
        browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
        lastOutcome: outcome,
      });
      // So carimba quando houve transicao PARA online, para o gatilho nao disparar
      // a cada render.
      if (next === 'online' && current !== 'online') setOnlineAt(Date.now());
      return next;
    });
  }, []);

  const reportOutcome = useCallback((outcome: RequestOutcome) => apply(outcome), [apply]);

  useEffect(() => {
    const aoMudar = () => apply(null);
    window.addEventListener('online', aoMudar);
    window.addEventListener('offline', aoMudar);
    return () => {
      window.removeEventListener('online', aoMudar);
      window.removeEventListener('offline', aoMudar);
    };
  }, [apply]);

  return { state, reportOutcome, onlineAt };
}
