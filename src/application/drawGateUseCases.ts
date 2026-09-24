import type { RegistrationBoard } from '@shared/types';

export type DrawGate =
  | { kind: 'loading' }
  /** Há lista fechada e gente nela: o sorteio parte dos confirmados. */
  | { kind: 'ready'; confirmedPlayerCloudIds: string[] }
  /** Pelada sem inscrição: o caminho manual de sempre continua valendo. */
  | { kind: 'semLista' }
  | { kind: 'listaAberta'; message: string }
  | { kind: 'listaVazia'; message: string }
  | { kind: 'semPermissao'; message: string }
  | { kind: 'jaComecou'; message: string };

export function resolveDrawGate(input: {
  board: RegistrationBoard | null;
  loading: boolean;
}): DrawGate {
  if (input.loading) return { kind: 'loading' };
  if (!input.board) return { kind: 'semLista' };

  const board = input.board;

  if (
    board.sessionLifecycleStatus === 'IN_PROGRESS' ||
    board.sessionLifecycleStatus === 'COMPLETED'
  ) {
    return {
      kind: 'jaComecou',
      message: 'Esta pelada já começou. Os times dela já estão em quadra.',
    };
  }

  if (!board.viewerCanManage) {
    return {
      kind: 'semPermissao',
      message: 'Só quem organiza esta pelada pode sortear os times.',
    };
  }

  if (board.status === 'OPEN') {
    return {
      kind: 'listaAberta',
      message:
        'A lista ainda está aberta, e sortear agora congelaria as vagas sem o grupo saber. Feche a lista primeiro.',
    };
  }

  const confirmedPlayerCloudIds = board.entries
    .filter((entry) => entry.status === 'CONFIRMED')
    .map((entry) => entry.playerId);

  if (confirmedPlayerCloudIds.length === 0) {
    return {
      kind: 'listaVazia',
      message: 'Ninguém ficou na lista desta pelada. Reabra a inscrição ou inclua quem vai jogar.',
    };
  }

  return { kind: 'ready', confirmedPlayerCloudIds };
}
