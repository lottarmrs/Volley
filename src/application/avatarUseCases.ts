import { avatarStorageService, type ProposeResult } from '@infra/supabase/avatarStorageService';
import { appOk, productError, technicalError, type AppResult } from './appResult';

export interface AvatarGateway {
  proposeAvatar(playerCloudId: string | undefined, file: File): Promise<ProposeResult>;
}

const supabaseAvatarGateway: AvatarGateway = {
  proposeAvatar: avatarStorageService.proposeAvatar,
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
