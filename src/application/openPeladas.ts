import type { Session } from '@shared/types';

const FECHADAS = new Set(['finished', 'cancelled']);
const EM_JOGO = new Set(['active', 'paused']);

export function openPeladas(sessions: Session[], communityId: string): Session[] {
  return sessions
    .filter(
      (session) =>
        session.communityId === communityId && !session.deletedAt && !FECHADAS.has(session.status),
    )
    .sort((a, b) => {
      const jogoA = EM_JOGO.has(a.status) ? 0 : 1;
      const jogoB = EM_JOGO.has(b.status) ? 0 : 1;
      if (jogoA !== jogoB) return jogoA - jogoB;
      return (a.plannedStartAt || a.date).localeCompare(b.plannedStartAt || b.date);
    });
}
