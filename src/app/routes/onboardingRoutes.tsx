import { lazy, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { paths } from '@app/appRoutes';
import { startQuickPelada } from '@app/peladaFlowUseCases';
import { getCommunityPlayers } from '@logic/community';
import { useCommunitiesWithCapability } from '@hooks/useCommunitiesWithCapability';
import { OnlineLoading } from '../../ui/common/OnlineDataState';
import type { QuickStartEntry } from '@app/quickStart';
import { buildQuickStartPlayers } from '@app/quickStart';
import { buildSessionRecap, selectLatestSessionReport } from '@app/sessionRecap';
import { isGuestAccess } from '@app/guestAccess';
import { generateUUID } from '../../logic/uuid';
import { createDefaultCommunityRules } from '../../hooks/useCommunityRules';
import { useShell } from '../shellContext';

const QuickStartView = lazy(() =>
  import('../../components/onboarding/QuickStartView').then((module) => ({
    default: module.QuickStartView,
  })),
);

const QuickPeladaView = lazy(() =>
  import('../../components/session/QuickPeladaView').then((module) => ({
    default: module.QuickPeladaView,
  })),
);

const SessionRecapView = lazy(() =>
  import('../../components/onboarding/SessionRecapView').then((module) => ({
    default: module.SessionRecapView,
  })),
);

/** Passo "Revisão" do wizard: o elenco já está escolhido, falta só gerar os times. */
const WIZARD_STEP_REVISAO = 4;

export function QuickStartRoute() {
  const { sess } = useShell();
  return sess.online ? <QuickPeladaRoute /> : <LocalQuickStartRoute />;
}

function QuickPeladaRoute() {
  const { comm, play, communityRules, sess, toasts } = useShell();
  const navigate = useNavigate();
  const organiza = useCommunitiesWithCapability(comm.communities, 'session.manage', () => true);
  const opcoes = comm.communities.filter((item) => organiza.allowedIds.has(item.id));
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (comm.status.loading || organiza.pending) {
    return <OnlineLoading label="Carregando suas comunidades…" />;
  }
  if (opcoes.length === 0) return <Navigate to={paths.comunidades} replace />;

  const community = opcoes.find((item) => item.id === escolhida) ?? opcoes[0];
  const elenco = getCommunityPlayers(community.id, play.players).filter((p) => p.ativo !== false);

  return (
    <QuickPeladaView
      communities={opcoes.map((item) => ({ id: item.id, name: item.name }))}
      communityId={community.id}
      onCommunityChange={setEscolhida}
      roster={elenco}
      busy={busy}
      error={erro}
      onCancel={() => navigate(paths.painel)}
      onSubmit={async ({ playerIds, novos }) => {
        if (!community.cloudId) {
          setErro('A comunidade ainda não está salva. Tente em instantes.');
          return;
        }
        setBusy(true);
        setErro(null);
        const criados = await play.addPlayersAndWait(
          buildQuickStartPlayers({
            entries: novos,
            communityId: community.id,
            now: new Date().toISOString(),
            createId: generateUUID,
          }),
        );
        if (criados.ok === false) {
          setErro(criados.error.message);
          setBusy(false);
          return;
        }
        const playerCloudIds = [
          ...playerIds.map((id) => elenco.find((player) => player.id === id)?.cloudId),
          ...criados.value.map((player) => player.cloudId),
        ].filter((id): id is string => !!id);
        const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const regras = communityRules.getRules(community);
        const criada = await startQuickPelada({
          communityCloudId: community.cloudId,
          name: `${community.name} · ${hoje}`,
          playerCloudIds,
          type: regras?.defaultFormat === 'tournament' ? 'tournament' : 'free_play',
        });
        if (criada.ok === false) {
          setErro(criada.error.message);
          setBusy(false);
          return;
        }
        toasts.push('Pelada criada. Agora é sortear.', 'success');
        await sess.refresh();
        navigate(paths.sortear(community.id, criada.value.sessionId));
      }}
    />
  );
}

function LocalQuickStartRoute() {
  const shell = useShell();
  const { comm, play, communityRules, wizard, auth } = shell;

  const onSortear = (entries: QuickStartEntry[]) => {
    const now = new Date().toISOString();
    const community =
      comm.communities[0] ??
      comm.addCommunity({
        name: 'Minha pelada',
        defaultFormat: 'free_play',
        visibility: 'private',
      });

    const novosAtletas = buildQuickStartPlayers({
      entries,
      communityId: community.id,
      now,
      createId: generateUUID,
    });

    play.addPlayers(novosAtletas);

    shell.createSessionFromCommunity(
      community,
      novosAtletas.map((player) => player.id),
      communityRules.getRules(community) ?? createDefaultCommunityRules(community),
    );
    wizard.setWizardStep(WIZARD_STEP_REVISAO);
  };

  return <QuickStartView onSortear={onSortear} isGuest={isGuestAccess(auth.state)} />;
}

export function SessionRecapRoute() {
  const { sess, auth } = useShell();

  const recap = useMemo(
    () => buildSessionRecap(selectLatestSessionReport(sess.sessionReports)),
    [sess.sessionReports],
  );

  const communityId =
    sess.sessions.find((session) => session.id === recap?.sessionId)?.communityId ?? null;

  return (
    <SessionRecapView recap={recap} isGuest={isGuestAccess(auth.state)} communityId={communityId} />
  );
}
