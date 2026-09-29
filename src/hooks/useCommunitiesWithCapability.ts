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
  const key = `${capability}:${userId ?? ''}:${communities
    .map((community) => `${community.id}=${community.cloudId ?? ''}`)
    .join(',')}`;
  const [state, setState] = useState<{ key: string; allowedIds: ReadonlySet<string> }>({
    key: '',
    allowedIds: EMPTY,
  });

  useEffect(() => {
    let vivo = true;
    void Promise.all(
      communities.map(async (community) => {
        if (!cloud || !community.cloudId) return roleAllows(community) ? community.id : null;
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

  return state.key === key
    ? { allowedIds: state.allowedIds, pending: false }
    : { allowedIds: EMPTY, pending: true };
}
