import type { SessionConflict } from '../logic/syncConflicts';
import type { PointEvent } from '../types';

export type ConflictStatus = 'pending_decision' | 'resolved_keep_mine' | 'resolved_keep_theirs';

interface Entrada {
  pointEvents: PointEvent[];
  sessionId: string;
  now: string;
}

/** Minha versao vale: os eventos seguem pendentes e voltam a poder subir. */
export function resolveConflictKeepingMine(input: Entrada): PointEvent[] {
  return input.pointEvents.map((evento) =>
    evento.sessionId === input.sessionId
      ? ({ ...evento, conflictStatus: 'resolved_keep_mine' } as PointEvent)
      : evento,
  );
}

/**
 * A versao da outra pessoa vale.
 *
 * Os meus eventos viram SOFT-DELETE, nunca apagados: a regra do plano e que nenhum
 * placar desaparece em silencio, e o `deletedAt` mantem a linha recuperavel.
 */
export function resolveConflictKeepingTheirs(input: Entrada): PointEvent[] {
  return input.pointEvents.map((evento) =>
    evento.sessionId === input.sessionId
      ? ({
          ...evento,
          deletedAt: input.now,
          syncStatus: 'pending',
          conflictStatus: 'resolved_keep_theirs',
        } as PointEvent)
      : evento,
  );
}

/**
 * Carimba os eventos das sessoes em conflito para que o upload saiba segura-los.
 *
 * A deteccao sozinha nao muda nada: e este carimbo, persistido junto com o evento,
 * que faz o filtro de upload funcionar e que mantem o conflito visivel entre
 * recarregamentos do app.
 */
export function markConflictedEvents(
  pointEvents: PointEvent[],
  conflicts: SessionConflict[],
): PointEvent[] {
  const emConflito = new Set(conflicts.map((c) => c.sessionId));
  if (emConflito.size === 0) return pointEvents;
  return pointEvents.map((evento) =>
    emConflito.has(evento.sessionId) &&
    (evento as { conflictStatus?: string }).conflictStatus === undefined
      ? ({ ...evento, conflictStatus: 'pending_decision' } as PointEvent)
      : evento,
  );
}
