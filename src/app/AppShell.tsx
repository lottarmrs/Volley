import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import {
  BarChart3,
  Cloud,
  LayoutDashboard,
  Medal,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';

import {
  getPageTitleForPath,
  getShellNavigationItems,
  paths,
  pathForLegacyPage,
  type LegacyPage,
  type ShellNavItem,
} from '@app/appRoutes';
import { derivePhase, PHASE_LABEL } from '@domain/sessionPhase';
import { ToastViewport } from '@ui/common/ToastViewport';
import { VutRevealModal, RevealItem } from '../components/player/VutRevealModal';
import type { ShellApi } from './shellContext';

import { usePlayers } from '../hooks/usePlayers';
import { useSession } from '../ui/common/useSession';
import { useSessionWizard } from '../hooks/useSessionWizard';
import { useCommunities } from '../hooks/useCommunities';
import { useCommunityPresence } from '../hooks/useCommunityPresence';
import { useCommunityRules } from '../hooks/useCommunityRules';
import { useWhatsAppListTemplates } from '../hooks/useWhatsAppListTemplates';
import { useChampionships } from '../hooks/useChampionships';
import { useAuth } from '../hooks/useAuth';
import { useCloudSync } from '../hooks/useCloudSync';
import { useToast } from '../ui/common/useToast';

import { loadSessionDraft, clearSessionDraft, saveSessionDraft } from '../logic/sessionDraft';
import { Community, CommunityRules, Player, SessionConfig } from '../types';
import {
  STORAGE_KEYS,
  getLocalCacheOwnerId,
  getOrCreateDeviceId,
  loadFromStorage,
  saveToStorage,
} from '../storage/localStorageRepository';
import { countPendingChanges } from '../logic/syncStatus';
import { resolveUsername } from '../logic/username';
import { generateUUID } from '../logic/uuid';
import { applyCommunityDeletion } from '../application/localCommunityUseCases';
import {
  applyGuestPlayerUpsert,
  applyPlayerCreationForCommunity,
} from '../application/localPlayerUseCases';
import {
  buildFinishedSessionResult,
  buildSessionFromCommunity,
} from '../application/sessionLifecycleUseCases';
import { buildPendingDeliveryNotice, getAccountDisplay } from '@app/appShellViewModel';
import {
  buildBackupFileName,
  buildBackupPayload,
  buildImportedBackupPersistencePlan,
  prepareImportedBackup,
} from '../application/backupUseCases';
import { buildVutRevealItems } from '../application/vutRevealUseCases';
import { getPlayerEditActionErrorMessage } from '../application/playerEditActionUseCases';
import { planStartupCloudDownload } from '../application/cloudSyncStartupUseCases';
import {
  detachChampionshipTeamBridges,
  materializeRound,
} from '../application/championshipUseCases';
import { appOk, productError } from '@app/appResult';

const navigationIconByKey: Record<ShellNavItem['icon'], ReactNode> = {
  dashboard: <LayoutDashboard className="w-5 h-5" />,
  tournament: <Trophy className="w-5 h-5" />,
  players: <Users className="w-5 h-5" />,
  ranking: <Medal className="w-5 h-5" />,
  history: <BarChart3 className="w-5 h-5" />,
  cloud: <Cloud className="w-5 h-5" />,
  settings: <Settings className="w-5 h-5" />,
  admin: <ShieldCheck className="w-5 h-5" />,
};

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionDraft, setSessionDraft] = useState(() => loadSessionDraft());
  const [revealQueue, setRevealQueue] = useState<RevealItem[]>([]);

  const auth = useAuth();
  const toasts = useToast();
  const sess = useSession();
  const play = usePlayers(sess.games, sess.pointEvents, sess.teams);
  const comm = useCommunities();
  const communityPresence = useCommunityPresence();
  const communityRules = useCommunityRules();
  const whatsAppLists = useWhatsAppListTemplates();
  const championships = useChampionships();
  const operationalPhase = derivePhase(sess.activeSession, sess.games);
  const [currentDeviceId] = useState(getOrCreateDeviceId);

  const activeSessionOwnerId = sess.activeSession?.communityId ?? null;
  const activeCommunityId =
    activeSessionOwnerId && comm.communities.some((item) => item.id === activeSessionOwnerId)
      ? activeSessionOwnerId
      : null;

  const wizard = useSessionWizard({
    players: play.players,
    activeSession: sess.activeSession,
    setActiveSession: sess.setActiveSession,
    setSessions: sess.setSessions,
    setTeams: sess.setTeams,
    games: sess.games,
    setGames: sess.setGames,
    setPage: (page: LegacyPage) => navigate(pathForLegacyPage(page, activeCommunityId)),
    sessions: sess.sessions,
    teams: sess.teams,
  });

  // ── Cloud sync ────────────────────────────────────────────────────────────

  const cloudSync = useCloudSync({
    userId: auth.user?.id ?? null,
    communities: comm.rawCommunities,
    setCommunities: comm.setCommunities,
    players: play.rawPlayers,
    setPlayers: play.setPlayers,
    rules: communityRules.rawRules,
    setRules: communityRules.setRules,
    templates: whatsAppLists.rawTemplates,
    setTemplates: whatsAppLists.setTemplates,
    drafts: whatsAppLists.drafts,
    setDrafts: whatsAppLists.setDrafts,
    sessions: sess.rawSessions,
    setSessions: sess.setSessions,
    teams: sess.teams,
    setTeams: sess.setTeams,
    games: sess.games,
    setGames: sess.setGames,
    pointEvents: sess.pointEvents,
    setPointEvents: sess.setPointEvents,
    gameReports: sess.gameReports,
    setGameReports: sess.setGameReports,
    sessionReports: sess.sessionReports,
    setSessionReports: sess.setSessionReports,
    presenceRecords: communityPresence.presenceRecords,
    setPresenceRecords: communityPresence.setPresenceRecords,
    championships: championships.rawChampionships,
    setChampionships: championships.setChampionships,
    championshipTeams: championships.rawChampionshipTeams,
    setChampionshipTeams: championships.setChampionshipTeams,
    championshipRounds: championships.rawChampionshipRounds,
    setChampionshipRounds: championships.setChampionshipRounds,
    onToast: toasts.push,
  });

  const autoSyncedForUser = useRef<string | null>(null);

  const pendingChanges = useMemo(() => {
    if (!auth.user) return 0;
    return countPendingChanges([
      comm.rawCommunities,
      play.rawPlayers,
      communityRules.rawRules,
      whatsAppLists.rawTemplates,
      whatsAppLists.drafts,
      sess.rawSessions,
      sess.teams,
      sess.games,
      sess.pointEvents,
      sess.gameReports,
      sess.sessionReports,
      communityPresence.presenceRecords,
      championships.rawChampionships,
      championships.rawChampionshipTeams,
      championships.rawChampionshipRounds,
    ]);
  }, [
    auth.user,
    comm.rawCommunities,
    play.rawPlayers,
    communityRules.rawRules,
    whatsAppLists.rawTemplates,
    whatsAppLists.drafts,
    sess.rawSessions,
    sess.teams,
    sess.games,
    sess.pointEvents,
    sess.gameReports,
    sess.sessionReports,
    communityPresence.presenceRecords,
    championships.rawChampionships,
    championships.rawChampionshipTeams,
    championships.rawChampionshipRounds,
  ]);

  const pendingDeliveryNotice = buildPendingDeliveryNotice({
    pendingChanges,
    connectivity: cloudSync.connectivity,
    hasOpenFailure: (cloudSync.syncIssueSummary?.openCount ?? 0) > 0,
  });

  // ── Auto-sync on login (download-first) ───────────────────────────────────
  // Na entrada, ADOTAMOS o estado da nuvem (fonte da verdade) baixando-o — isso
  // hidrata cloudId/filiação e CONVERGE os ids entre dispositivos. NÃO empurramos
  // o estado local na entrada: um device com localStorage desatualizado empurrava
  // comunidades duplicadas e apagava vínculos. Só baixa quando NÃO há mudanças
  // locais pendentes (senão deixamos o usuário sincronizar manualmente, para não
  // sobrescrever trabalho offline). Uma vez por usuário.
  useEffect(() => {
    const plan = planStartupCloudDownload({
      authState: auth.state.kind,
      isSupabaseConfigured: auth.isSupabaseConfigured,
      userId: auth.user?.id ?? null,
      autoSyncedForUserId: autoSyncedForUser.current,
      cacheOwnerId: getLocalCacheOwnerId(),
      pendingChanges,
    });
    autoSyncedForUser.current = plan.nextAutoSyncedForUserId;
    if (plan.shouldDownload) cloudSync.downloadFromCloud().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.state.kind, auth.isSupabaseConfigured, auth.user?.id, pendingChanges]);

  // ── Backup actions ────────────────────────────────────────────────────────

  const handleExportBackup = () => {
    const data = buildBackupPayload({
      players: play.players,
      sessions: sess.sessions,
      teams: sess.teams,
      games: sess.games,
      pointEvents: sess.pointEvents,
      gameReports: sess.gameReports,
      sessionReports: sess.sessionReports,
      communities: comm.communities,
      communityPresence: communityPresence.presenceRecords,
      whatsAppListTemplates: whatsAppLists.templates,
      whatsAppListDrafts: whatsAppLists.drafts,
      communityRules: communityRules.rules,
      championships: championships.championships,
      championshipTeams: championships.championshipTeams,
      championshipRounds: championships.championshipRounds,
      activeSession: sess.activeSession,
      sessionDraft: loadSessionDraft(),
      lastSelectedPlayerIds: loadFromStorage<string[] | null>(
        STORAGE_KEYS.lastSelectedPlayerIds,
        null,
      ),
      lastSessionConfig: loadFromStorage<SessionConfig | null>(
        STORAGE_KEYS.lastSessionConfig,
        null,
      ),
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildBackupFileName(new Date());
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rawData = JSON.parse(e.target?.result as string);
        const data = prepareImportedBackup(rawData);
        if (data.players) play.setPlayers(data.players);
        if (data.sessions) sess.setSessions(data.sessions);
        if (data.teams) sess.setTeams(data.teams);
        if (data.games) sess.setGames(data.games);
        if (data.pointEvents) sess.setPointEvents(data.pointEvents);
        if (data.gameReports) sess.setGameReports(data.gameReports);
        if (data.sessionReports) sess.setSessionReports(data.sessionReports);
        if (data.communities) comm.setCommunities(data.communities);
        if (data.communityPresence) communityPresence.setPresenceRecords(data.communityPresence);
        if (data.whatsAppListTemplates) whatsAppLists.setTemplates(data.whatsAppListTemplates);
        if (data.whatsAppListDrafts) whatsAppLists.setDrafts(data.whatsAppListDrafts);
        if (data.communityRules) communityRules.setRules(data.communityRules);
        if (data.championships) championships.setChampionships(data.championships);
        if (data.championshipTeams) championships.setChampionshipTeams(data.championshipTeams);
        if (data.championshipRounds) championships.setChampionshipRounds(data.championshipRounds);

        if (data.activeSession !== undefined) {
          sess.setActiveSession(data.activeSession);
        }
        const persistence = buildImportedBackupPersistencePlan({
          sessionDraft: data.sessionDraft,
          lastSelectedPlayerIds: data.lastSelectedPlayerIds,
          lastSessionConfig: data.lastSessionConfig,
        });
        if (persistence.sessionDraft.kind === 'save') {
          saveSessionDraft(persistence.sessionDraft.value);
          setSessionDraft(persistence.sessionDraft.value);
        } else if (persistence.sessionDraft.kind === 'clear') {
          clearSessionDraft();
          setSessionDraft(null);
        }
        if (persistence.lastSelectedPlayerIds.kind === 'save') {
          saveToStorage(
            STORAGE_KEYS.lastSelectedPlayerIds,
            persistence.lastSelectedPlayerIds.value,
          );
        } else if (persistence.lastSelectedPlayerIds.kind === 'clear') {
          localStorage.removeItem(STORAGE_KEYS.lastSelectedPlayerIds);
        }
        if (persistence.lastSessionConfig.kind === 'save') {
          saveToStorage(STORAGE_KEYS.lastSessionConfig, persistence.lastSessionConfig.value);
        } else if (persistence.lastSessionConfig.kind === 'clear') {
          localStorage.removeItem(STORAGE_KEYS.lastSessionConfig);
        }

        // Go to dashboard to reload fresh data
        navigate(paths.painel);

        window.alert('Dados importados com sucesso!');
      } catch (e) {
        console.error('Erro ao importar backup:', e);
        window.alert('Erro ao importar: arquivo inválido.');
      }
    };
    reader.readAsText(file);
  };

  const createSessionFromCommunity = (
    community: Community,
    playerIds: string[],
    rules: CommunityRules,
  ) => {
    const result = buildSessionFromCommunity({
      community,
      playerIds,
      rules,
      now: new Date(),
      createId: generateUUID,
    });
    sess.setActiveSession(result.session);
    wizard.setWizardStep(result.nextWizardStep);
    navigate(paths.sessaoNova(community.id));
  };

  const createPlayerForCommunity = (name: string, communityId: string) => {
    const now = new Date().toISOString();
    play.setPlayers(
      applyPlayerCreationForCommunity({
        players: play.rawPlayers,
        name,
        communityId,
        now,
        createId: generateUUID,
        createUsername: (playerName) =>
          resolveUsername(
            { nome: playerName, isGuest: false },
            play.rawPlayers.filter((p) => p.username).map((p) => p.username as string),
          ),
      }).players,
    );
  };

  const materializeChampionshipRound = (roundId: string) => {
    const round = championships.championshipRounds.find((item) => item.id === roundId);
    if (!round) return productError('not_found', 'Rodada da liga não encontrada.');
    if (round.sessionId) return productError('conflict', 'Esta rodada já possui uma sessão.');

    const championship = championships.championships.find(
      (item) => item.id === round.championshipId,
    );
    if (!championship) return productError('not_found', 'Liga da rodada não encontrada.');

    const roster = championships.championshipTeams.filter(
      (team) => team.championshipId === championship.id,
    );
    const now = new Date().toISOString();
    const result = materializeRound(round, roster, championship.communityId, now);
    if (result.ok === false) return result;

    const session = { ...result.value.session, syncStatus: 'local' as const };
    const teams = result.value.teams.map((team) => ({
      ...team,
      syncStatus: 'local' as const,
      updatedAt: now,
    }));
    const game = {
      ...result.value.game,
      syncStatus: 'local' as const,
      updatedAt: now,
    };

    sess.setSessions((current) => [...current, session]);
    sess.setTeams((current) => [...current, ...teams]);
    sess.setGames((current) => [...current, game]);
    championships.markRoundMaterialized(round.id, session.id);

    return appOk({ sessionId: session.id });
  };

  const clearChampionshipTeamBridges = (championshipIds: Set<string>) => {
    const teamIds = new Set<string>(
      championships.rawChampionshipTeams
        .filter((team) => championshipIds.has(team.championshipId))
        .map((team) => team.id),
    );
    if (teamIds.size === 0) return;
    const now = new Date().toISOString();
    sess.setTeams((current) => detachChampionshipTeamBridges(current, teamIds, now));
  };

  const deleteChampionshipAggregate = (championshipId: string) => {
    clearChampionshipTeamBridges(new Set<string>([championshipId]));
    championships.deleteChampionship(championshipId);
  };

  const deleteChampionshipsForCommunity = (communityId: string) => {
    const championshipIds = new Set<string>(
      championships.rawChampionships
        .filter((championship) => championship.communityId === communityId)
        .map((championship) => championship.id),
    );
    clearChampionshipTeamBridges(championshipIds);
    championships.deleteForCommunity(communityId);
  };

  const deleteCommunityAggregate = (communityId: string) => {
    const next = applyCommunityDeletion({
      communityId,
      communities: comm.rawCommunities,
      players: play.rawPlayers,
      presenceRecords: communityPresence.presenceRecords,
      templates: whatsAppLists.rawTemplates,
      drafts: whatsAppLists.drafts,
    });
    comm.setCommunities(next.communities);
    play.setPlayers(next.players);
    communityRules.removeRules(communityId);
    communityPresence.setPresenceRecords(next.presenceRecords);
    whatsAppLists.setTemplates(next.templates);
    whatsAppLists.setDrafts(next.drafts);
    deleteChampionshipsForCommunity(communityId);
  };

  // Sync draft state
  useEffect(() => {
    setSessionDraft(loadSessionDraft());
  }, [wizard.wizardStep, sess.activeSession]);

  // ── Finish session ────────────────────────────────────────────────────────

  const handleFinishSession = () => {
    if (!sess.activeSession) return;
    if (!window.confirm('Deseja realmente encerrar a sessão atual?')) return;

    try {
      const result = buildFinishedSessionResult({
        activeSession: sess.activeSession,
        sessions: sess.sessions,
        games: sess.games,
        pointEvents: sess.pointEvents,
        teams: sess.teams,
        players: play.players,
        sessionReports: sess.sessionReports,
        finishedAt: new Date().toISOString(),
      });

      // 1. Build cards BEFORE session finish (current session not finished)
      const buildCtxBefore = {
        sessions: sess.sessions,
        teams: sess.teams,
        games: sess.games,
        pointEvents: sess.pointEvents,
        players: play.players,
        sessionReports: sess.sessionReports,
      };

      // 2. Build cards AFTER the use case applies progression, rating and report updates.

      const buildCtxAfter = {
        sessions: result.updatedSessions,
        teams: sess.teams,
        games: result.updatedGames,
        pointEvents: sess.pointEvents,
        players: result.updatedPlayers,
        sessionReports: result.updatedReports,
      };

      const itemsToReveal: RevealItem[] = buildVutRevealItems({
        participants: result.participants,
        updatedPlayers: result.updatedPlayers,
        beforeContext: buildCtxBefore,
        afterContext: buildCtxAfter,
      });

      // 4. Update states
      play.setPlayers(result.updatedPlayers);
      sess.setSessionReports(result.updatedReports);
      sess.setSessions(result.updatedSessions);
      sess.setGames(result.updatedGames);
      sess.setActiveSession(null);

      // Trigger modal reveal queue if any
      if (itemsToReveal.length > 0) {
        setRevealQueue(itemsToReveal);
      }

      navigate(paths.painel);
    } catch (e) {
      console.error('Error in handleFinishSession:', e);
    }
  };

  const handlePlayerEditActionError = (error: unknown) => {
    const message = getPlayerEditActionErrorMessage(error);
    if (message) toasts.push(message, 'error');
  };

  const applyGuestPlayer = (newPlayer: Player, editDetails: boolean, communityId: string) => {
    const result = applyGuestPlayerUpsert(play.rawPlayers, newPlayer, communityId);
    play.setPlayers(result.players);
    if (sess.activeSession && sess.activeSession.communityId === communityId) {
      const nextSelected = [
        ...new Set([...sess.activeSession.selectedPlayerIds, result.selectedPlayer.id]),
      ];
      wizard.updateSession({ selectedPlayerIds: nextSelected });
    }
    if (editDetails) {
      play.setEditingPlayer(result.selectedPlayer);
      navigate(paths.atleta(communityId, result.selectedPlayer.id));
    }
  };

  const navItems = getShellNavigationItems({
    pathname: location.pathname,
    isStaff: auth.isStaff,
    pendingChanges,
  });
  const headerAccount = getAccountDisplay({
    profileName: auth.profile?.name,
    email: auth.user?.email,
    fallbackName: 'Administrador',
    fallbackInitials: 'AD',
  });
  const footerAccount = getAccountDisplay({
    profileName: auth.profile?.name,
    email: auth.user?.email,
    fallbackName: 'Panelinha',
    fallbackInitials: 'PL',
  });
  const liveSessionVisible = operationalPhase !== 'rascunho' && operationalPhase !== 'encerrada';
  const liveSessionPath = activeCommunityId
    ? paths.sessaoAtiva(activeCommunityId)
    : paths.sessaoAtivaSemComunidade;

  const shell: ShellApi = {
    sess,
    play,
    comm,
    communityPresence,
    communityRules,
    whatsAppLists,
    championships,
    auth,
    toasts,
    cloudSync,
    wizard,
    currentDeviceId,
    sessionDraft,
    pendingChanges,
    activeSessionCommunityId: activeCommunityId,
    handleExportBackup,
    handleImportBackup,
    handleFinishSession,
    createSessionFromCommunity,
    createPlayerForCommunity,
    materializeChampionshipRound,
    deleteChampionshipAggregate,
    deleteCommunityAggregate,
    handlePlayerEditActionError,
    applyGuestPlayer,
  };

  return (
    <div className="drawer lg:drawer-open">
      <ToastViewport toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      <input id="sidebar-drawer" type="checkbox" className="drawer-toggle" />

      <div className="drawer-content flex flex-col min-h-screen min-w-0 bg-base-100 text-base-content">
        {pendingDeliveryNotice && (
          <button
            type="button"
            onClick={() => navigate(paths.perfilSync)}
            className="w-full bg-warning/20 text-warning-content text-xs font-bold px-4 py-2 text-left"
          >
            {pendingDeliveryNotice.message} Toque para ver os detalhes.
          </button>
        )}
        <header className="h-[72px] bg-base-200 border-b border-base-300 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <label htmlFor="sidebar-drawer" className="btn btn-ghost btn-circle lg:hidden">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="inline-block h-5 w-5 stroke-current"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                ></path>
              </svg>
            </label>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider text-base-content">
                {getPageTitleForPath(location.pathname)}
              </h2>
              {liveSessionVisible && (
                <p className="text-[10px] text-base-content/60 font-medium mt-0.5">
                  Sessão Ativa:{' '}
                  <span className="text-primary font-bold">{sess.activeSession?.name}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {liveSessionVisible && (
              <Link
                to={liveSessionPath}
                className="badge badge-success badge-soft gap-1.5 sm:gap-2 px-2 sm:px-3 py-3 font-black uppercase text-[9px] tracking-wider"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span className="hidden sm:inline">{PHASE_LABEL[operationalPhase]}</span>
              </Link>
            )}

            <div className="h-4 w-px bg-base-300" />

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-base-content uppercase hidden sm:inline">
                {headerAccount.name}
              </span>
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black uppercase text-xs">
                {headerAccount.initials}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname + location.search}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
              <Suspense fallback={null}>
                <Outlet context={shell} />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {revealQueue.length > 0 && (
        <VutRevealModal
          isOpen={revealQueue.length > 0}
          onClose={() => setRevealQueue([])}
          revealItems={revealQueue}
        />
      )}

      <div className="drawer-side z-30">
        <label
          htmlFor="sidebar-drawer"
          aria-label="close sidebar"
          className="drawer-overlay"
        ></label>
        <aside className="w-64 bg-base-200 border-r border-base-300 h-screen flex flex-col justify-between shrink-0">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-base-content uppercase leading-none">
                  Panelinha
                </h1>
                <p className="text-[9px] text-base-content/60 font-bold tracking-wider uppercase mt-1">
                  Plataforma Esportiva
                </p>
              </div>
            </div>
            <nav className="space-y-1">
              <ul className="menu p-0">
                {navItems.map((item) => (
                  <li key={item.id} className="mb-1">
                    <Link
                      to={item.to}
                      onClick={() => {
                        const checkbox = document.getElementById(
                          'sidebar-drawer',
                        ) as HTMLInputElement;
                        if (checkbox) checkbox.checked = false;
                      }}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                        item.active
                          ? 'bg-primary! text-primary-content! shadow-lg shadow-primary/20'
                          : 'text-base-content/70 hover:text-base-content hover:bg-base-300'
                      }`}
                    >
                      {navigationIconByKey[item.icon]}
                      <span className="flex-1 text-left">{item.label}</span>
                      {!!item.badge && item.badge > 0 && (
                        <span
                          className="badge badge-sm badge-warning font-black"
                          title={`${item.badge} alteração(ões) pendente(s) de sincronização`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="p-6 border-t border-base-300 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-base-300 flex items-center justify-center text-xs font-bold uppercase">
              {footerAccount.initials}
            </div>
            <div>
              <p className="text-xs font-bold text-base-content uppercase leading-none">
                {footerAccount.name}
              </p>
              <span className="text-[9px] text-base-content/40 uppercase">v1.0.0</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
