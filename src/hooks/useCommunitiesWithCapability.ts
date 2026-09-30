import { useEffect, useState } from 'react';
import type { Community } from '@shared/types';
import { loadCommunityCapabilities } from '@app/communityCapabilitiesUseCases';
import { useAuth } from './useAuth';

const EMPTY: ReadonlySet<string> = new Set();

export function useCommunitiesWithCapability(
  communities: Community[],
  capability: string,
  roleAllows: (community: Community) => boolean,
): { allowedIds: ReadonlySet<string>; pending: boolean } {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const cloud = auth.isSupabaseConfigured && !!userId;
  const naNuvem = cloud ? communities.filter((community) => !!community.cloudId) : [];
  const locais = communities.filter((community) => !naNuvem.includes(community));
  const idsLocais = locais.filter(roleAllows).map((community) => community.id);
  const key = `${capability}:${userId ?? ''}:${naNuvem
    .map((community) => `${community.id}=${community.cloudId}`)
    .join(',')}`;
  const [state, setState] = useState<{ key: string; allowedIds: ReadonlySet<string> }>({
    key: '',
    allowedIds: EMPTY,
  });

  useEffect(() => {
    if (naNuvem.length === 0) return;
    let vivo = true;
    void Promise.all(
      naNuvem.map(async (community) => {
        const result = await loadCommunityCapabilities(community.cloudId, userId);
        return result.ok && result.value.includes(capability) ? community.id : null;
      }),
    ).then((ids) => {
      if (!vivo) return;
      setState({ key, allowedIds: new Set(ids.filter((id): id is string => id !== null)) });
    });
    return () => {
      vivo = false;
    };
  }, [key]);

  if (naNuvem.length === 0) return { allowedIds: new Set(idsLocais), pending: false };
  if (state.key !== key) return { allowedIds: EMPTY, pending: true };
  return { allowedIds: new Set([...idsLocais, ...state.allowedIds]), pending: false };
}
