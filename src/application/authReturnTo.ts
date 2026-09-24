export const RETURN_TO_PARAM = 'proxima';
const CHAVE = 'volley:auth:proxima';
const PADRAO = '/painel';

export interface ReturnToStorage {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

function storagePadrao(): ReturnToStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Caminho interno, absoluto e sem host. `//outro.site` tambem e externo. */
function eDestinoInterno(valor: string | null | undefined): valor is string {
  if (!valor) return false;
  return valor.startsWith('/') && !valor.startsWith('//');
}

export function withReturnTo(rota: string, destino: string | null | undefined): string {
  if (!eDestinoInterno(destino) || destino === PADRAO) return rota;
  return `${rota}?${RETURN_TO_PARAM}=${encodeURIComponent(destino)}`;
}

export function rememberReturnTo(
  destino: string | null | undefined,
  storage: ReturnToStorage | null = storagePadrao(),
): void {
  if (!storage || !eDestinoInterno(destino) || destino === PADRAO) return;
  try {
    storage.setItem(CHAVE, destino);
  } catch {
    /* aba anonima, cookies bloqueados: o retorno e conveniencia, nao requisito */
  }
}

/** Le e consome: o destino vale uma volta so. */
export function readReturnTo(storage: ReturnToStorage | null = storagePadrao()): string | null {
  if (!storage) return null;
  try {
    const guardado = storage.getItem(CHAVE);
    if (guardado) storage.removeItem(CHAVE);
    return eDestinoInterno(guardado) ? guardado : null;
  } catch {
    return null;
  }
}

export function resolveReturnTo(input: {
  search: string;
  locationState: unknown;
  storage?: ReturnToStorage | null;
}): string {
  const storage = input.storage === undefined ? storagePadrao() : input.storage;

  const daUrl = (() => {
    try {
      return new URLSearchParams(input.search).get(RETURN_TO_PARAM);
    } catch {
      return null;
    }
  })();
  if (eDestinoInterno(daUrl)) {
    if (storage) {
      try {
        storage.removeItem(CHAVE);
      } catch {
        /* nada a fazer */
      }
    }
    return daUrl;
  }

  const doState = (input.locationState as { from?: { pathname?: string } } | null)?.from?.pathname;
  if (eDestinoInterno(doState)) return doState;

  return readReturnTo(storage) ?? PADRAO;
}
