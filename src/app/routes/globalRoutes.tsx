import { lazy } from 'react';
import { useNavigate } from 'react-router';
import { paths, resolveNewSessionPath } from '@app/appRoutes';
import { buildDashboardContract } from '@app/screens/dashboard/dashboardContract';
import {
  buildActiveSessionClearResult,
  buildDraftClearResult,
} from '@app/sessionLifecycleUseCases';
import { clearSessionDraft } from '../../logic/sessionDraft';
import { useShell } from '../shellContext';

const Dashboard = lazy(() =>
  import('../../components/dashboard/Dashboard').then((module) => ({ default: module.Dashboard })),
);

export function PainelRoute() {
  const shell = useShell();
  const navigate = useNavigate();
  const { sess, comm, wizard } = shell;
  const communityIds = comm.communities.map((community) => community.id);

  return (
    <Dashboard
      contract={buildDashboardContract({
        activeSession: sess.activeSession,
        sessionDraft: shell.sessionDraft,
        games: sess.games,
        onNewSession: () => navigate(resolveNewSessionPath({ communityIds })),
        onResumeSession: () =>
          navigate(
            sess.activeSession?.communityId
              ? paths.sessaoAtiva(sess.activeSession.communityId)
              : paths.sessaoAtivaSemComunidade,
          ),
        onResumeDraft: (draft) => {
          wizard.resumeDraft(draft);
          navigate(resolveNewSessionPath({ communityIds }));
        },
        onClearDraft: () => {
          if (window.confirm('Deseja realmente descartar o rascunho?')) {
            const result = buildDraftClearResult();
            clearSessionDraft();
            sess.setActiveSession(result.nextActiveSession);
          }
        },
        onClearActiveSession: () => {
          if (
            sess.activeSession &&
            window.confirm(
              'Deseja realmente descartar a sessão ativa? Todo o progresso e jogos gerados serão perdidos permanentemente.',
            )
          ) {
            const result = buildActiveSessionClearResult(sess.activeSession);
            if (!result) return;
            sess.deleteSession(result.sessionIdToDelete);
            sess.setActiveSession(result.nextActiveSession);
            clearSessionDraft();
          }
        },
        onPlayers: () => navigate(paths.comunidades),
        onHistory: () => navigate(paths.agenda),
        onExportBackup: shell.handleExportBackup,
        onImportBackup: shell.handleImportBackup,
        onCommunities: () => navigate(paths.comunidades),
      })}
    />
  );
}
