import { useCallback, useState } from 'react';
import {
  previewCommunityJoinByCodeQuery,
  requestCommunityJoinByCodeCommand,
  type CommunityJoinPreview,
} from '../application/communityMembershipUseCases';

export function useJoinCommunityByCode() {
  const [code, setCodeState] = useState('');
  const [preview, setPreview] = useState<CommunityJoinPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const setCode = useCallback((value: string) => {
    setCodeState(value.toUpperCase());
  }, []);

  const previewCommunity = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setRequested(false);
    try {
      const result = await previewCommunityJoinByCodeQuery({ code });
      if (result.ok === false) {
        setError(result.error.message);
        return;
      }
      setPreview(result.value.community);
    } finally {
      setLoading(false);
    }
  }, [code]);

  const requestJoin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestCommunityJoinByCodeCommand({ code });
      if (result.ok === false) {
        setError(result.error.message);
        return;
      }
      setRequested(true);
    } finally {
      setLoading(false);
    }
  }, [code]);

  return {
    code,
    setCode,
    preview,
    loading,
    error,
    requested,
    previewCommunity,
    requestJoin,
  };
}
