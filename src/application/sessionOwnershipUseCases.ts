import { appOk, productError, technicalError, type AppResult } from './appResult';
import { classifySyncError } from '../logic/syncBackoff';
import { getOrCreateDeviceId } from '../storage/localStorageRepository';
import { sessionOwnershipCloudService } from '@infra/supabase/sessionOwnershipCloudService';

export type SessionControlReason =
  | 'free'
  | 'mine'
  | 'mine_other_device'
  | 'held_by_other'
  | 'not_authenticated';

export interface SessionControlView {
  canScore: boolean;
  reason: SessionControlReason;
  message: string;
  holderName: string | null;
}

/**
 * Decide se esta tela pode marcar placar.
 *
 * A autoridade e o USUARIO. O aparelho so gera aviso: bloquear por aparelho puniria
 * quem legitimamente trocou de celular no meio da sessao.
 */
export function resolveSessionControl(input: {
  controlledByUserId: string | null;
  controlClaimedAt: string | null;
  controlDeviceId: string | null;
  currentUserId: string | null;
  currentDeviceId: string;
  holderName: string | null;
}): SessionControlView {
  if (!input.currentUserId) {
    return {
      canScore: false,
      reason: 'not_authenticated',
      message: 'Entre na sua conta para marcar o placar.',
      holderName: null,
    };
  }

  if (!input.controlledByUserId) {
    return { canScore: true, reason: 'free', message: '', holderName: null };
  }

  if (input.controlledByUserId !== input.currentUserId) {
    const quem = input.holderName ?? 'Outra pessoa';
    return {
      canScore: false,
      reason: 'held_by_other',
      message: `${quem} está com o controle desta sessão.`,
      holderName: input.holderName,
    };
  }

  if (input.controlDeviceId && input.controlDeviceId !== input.currentDeviceId) {
    return {
      canScore: true,
      reason: 'mine_other_device',
      message: 'Você está com esta sessão aberta em outro aparelho.',
      holderName: input.holderName,
    };
  }

  return { canScore: true, reason: 'mine', message: '', holderName: input.holderName };
}

async function executarPosse(
  acao: 'claim' | 'transfer',
  sessionCloudId: string,
): Promise<AppResult<{ controlledByUserId: string | null }>> {
  try {
    const row = await sessionOwnershipCloudService[acao](sessionCloudId, getOrCreateDeviceId());
    return appOk({ controlledByUserId: row.controlled_by_user_id });
  } catch (error) {
    // O RPC devolve 42501 quando outra pessoa esta com o controle. Essa e uma
    // resposta de produto, nao falha tecnica: a mensagem do servidor ja nomeia o caso.
    const bruto = error as { message?: string } | null;
    if (classifySyncError(error) === 'authorization' && bruto?.message?.trim()) {
      return productError('permission_denied', bruto.message.trim());
    }
    return technicalError('Não foi possível atualizar o controle da sessão.', error);
  }
}

export const claimSessionControlCommand = (sessionCloudId: string) =>
  executarPosse('claim', sessionCloudId);

export const transferSessionControlCommand = (sessionCloudId: string) =>
  executarPosse('transfer', sessionCloudId);
