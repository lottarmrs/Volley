import type { BalanceInputSnapshot, BalanceInputSnapshotCaptureRequest } from '@shared/types';
import { balanceInputSnapshotCloudService } from '@infra/supabase/balanceInputSnapshotCloudService';
import {
  appOk,
  conflictError,
  productError,
  technicalError,
  validationError,
  type AppResult,
} from './appResult';

export interface BalanceInputSnapshotGateway {
  capture(input: BalanceInputSnapshotCaptureRequest): Promise<BalanceInputSnapshot>;
  read(snapshotId: string): Promise<BalanceInputSnapshot>;
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function classify(error: unknown): AppResult<never> {
  switch (errorCode(error)) {
    case '42501':
      return productError(
        'permission_denied',
        'É preciso ser o organizador designado desta partida para capturar as entradas.',
      );
    case '40001':
      return conflictError(
        'roster_revision',
        'O elenco mudou desde esta tela. Recarregue a lista e capture de novo.',
      );
    case '23505':
      return conflictError(
        'command_id',
        'Esta captura já registrou outro elenco. Inicie uma nova captura.',
      );
    case '23514':
      return productError(
        'invalid_input',
        'A partida ou o elenco não estão prontos para formar times.',
      );
    case 'P0002':
      return productError('not_found', 'A partida ou a captura não foi encontrada.');
    case 'CLOUD_UNAVAILABLE':
      return productError('cloud_unavailable', 'Conecte o aplicativo à nuvem para formar times.');
    case 'PGRST202':
    case '42883':
      // Servidor sem a migration desta fatia: recuperável, porque volta a funcionar sem
      // nenhuma mudança no cliente assim que o banco for atualizado.
      return technicalError('A formação de times ainda não está disponível neste servidor.', error);
    default:
      return technicalError(
        'Não foi possível capturar as entradas. Verifique a conexão e tente novamente.',
        error,
      );
  }
}

export async function captureBalanceInputSnapshot(
  input: BalanceInputSnapshotCaptureRequest,
  gateway: BalanceInputSnapshotGateway = balanceInputSnapshotCloudService,
): Promise<AppResult<BalanceInputSnapshot>> {
  // Os três identificadores pertencem a quem chama. Gerar um command_id aqui transformaria
  // cada retry em uma captura nova, que é exatamente o que o recibo existe para evitar.
  const required: Array<[keyof BalanceInputSnapshotCaptureRequest, string]> = [
    ['commandId', 'Informe o identificador da captura.'],
    ['sessionId', 'Informe a partida.'],
    ['rosterRevisionId', 'Informe a revisão do elenco.'],
  ];
  for (const [field, message] of required) {
    if (!input[field] || !input[field].trim()) {
      return validationError(field, message);
    }
  }

  try {
    return appOk(await gateway.capture(input));
  } catch (error) {
    return classify(error);
  }
}

export async function readBalanceInputSnapshot(
  snapshotId: string,
  gateway: BalanceInputSnapshotGateway = balanceInputSnapshotCloudService,
): Promise<AppResult<BalanceInputSnapshot>> {
  if (!snapshotId || !snapshotId.trim()) {
    return validationError('snapshotId', 'Informe a captura a consultar.');
  }

  try {
    return appOk(await gateway.read(snapshotId));
  } catch (error) {
    return classify(error);
  }
}
