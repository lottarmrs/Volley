import type { RegistrationBoardStatus, SessionStatus } from '@shared/types';

export type PeladaStage =
  | 'lista_nao_aberta'
  | 'lista_aberta'
  | 'lista_fechada'
  | 'sorteada'
  | 'em_andamento'
  | 'encerrada'
  | 'cancelada';

export type PeladaActionKind =
  | 'abrir_lista'
  | 'fechar_lista'
  | 'reabrir_lista'
  | 'sortear'
  | 'comecar'
  | 'abrir_placar'
  | 'ver_resumo';

export interface PeladaAction {
  kind: PeladaActionKind;
  label: string;
}

export interface PeladaNextStep {
  stage: PeladaStage;
  line: string;
  action: PeladaAction | null;
  secondary?: PeladaAction;
}

export function peladaNextStep(input: {
  status: SessionStatus;
  windowStatus: RegistrationBoardStatus | null;
  confirmed: number;
  capacity: number;
  canManage: boolean;
  gameNumber?: number;
  mvpName?: string | null;
}): PeladaNextStep {
  const so = (action: PeladaAction) => (input.canManage ? action : null);
  if (input.status === 'cancelled') {
    return { stage: 'cancelada', line: 'Pelada cancelada', action: null };
  }
  if (input.status === 'finished') {
    return {
      stage: 'encerrada',
      line: input.mvpName ? `Encerrada · MVP ${input.mvpName}` : 'Encerrada',
      action: { kind: 'ver_resumo', label: 'Ver o resumo' },
    };
  }
  if (input.status === 'active' || input.status === 'paused') {
    return {
      stage: 'em_andamento',
      line: input.gameNumber ? `Rolando agora · Jogo ${input.gameNumber}` : 'Rolando agora',
      action: { kind: 'abrir_placar', label: 'Abrir o placar' },
    };
  }
  if (input.status === 'teams_generated') {
    return {
      stage: 'sorteada',
      line: 'Times prontos',
      action: so({ kind: 'comecar', label: 'Começar a pelada' }),
    };
  }
  if (input.windowStatus === 'OPEN') {
    return {
      stage: 'lista_aberta',
      line: `Lista aberta · ${input.confirmed} de ${input.capacity} confirmados`,
      action: so({ kind: 'fechar_lista', label: 'Fechar a lista' }),
    };
  }
  if (input.windowStatus === 'CLOSED' || input.windowStatus === 'LOCKED') {
    const reabrir = so({ kind: 'reabrir_lista', label: 'Reabrir a lista' });
    return {
      stage: 'lista_fechada',
      line: `Lista fechada · ${input.confirmed} ${input.confirmed === 1 ? 'joga' : 'jogam'}`,
      action: so({ kind: 'sortear', label: 'Sortear os times' }),
      ...(reabrir ? { secondary: reabrir } : {}),
    };
  }
  return {
    stage: 'lista_nao_aberta',
    line: 'A lista ainda não está aberta para o grupo',
    action: so({ kind: 'abrir_lista', label: 'Abrir a lista' }),
  };
}
