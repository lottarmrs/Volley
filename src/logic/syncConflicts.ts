import type { SessionControlRow } from '@infra/supabase/sessionOwnershipCloudService';

export interface SessionConflict {
  sessionId: string;
  localEventCount: number;
  /** Quantos pontos a outra pessoa ja tem na nuvem para esta sessao. */
  holderEventCount: number;
  holderUserId: string;
  holderName: string | null;
}

/**
 * Encontra sessoes em que marquei placar offline enquanto outra pessoa detinha o
 * controle.
 *
 * O resultado e POR SESSAO de proposito: um conflito localizado nao pode travar a
 * entrega das demais sessoes.
 */
export function detectSessionConflicts(input: {
  currentUserId: string | null;
  localPointEvents: { sessionId: string; syncStatus?: string }[];
  cloudSessionControl: Record<string, SessionControlRow>;
  cloudEventCounts: Record<string, number>;
  holderNames: Record<string, string>;
}): SessionConflict[] {
  if (!input.currentUserId) return [];

  const porSessao = new Map<string, number>();
  for (const evento of input.localPointEvents) {
    // Evento ja sincronizado nao gera decisao: ele ja esta na nuvem.
    if (evento.syncStatus !== 'pending') continue;
    porSessao.set(evento.sessionId, (porSessao.get(evento.sessionId) ?? 0) + 1);
  }

  const conflitos: SessionConflict[] = [];
  for (const [sessionId, localEventCount] of porSessao) {
    const dono = input.cloudSessionControl[sessionId]?.controlled_by_user_id;
    if (!dono || dono === input.currentUserId) continue;
    conflitos.push({
      sessionId,
      localEventCount,
      holderEventCount: input.cloudEventCounts[sessionId] ?? 0,
      holderUserId: dono,
      holderName: input.holderNames[dono] ?? null,
    });
  }
  return conflitos;
}

/**
 * Sessoes cujos eventos NAO devem subir agora, por estarem em conflito.
 *
 * Devolve um Set para o caminho de upload filtrar barato. A entrega das demais sessoes
 * segue normal: um conflito localizado nao pode travar o resto.
 */
export function conflictedSessionIds(conflicts: SessionConflict[]): Set<string> {
  return new Set(conflicts.map((c) => c.sessionId));
}
