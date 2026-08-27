import { useCallback, useState } from 'react';
import type { AppError } from '../application/appResult';
import {
  previewCommunityJoinByCodeQuery,
  requestCommunityJoinByCodeCommand,
  type CommunityJoinPreview,
} from '../application/communityMembershipUseCases';

const INVALID_CODE_MESSAGE = 'Código de convite inválido ou comunidade não encontrada.';
const PREVIEW_ERROR_MESSAGE = 'Não foi possível buscar a comunidade.';
const REQUEST_ERROR_MESSAGE = 'Não foi possível enviar o pedido.';

function causeMessage(cause: unknown): string | null {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === 'string' && cause) return cause;
  return null;
}

function messageForAppError(error: AppError, fallback: string): string {
  if (error.kind === 'technical') return causeMessage(error.cause) ?? fallback;
  if (error.kind === 'product' && error.code === 'not_found') return INVALID_CODE_MESSAGE;
  return error.message;
}

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
        setError(messageForAppError(result.error, PREVIEW_ERROR_MESSAGE));
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
        setError(messageForAppError(result.error, REQUEST_ERROR_MESSAGE));
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
