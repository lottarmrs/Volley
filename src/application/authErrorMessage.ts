const GENERICA = 'Não deu para entrar agora. Tente de novo.';

const CONHECIDOS: Array<[RegExp, string]> = [
  [/invalid[_ ]login[_ ]credentials|invalid_credentials/i, 'E-mail ou senha incorretos.'],
  [
    /email[_ ]not[_ ]confirmed/i,
    'Confirme seu e-mail antes de entrar. O link chegou na sua caixa de entrada.',
  ],
  [/already[_ ]registered|user_already_exists/i, 'Este e-mail já tem conta. Entre com ele.'],
  [/rate[_ ]limit|too many requests/i, 'Muitas tentativas. Espere um minuto e tente de novo.'],
  [/captcha/i, 'Confirme que você não é um robô e tente de novo.'],
  [/failed to fetch|network/i, 'Sem conexão. Tente de novo quando o sinal voltar.'],
  [
    /invalid totp|mfa_verification_failed|totp.*(expired|invalid)/i,
    'Código incorreto ou vencido. Confira o app autenticador e tente de novo.',
  ],
  [
    /mfa.*(disabled|not[_ ]enabled)|totp_enroll_not_enabled/i,
    'A verificação em duas etapas está desligada no servidor. Avise quem administra o Volley.',
  ],
];

const INGLES = /\b(the|error|user|invalid|database|failed|request|unable)\b/i;

export function authErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return GENERICA;
  const { message, code } = error as { message?: unknown; code?: unknown };
  const texto = `${typeof code === 'string' ? code : ''} ${typeof message === 'string' ? message : ''}`;
  for (const [padrao, frase] of CONHECIDOS) {
    if (padrao.test(texto)) return frase;
  }
  if (typeof message !== 'string' || !message.trim()) return GENERICA;
  return INGLES.test(message) ? GENERICA : message;
}
