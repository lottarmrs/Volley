import type { AppError } from '../application/appResult';

/**
 * Intervalos entre tentativas, em milissegundos: 30s, 1min, 2min, 5min, 15min.
 * Depois do ultimo o intervalo para de crescer e fica nele — nao ha limite de
 * tentativas para erro de rede.
 */
export const RETRY_INTERVALS_MS = [30_000, 60_000, 120_000, 300_000, 900_000];

/** Nenhum destes se conserta sozinho com o tempo; insistir so gera ruido. */
const ERROS_ESTRUTURAIS: AppError['kind'][] = ['validation', 'authorization', 'conflict'];

const MARCAS_DE_REDE = ['failed to fetch', 'networkerror', 'load failed', 'network request failed'];

/**
 * Descobre a natureza do erro para decidir se vale reenviar.
 *
 * NAO use `instanceof Error` aqui: o PostgrestError do Supabase e um objeto simples
 * com `code` e `message`, e testar por instanceof descartaria todos eles em silencio.
 */
export function classifySyncError(error: unknown): AppError['kind'] {
  const bruto = error as { code?: string; message?: string } | null;
  const mensagem = (bruto?.message ?? '').toLowerCase();

  if (MARCAS_DE_REDE.some((marca) => mensagem.includes(marca))) return 'offline_unavailable';

  switch (bruto?.code) {
    case '42501':
      return 'authorization';
    case '22023':
      return 'validation';
    case '23505':
      return 'conflict';
    default:
      // Desconhecido vira `technical`, nunca `offline`: chutar offline faria o app
      // insistir para sempre num erro que nao vai passar.
      return 'technical';
  }
}

/**
 * Quando tentar de novo. `undefined` significa "nao tente automaticamente".
 *
 * Erro de rede NUNCA retorna undefined: congelar um sync de payload inteiro faria os
 * dados nunca subirem, que e a falha que este plano conserta.
 */
export function computeNextAttemptAt(input: {
  count: number;
  lastSeenAt: string;
  kind: AppError['kind'];
}): string | undefined {
  if (ERROS_ESTRUTURAIS.includes(input.kind)) return undefined;

  const indice = Math.min(Math.max(input.count, 1) - 1, RETRY_INTERVALS_MS.length - 1);
  const intervalo = RETRY_INTERVALS_MS[indice];
  return new Date(new Date(input.lastSeenAt).getTime() + intervalo).toISOString();
}
