import type { PlayerAvatarProposal } from '../types';
import { avatarStorageService, type ProposeResult } from '@infra/supabase/avatarStorageService';
import { appOk, productError, technicalError, type AppResult } from './appResult';

export type AvatarApprovalQueueItem = PlayerAvatarProposal & { playerName: string };

export interface AvatarGateway {
  proposeAvatar(playerCloudId: string | undefined, file: File): Promise<ProposeResult>;
  listMyApprovalQueue(): Promise<AvatarApprovalQueueItem[]>;
  approve(proposalId: string): Promise<void>;
  reject(proposalId: string): Promise<void>;
}

const supabaseAvatarGateway: AvatarGateway = {
  proposeAvatar: avatarStorageService.proposeAvatar,
  listMyApprovalQueue: avatarStorageService.listMyApprovalQueue,
  approve: avatarStorageService.approve,
  reject: avatarStorageService.reject,
};

export async function proposePlayerAvatarCommand(
  input: { playerCloudId: string | undefined; file: File },
  gateway: AvatarGateway = supabaseAvatarGateway,
): Promise<AppResult<ProposeResult>> {
  if (!input.playerCloudId) {
    return productError(
      'invalid_input',
      'Sincronize o atleta com a nuvem antes de adicionar uma foto.',
    );
  }

  try {
    return appOk(await gateway.proposeAvatar(input.playerCloudId, input.file));
  } catch (error) {
    return technicalError('Falha ao enviar a foto.', error);
  }
}

export async function listAvatarApprovalQueueQuery(
  gateway: AvatarGateway = supabaseAvatarGateway,
): Promise<AppResult<{ items: AvatarApprovalQueueItem[] }>> {
  try {
    return appOk({ items: await gateway.listMyApprovalQueue() });
  } catch (error) {
    return technicalError('Não foi possível carregar as aprovações.', error);
  }
}

export async function reviewPlayerAvatarCommand(
  input: { proposalId: string; action: 'approve' | 'reject' },
  gateway: AvatarGateway = supabaseAvatarGateway,
): Promise<AppResult<{ proposalId: string }>> {
  const proposalId = input.proposalId.trim();
  if (!proposalId) return productError('invalid_input', 'Proposta de foto inválida.');

  try {
    if (input.action === 'approve') await gateway.approve(proposalId);
    else await gateway.reject(proposalId);
    return appOk({ proposalId });
  } catch (error) {
    return technicalError('Ação não concluída.', error);
  }
}
