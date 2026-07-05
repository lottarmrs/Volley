import { useCallback, useState } from 'react';
import {
  requestPublicCommunityJoinCommand,
  searchPublicCommunitiesQuery,
  type PublicCommunityResult,
} from '../application/communityMembershipUseCases';

export function useCommunityDiscovery() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicCommunityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const search = useCallback(async (nextQuery: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchPublicCommunitiesQuery({ query: nextQuery });
      if (result.ok === false) {
        setError(result.error.message);
        return;
      }
      setResults(result.value.communities);
    } finally {
      setLoading(false);
    }
  }, []);

  const requestJoin = useCallback(async (community: PublicCommunityResult) => {
    setActingId(community.id);
    setError(null);
    try {
      const result = await requestPublicCommunityJoinCommand({
        communityCloudId: community.id,
      });
      if (result.ok === false) {
        setError(result.error.message);
        return;
      }
      setResults((previous) =>
        previous.map((candidate) =>
          candidate.id === community.id ? { ...candidate, myStatus: 'pending' } : candidate,
        ),
      );
    } finally {
      setActingId(null);
    }
  }, []);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    actingId,
    search,
    requestJoin,
  };
}
