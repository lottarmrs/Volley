import { useCallback, useState } from 'react';
import type { AppError } from '../application/appResult';
import {
  requestPublicCommunityJoinCommand,
  searchPublicCommunitiesQuery,
  type PublicCommunityResult,
} from '../application/communityMembershipUseCases';

const SEARCH_ERROR_MESSAGE = 'Não foi possível buscar comunidades.';
const REQUEST_ERROR_MESSAGE = 'Não foi possível enviar o pedido.';

function causeMessage(cause: unknown): string | null {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === 'string' && cause) return cause;
  return null;
}

function messageForAppError(error: AppError, fallback: string): string {
  if (error.kind === 'technical') return causeMessage(error.cause) ?? fallback;
  return error.message;
}

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
        setError(messageForAppError(result.error, SEARCH_ERROR_MESSAGE));
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
        setError(messageForAppError(result.error, REQUEST_ERROR_MESSAGE));
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
