import { lazy, useMemo } from 'react';
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

const SessionRecapView = lazy(() =>
  import('../../components/onboarding/SessionRecapView').then((module) => ({
    default: module.SessionRecapView,
  })),
);

/** Passo "Revisão" do wizard: o elenco já está escolhido, falta só gerar os times. */
const WIZARD_STEP_REVISAO = 4;

export function QuickStartRoute() {
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

    play.setPlayers((prev) => [...prev, ...novosAtletas]);

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
