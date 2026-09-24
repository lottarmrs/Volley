import type { Session } from '@shared/types';
import { appOk, productError, type AppResult } from './appResult';

const FORMATO_DE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Depois do sorteio a pelada tem times, e marcar deixaria a lista de inscricao
 *  contradizer o que ja foi decidido. */
const ANTES_DO_SORTEIO: Session['status'][] = ['draft', 'players_selected', 'configured'];

/** Seis por time: um time em quadra e a rotacao que o produto assume. E
 *  sugestao, nao regra -- quem organiza muda. */
export function suggestedRegistrationCapacity(session: {
  config?: { teamCount?: number } | null;
}): number {
  const times = session.config?.teamCount;
  return times && times > 0 ? times * 6 : 12;
}

export interface ScheduledSessionResult {
  session: Session;
  sessions: Session[];
}

export function buildScheduledSessionResult(input: {
  activeSession: Session | null;
  sessions: Session[];
  date: string;
  today: string;
  now: string;
}): AppResult<ScheduledSessionResult> {
  if (!input.activeSession) {
    return productError('invalid_input', 'Não há pelada em preparo para marcar.');
  }
  if (!input.activeSession.communityId) {
    return productError(
      'invalid_input',
      'A lista de presença é do grupo: marque a pelada dentro de uma comunidade.',
    );
  }
  if (!ANTES_DO_SORTEIO.includes(input.activeSession.status)) {
    return productError(
      'invalid_input',
      'Esta pelada já foi sorteada. Marcar de novo mudaria os times que o grupo já viu.',
    );
  }
  if (
    !FORMATO_DE_DATA.test(input.date) ||
    Number.isNaN(new Date(`${input.date}T12:00:00`).getTime())
  ) {
    return productError('invalid_input', 'Escolha uma data válida para a pelada.');
  }
  // A agenda e o painel só listam data >= hoje. Marcar para trás produziria uma
  // pelada que existe e ninguém alcança -- o defeito que esta fatia corrige.
  if (input.date < input.today) {
    return productError('invalid_input', 'Essa data já passou. Escolha hoje ou um dia à frente.');
  }

  const vagas = input.activeSession.registrationCapacity;
  if (vagas !== undefined && (!Number.isInteger(vagas) || vagas < 1)) {
    return productError('invalid_input', 'A pelada precisa de pelo menos uma vaga inteira.');
  }

  const session: Session = {
    ...input.activeSession,
    date: input.date,
    registrationCapacity: vagas ?? suggestedRegistrationCapacity(input.activeSession),
    updatedAt: input.now,
  };

  const jaEstava = input.sessions.some((atual) => atual.id === session.id);
  const sessions = jaEstava
    ? input.sessions.map((atual) => (atual.id === session.id ? session : atual))
    : [...input.sessions, session];

  return appOk({ session, sessions });
}
