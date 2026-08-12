import { Navigate, Outlet, useOutletContext, useParams } from 'react-router';
import type { Community } from '@shared/types';
import { resolveCommunityRoute } from '@app/appRoutes';
import { useShell, type ShellApi } from '../shellContext';
import { CommunitiesView, useCommunitiesContract } from './globalRoutes';

export interface CommunityShellApi extends ShellApi {
  community: Community;
}

export function useCommunityShell(): CommunityShellApi {
  return useOutletContext<CommunityShellApi>();
}

export function CommunityShell() {
  const shell = useShell();
  const { communityId } = useParams();
  const resolution = resolveCommunityRoute({
    communityId,
    communityIds: shell.comm.communities.map((community) => community.id),
  });
  if (resolution.kind === 'redirect') return <Navigate to={resolution.to} replace />;

  const community = shell.comm.communities.find((item) => item.id === communityId) as Community;

  return <Outlet context={{ ...shell, community }} />;
}

export function CommunityOverviewRoute() {
  const { community } = useCommunityShell();
  const contract = useCommunitiesContract({ selectedCommunityId: community.id });
  return <CommunitiesView contract={contract} />;
}

export function CommunityGestaoRoute() {
  const { community } = useCommunityShell();
  const contract = useCommunitiesContract({
    selectedCommunityId: community.id,
    initialCommunityTab: 'rules',
  });
  return <CommunitiesView contract={contract} />;
}
