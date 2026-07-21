import type { AuthRole, UserProfile } from '../types';
import { profilesAdminCloudService } from '@infra/supabase/profilesAdminCloudService';
import { appOk, productError, technicalError, type AppResult } from './appResult';

export interface AdminProfilesGateway {
  listProfiles(): Promise<UserProfile[]>;
  setRole(userId: string, role: AuthRole): Promise<UserProfile>;
}

const supabaseAdminProfilesGateway: AdminProfilesGateway = {
  listProfiles: profilesAdminCloudService.listProfiles,
  setRole: profilesAdminCloudService.setRole,
};

export async function listAdminProfilesQuery(
  gateway: AdminProfilesGateway = supabaseAdminProfilesGateway,
): Promise<AppResult<{ profiles: UserProfile[] }>> {
  try {
    return appOk({ profiles: await gateway.listProfiles() });
  } catch (error) {
    return technicalError('Nao foi possivel carregar os usuarios.', error);
  }
}

export async function changeUserRoleCommand(
  input: { userId: string; role: AuthRole },
  gateway: AdminProfilesGateway = supabaseAdminProfilesGateway,
): Promise<AppResult<{ profile: UserProfile }>> {
  const userId = input.userId.trim();
  if (!userId) return productError('invalid_input', 'Usuario invalido.');

  try {
    return appOk({ profile: await gateway.setRole(userId, input.role) });
  } catch (error) {
    return technicalError('Nao foi possivel alterar o papel.', error);
  }
}
