import type { SessionConflict } from '../logic/syncConflicts';
import type { PointEvent } from '../types';

export type ConflictStatus = 'pending_decision' | 'resolved_keep_mine' | 'resolved_keep_theirs';

interface Entrada {
  pointEvents: PointEvent[];
  sessionId: string;
  now: string;
}

/**
 * Um evento e MEU e ainda nao entregue quando nao tem `cloudId`.
 *
 * Essa distincao e o que impede as resolucoes de tocarem no placar da outra pessoa.
 * Evento baixado da nuvem carrega `cloudId`; o que marquei offline, nao. Sem este
 * filtro, "manter o da outra pessoa" apagava justamente os eventos dela — a unica
 * versao que o usuario pediu para preservar.
 */
function ehMeuEPendente(evento: PointEvent, sessionId: string): boolean {
  return evento.sessionId === sessionId && !(evento as { cloudId?: string }).cloudId;
}

/** Minha versao vale: os meus eventos seguem pendentes e voltam a poder subir. */
export function resolveConflictKeepingMine(input: Entrada): PointEvent[] {
  return input.pointEvents.map((evento) =>
    ehMeuEPendente(evento, input.sessionId)
      ? ({ ...evento, conflictStatus: 'resolved_keep_mine' } as PointEvent)
      : evento,
  );
}

/**
 * A versao da outra pessoa vale.
 *
 * Apenas os MEUS eventos viram soft-delete, nunca apagados de fato: nenhum placar
 * desaparece em silencio, e o `deletedAt` mantem a linha recuperavel. Os eventos da
 * outra pessoa ficam intactos — sao a versao escolhida.
 */
export function resolveConflictKeepingTheirs(input: Entrada): PointEvent[] {
  return input.pointEvents.map((evento) =>
    ehMeuEPendente(evento, input.sessionId)
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
    !(evento as { cloudId?: string }).cloudId &&
    (evento as { conflictStatus?: string }).conflictStatus === undefined
      ? ({ ...evento, conflictStatus: 'pending_decision' } as PointEvent)
      : evento,
  );
}
