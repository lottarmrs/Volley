/** Espelha o `password_min_length` configurado no projeto Supabase
 *  (Authentication -> Policies). Existe para o app rejeitar a senha curta antes de
 *  mandar para o servidor: sem isso o GoTrue recusa e devolve mensagem em ingles,
 *  que vaza direto para o usuario via setError(err.message).
 *
 *  Se o valor mudar no painel, mude aqui junto — as duas pontas precisam concordar. */
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_TOO_SHORT_MESSAGE = `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;

/** Devolve a mensagem de erro, ou null se a senha atende a politica. */
export function validatePasswordLength(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH ? PASSWORD_TOO_SHORT_MESSAGE : null;
}
