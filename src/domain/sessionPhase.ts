import type { Game, Session } from '@shared/types';

export type OperationalPhase =
  | 'rascunho'
  | 'times_gerados'
  | 'pronta'
  | 'entre_partidas'
  | 'em_andamento'
  | 'pausada'
  | 'encerrada';

export interface PhasePermissions {
  podeIniciar: boolean;
  podePausar: boolean;
  podeRetomar: boolean;
  podeEncerrar: boolean;
  podePontuar: boolean;
}

export function isTerminalGame(game: Game): boolean {
  return game.status === 'finished' || game.status === 'walkover' || game.status === 'cancelled';
}

export function derivePhase(session: Session | null, games: Game[]): OperationalPhase {
  if (!session) return 'rascunho';

  if (session.status === 'finished' || session.status === 'cancelled') return 'encerrada';
  if (session.status === 'paused') return 'pausada';
  if (session.status === 'teams_generated') return 'times_gerados';
  if (session.status !== 'active') return 'rascunho';

  const own = games.filter((g) => g.sessionId === session.id);
  if (own.some((g) => g.status === 'active')) return 'em_andamento';
  if (own.some(isTerminalGame)) return 'entre_partidas';
  return 'pronta';
}

const NENHUMA: PhasePermissions = {
  podeIniciar: false,
  podePausar: false,
  podeRetomar: false,
  podeEncerrar: false,
  podePontuar: false,
};

export function phasePermissions(phase: OperationalPhase): PhasePermissions {
  switch (phase) {
    case 'pronta':
    case 'entre_partidas':
      return { ...NENHUMA, podeIniciar: true, podeEncerrar: true };
    case 'em_andamento':
      return { ...NENHUMA, podePausar: true, podeEncerrar: true, podePontuar: true };
    case 'pausada':
      return { ...NENHUMA, podeRetomar: true, podeEncerrar: true };
    case 'times_gerados':
      return { ...NENHUMA, podeEncerrar: true };
    default:
      return NENHUMA;
  }
}

export const PHASE_LABEL: Record<OperationalPhase, string> = {
  rascunho: 'Rascunho',
  times_gerados: 'Times Prontos',
  pronta: 'Pronta para Começar',
  entre_partidas: 'Entre Partidas',
  em_andamento: 'Partida em Andamento',
  pausada: 'Pausada',
  encerrada: 'Encerrada',
};
