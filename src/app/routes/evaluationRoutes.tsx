import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import type { CommunityEvaluationRosterEntry } from '@shared/types';
import { paths } from '@app/appRoutes';
import { loadCommunityEvaluationRoster } from '@app/communityEvaluationUseCases';
import {
  buildEvaluationRosterView,
  evaluationDisplayName,
  nextPendingAfter,
} from '@app/evaluationRosterViewModel';
import { useCommunityShell } from '../shellContext';
import { useCommunityCapabilities } from '../../hooks/useCommunityCapabilities';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';
import { EvaluationRosterView } from '../../components/community/evaluation/EvaluationRosterView';
import { CommunityEvaluationEditor } from '../../components/player/CommunityEvaluationEditor';

type Carga =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'not_synced' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; entries: CommunityEvaluationRosterEntry[] };

type Salvo = { salvo?: string } | null;

function useEvaluationRoster(communityCloudId: string | null | undefined, refreshKey = '') {
  const [carga, setCarga] = useState<Carga>({ kind: 'loading' });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!communityCloudId) {
      setCarga({ kind: 'not_synced' });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setCarga({ kind: 'offline' });
      return;
    }
    let vivo = true;
    setCarga({ kind: 'loading' });
    void loadCommunityEvaluationRoster(communityCloudId).then((result) => {
      if (!vivo) return;
      setCarga(
        result.ok
          ? { kind: 'ready', entries: result.value }
          : { kind: 'error', message: result.error.message },
      );
    });
    return () => {
      vivo = false;
    };
  }, [communityCloudId, versao, refreshKey]);

  return { carga, recarregar: useCallback(() => setVersao((v) => v + 1), []) };
}

function ConfirmacaoDeSalvo() {
  const location = useLocation();
  const salvo = (location.state as Salvo)?.salvo;
  if (!salvo) return null;
  return (
    <p role="status" className="text-sm font-semibold text-success">
      Avaliação de {salvo} salva.
    </p>
  );
}

export function CommunityEvaluationRoute() {
  const { community } = useCommunityShell();
  const navigate = useNavigate();
  const { capabilities, resolved } = useCommunityCapabilities(community);
  const permissions = useCommunityPermissions(community);
  const { carga, recarregar } = useEvaluationRoster(community.cloudId);

  if (!resolved) return null;
  if (!capabilities.has('player.evaluate'))
    return <Navigate to={paths.comunidade(community.id)} replace />;

  return (
    <div className="space-y-4">
      <ConfirmacaoDeSalvo />
      <EvaluationRosterView
        state={carga.kind}
        errorMessage={carga.kind === 'error' ? carga.message : undefined}
        view={carga.kind === 'ready' ? buildEvaluationRosterView(carga.entries) : undefined}
        canDesignate={permissions.canManageMembers}
        managementPath={paths.gestao(community.id)}
        onOpen={(playerCloudId) => navigate(paths.avaliacaoAtleta(community.id, playerCloudId))}
        onRetry={recarregar}
      />
    </div>
  );
}

export function CommunityEvaluationPlayerRoute() {
  const { community, auth } = useCommunityShell();
  const navigate = useNavigate();
  const { playerId } = useParams();
  const { capabilities, resolved } = useCommunityCapabilities(community);
  const { carga } = useEvaluationRoster(community.cloudId, playerId);

  if (!resolved) return null;
  if (!capabilities.has('player.evaluate') || !playerId || !community.cloudId)
    return <Navigate to={paths.comunidade(community.id)} replace />;

  const entradas = carga.kind === 'ready' ? carga.entries : [];
  const entrada = entradas.find((e) => e.playerId === playerId);
  const view = buildEvaluationRosterView(entradas);
  const proximoId = carga.kind === 'ready' ? nextPendingAfter(view, playerId) : null;
  const proximo = entradas.find((e) => e.playerId === proximoId);
  const nome = entrada ? evaluationDisplayName(entrada) : null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="btn btn-ghost btn-sm min-h-[44px] gap-1 px-2"
        onClick={() => navigate(paths.avaliacao(community.id))}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden /> Voltar à lista
      </button>
      <ConfirmacaoDeSalvo />
      {entrada && (
        <header className="space-y-1">
          <h2 className="text-2xl font-black leading-tight text-base-content">{nome}</h2>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-base-content/55">
            {[entrada.position, entrada.isSelf ? 'autoavaliação provisória' : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </header>
      )}
      <CommunityEvaluationEditor
        currentUserId={auth.user?.id ?? null}
        communityId={community.cloudId}
        playerId={playerId}
        saveLabel={proximo ? `Salvar · próximo: ${evaluationDisplayName(proximo)}` : 'Salvar'}
        onSaved={() => {
          const estado = { state: { salvo: nome ?? 'atleta' } };
          navigate(
            proximoId
              ? paths.avaliacaoAtleta(community.id, proximoId)
              : paths.avaliacao(community.id),
            estado,
          );
        }}
      />
    </div>
  );
}
