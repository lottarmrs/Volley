import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { resolveCommunityInviteState } from '@app/communityInviteUseCases';
import {
  previewCommunityJoinByCodeQuery,
  requestCommunityJoinByCodeCommand,
  type CommunityJoinPreview,
} from '@app/communityMembershipUseCases';
import { CommunityInviteView } from '../../components/community/CommunityInviteView';

/**
 * Vive FORA do `CommunityShell` de proposito: quem chega por um link do
 * WhatsApp nao e do grupo, a comunidade nao esta neste aparelho, e o shell
 * redirecionava para /comunidades antes de qualquer coisa.
 */
export function CommunityInviteRoute() {
  const { codigo } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('pelada');

  const [preview, setPreview] = useState<CommunityJoinPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justRequested, setJustRequested] = useState(false);

  useEffect(() => {
    if (!codigo) {
      setLoading(false);
      return;
    }
    let vivo = true;
    setLoading(true);
    void previewCommunityJoinByCodeQuery({ code: codigo }).then((resultado) => {
      if (!vivo) return;
      if (resultado.ok) setPreview(resultado.value.community);
      else setError(resultado.error.message);
      setLoading(false);
    });
    return () => {
      vivo = false;
    };
  }, [codigo]);

  const pedir = useCallback(async () => {
    if (!codigo) return;
    setBusy(true);
    setError(null);
    const resultado = await requestCommunityJoinByCodeCommand({ code: codigo });
    setBusy(false);
    if (resultado.ok) {
      setJustRequested(true);
      return;
    }
    setError(resultado.error.message);
  }, [codigo]);

  const state = resolveCommunityInviteState({
    loading,
    preview,
    error,
    justRequested,
    sessionId,
  });

  return <CommunityInviteView state={state} busy={busy} onRequest={() => void pedir()} />;
}

export default CommunityInviteRoute;
