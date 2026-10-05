const SEM_PAGAMENTO = /(\d+) confirmed entries without payment/;

export function unpaidRefusalMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const { hint, message } = error as { hint?: unknown; message?: unknown };
  const texto = typeof message === 'string' ? message : '';
  const achado = SEM_PAGAMENTO.exec(texto);
  if (!achado && hint !== 'REGISTRATION_UNPAID') return null;
  const n = achado ? Number(achado[1]) : null;
  const quem =
    n === null
      ? 'Há confirmados que ainda não pagaram.'
      : n === 1
        ? '1 confirmado ainda não pagou.'
        : `${n} confirmados ainda não pagaram.`;
  return `${quem} Marque quem pagou ou defina um prazo: quem não pagar até lá vai para a reserva.`;
}
