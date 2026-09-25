import { useEffect, useState } from 'react';
import type { Community } from '@shared/types';
import { loadCommunityCapabilities } from '@app/communityCapabilitiesUseCases';
import { useAuth } from './useAuth';

const EMPTY: ReadonlySet<string> = new Set();

export function useCommunityCapabilities(community: Community | null): {
  capabilities: ReadonlySet<string>;
  resolved: boolean;
} {
  const auth = useAuth();
  const cloudId = community?.cloudId ?? null;
  const userId = auth.user?.id ?? null;
  const key = `${cloudId ?? ''}:${userId ?? ''}`;
  const [state, setState] = useState<{ key: string; capabilities: ReadonlySet<string> }>({
    key: '',
    capabilities: EMPTY,
  });

  useEffect(() => {
    let vivo = true;
    void loadCommunityCapabilities(cloudId, userId).then((result) => {
      if (!vivo) return;
      setState({ key, capabilities: result.ok ? new Set(result.value) : EMPTY });
    });
    return () => {
      vivo = false;
    };
  }, [cloudId, userId, key]);

  return state.key === key
    ? { capabilities: state.capabilities, resolved: true }
    : { capabilities: EMPTY, resolved: false };
}
