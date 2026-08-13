import { Navigate, Outlet, useParams } from 'react-router';
import type { Community } from '@shared/types';
import { resolveCommunityRoute } from '@app/appRoutes';
import { useShell, useCommunityShell } from '../shellContext';
import { CommunitiesView } from './globalRoutes';
import { useCommunitiesContract } from './communitiesContract';

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
