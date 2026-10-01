type QueryKey = readonly string[];

interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: never) => void;
}

export function createInvalidationBatcher(
  flush: (keys: QueryKey[]) => void,
  options: { delayMs: number; maxWaitMs: number; timers?: Timers },
) {
  const timers: Timers = options.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id),
  };
  const pendentes = new Map<string, QueryKey>();
  let espera: unknown = null;
  let teto: unknown = null;

  const limpar = () => {
    if (espera !== null) timers.clearTimeout(espera as never);
    if (teto !== null) timers.clearTimeout(teto as never);
    espera = null;
    teto = null;
  };

  const disparar = () => {
    limpar();
    if (pendentes.size === 0) return;
    const keys = [...pendentes.values()];
    pendentes.clear();
    flush(keys);
  };

  return {
    add(keys: ReadonlyArray<QueryKey>) {
      for (const key of keys) pendentes.set(key.join('\u0000'), key);
      if (espera !== null) timers.clearTimeout(espera as never);
      espera = timers.setTimeout(disparar, options.delayMs);
      if (teto === null) teto = timers.setTimeout(disparar, options.maxWaitMs);
    },
    cancel() {
      limpar();
      pendentes.clear();
    },
  };
}
