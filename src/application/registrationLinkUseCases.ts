import type { Session } from '@shared/types';

export interface RegistrationTarget {
  /** Para sessao target o id local E o id de nuvem: `create_target_session`
   *  recebe `session.id` e devolve o mesmo id. Entao o id da URL basta. */
  sessionCloudId: string;
  name: string | null;
  date: string | null;
  /** Nao ha copia local: o cabecalho precisa esperar a leitura na nuvem. */
  fromLink: boolean;
}

export function resolveRegistrationTarget(input: {
  routeSessionId: string | undefined;
  session: Session | null;
}): RegistrationTarget | null {
  if (!input.routeSessionId) return null;

  if (!input.session) {
    return { sessionCloudId: input.routeSessionId, name: null, date: null, fromLink: true };
  }

  return {
    sessionCloudId: input.session.cloudId ?? input.routeSessionId,
    name: input.session.name,
    date: input.session.date,
    fromLink: false,
  };
}

function formatarDia(iso: string): string {
  const data = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

export function buildRegistrationShareMessage(input: {
  sessionName: string;
  sessionDate: string;
  capacity: number;
  confirmedCount: number;
  url: string;
  /** Caminho para quem ainda nao e do grupo. Sem codigo de convite nao existe,
   *  e a mensagem nao pode prometer um caminho que nao ha. */
  inviteUrl?: string | null;
}): string {
  const livres = Math.max(0, input.capacity - input.confirmedCount);
  const chamada =
    livres > 0
      ? `Ainda tem ${livres} ${livres === 1 ? 'vaga' : 'vagas'}.`
      : 'A lista encheu, mas dá para entrar na reserva.';

  const linhas = [
    `🏐 *${input.sessionName}*`,
    formatarDia(input.sessionDate),
    '',
    chamada,
    'Garanta a sua pelo link — a ordem de chegada decide quem joga:',
    input.url,
  ];

  if (input.inviteUrl) {
    linhas.push('', 'Ainda não é do grupo? Peça entrada por aqui:', input.inviteUrl);
  }

  return linhas.join('\n');
}

export function buildRegistrationShareUrl(input: {
  origin: string;
  communityId: string;
  sessionId: string;
}): string {
  return `${input.origin.replace(/\/$/, '')}/comunidades/${input.communityId}/sessoes/${input.sessionId}/inscricao`;
}
