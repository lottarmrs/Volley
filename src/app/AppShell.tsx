import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Cloud,
  LayoutDashboard,
  Medal,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';

import {
  extractCommunityId,
  getPageTitleForPath,
  getReturnRouteForPath,
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
import { isGuestAccess } from '../application/guestAccess';
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

  const currentCommunityId = extractCommunityId(location.pathname);
  const currentCommunity = useMemo(
    () => comm.communities.find((c) => c.id === currentCommunityId) || null,
    [comm.communities, currentCommunityId],
  );
  const returnPath = getReturnRouteForPath(location.pathname);

  useEffect(() => {
    if (currentCommunityId) {
      saveToStorage(STORAGE_KEYS.activeCommunityId, currentCommunityId);
    }
  }, [currentCommunityId]);

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

        toasts.push('Backup restaurado. Seus atletas e sessões voltaram.', 'success');
      } catch (e) {
        console.error('Erro ao importar backup:', e);
        toasts.push(
          'Este arquivo não é um backup do Panelinha. Escolha o .json que você exportou aqui — seus dados atuais continuam intactos.',
          'error',
        );
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
    const result = applyPlayerCreationForCommunity({
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
    });

    play.setPlayers(result.players);

    // A ação mais executada da página era muda nos três desfechos.
    if (result.outcome === 'empty') {
      toasts.push('Digite o nome do atleta antes de adicionar.', 'error');
      return;
    }
    if (result.outcome === 'linked') {
      toasts.push(
        `${result.name} já estava no seu elenco e foi vinculado a esta comunidade.`,
        'info',
      );
      return;
    }
    toasts.push(`${result.name} entrou no elenco.`, 'success');
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

  // Quem chama já confirmou: o free play tem o modal de encerramento e o torneio
  // pergunta antes de encerrar com partidas pendentes. Um confirm aqui era a
  // segunda pergunta seguida, no exato momento em que a pelada acabou.
  const handleFinishSession = () => {
    if (!sess.activeSession) return;

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

      navigate(paths.resumo);
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

  const isGuest = isGuestAccess(auth.state);

  // Conversão de convidado: o acervo montado no modo local não tem dono
  // (`getLocalCacheOwnerId()` nulo), e `validateCacheOwner` deixa um cache sem
  // dono passar. Um upload no primeiro login carimba o dono e leva a pelada
  // inteira para a conta nova, sem o usuário recomeçar nada.
  const guestMigrationRef = useRef(false);
  useEffect(() => {
    if (guestMigrationRef.current) return;
    if (!auth.isSupabaseConfigured || !auth.user?.id) return;
    if (getLocalCacheOwnerId()) return;
    if (play.rawPlayers.length === 0 && sess.sessions.length === 0) return;

    guestMigrationRef.current = true;
    void cloudSync
      .uploadToCloud()
      .then(() => toasts.push('Sua pelada local agora está vinculada à sua conta.', 'success'))
      .catch(() => {
        // A falha já foi registrada no ledger de sync; o acervo continua salvo
        // localmente e a próxima tentativa acontece pelo painel de sincronização.
        guestMigrationRef.current = false;
      });
  }, [
    auth.isSupabaseConfigured,
    auth.user?.id,
    cloudSync,
    play.rawPlayers.length,
    sess.sessions.length,
    toasts,
  ]);

  const navItems = getShellNavigationItems({
    pathname: location.pathname,
    isStaff: auth.isStaff,
    pendingChanges,
    isGuest,
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
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <label
              htmlFor="sidebar-drawer"
              aria-label="Abrir menu de navegação"
              className="btn btn-ghost btn-circle lg:hidden"
            >
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
            {returnPath && (
              <Link
                to={returnPath}
                className="btn btn-ghost btn-circle btn-sm min-h-[36px] min-w-[36px]"
                aria-label="Voltar"
                title="Voltar para navegação anterior"
              >
                <ArrowLeft className="w-4 h-4 text-base-content/70 hover:text-base-content" />
              </Link>
            )}
            <div className="min-w-0">
              {currentCommunity && (
                <div className="flex min-w-0 items-center gap-1 text-xs font-bold text-base-content/60 mb-0.5">
                  <span className="shrink-0">Panelinha</span>
                  <ChevronRight className="w-3 h-3 shrink-0 opacity-40" />
                  <Link
                    to={paths.comunidade(currentCommunity.id)}
                    className="truncate text-primary hover:underline"
                  >
                    {currentCommunity.name}
                  </Link>
                </div>
              )}
              {/* O h1 da pagina vive aqui, derivado da rota: 11 views nao tinham
                  cabecalho proprio, e as que tinham criavam um segundo h1. O shell
                  garante exatamente um por rota; o conteudo comeca no h2. */}
              <h1 className="truncate text-base font-bold uppercase tracking-wider text-base-content">
                {getPageTitleForPath(location.pathname)}
              </h1>
              {liveSessionVisible && (
                <p className="truncate text-xs text-base-content/60 font-medium mt-0.5">
                  Sessão Ativa:{' '}
                  <span className="text-primary font-bold">{sess.activeSession?.name}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            {liveSessionVisible && (
              <Link
                to={liveSessionPath}
                className="badge badge-success min-w-0 gap-2 px-3 py-3 font-black uppercase text-xs tracking-wider text-emerald-950 shadow-md shadow-emerald-950/40 transition-transform hover:scale-105"
                title="Clique para abrir a Partida Ao Vivo em andamento"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-950 animate-ping" />
                {/* Em 375px o rótulo completo somado ao CTA de conta estourava o
                    header; o ponto pulsante já carrega o "ao vivo". */}
                <span className="hidden truncate sm:inline">
                  PARTIDA AO VIVO: {PHASE_LABEL[operationalPhase]}
                </span>
                <span className="truncate sm:hidden">AO VIVO</span>
              </Link>
            )}

            <div className="hidden h-4 w-px shrink-0 bg-base-300 sm:block" />

            {isGuest ? (
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden text-xs font-bold uppercase tracking-wide text-base-content/60 sm:inline">
                  Modo local
                </span>
                <Link
                  to="/entrar"
                  className="btn btn-primary min-h-[40px] shrink-0 px-3 text-xs font-black uppercase tracking-wider sm:px-4"
                >
                  <span>Entrar</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-base-content uppercase hidden sm:inline">
                  {headerAccount.name}
                </span>
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-content font-black uppercase text-xs shadow-sm">
                  {headerAccount.initials}
                </div>
              </div>
            )}
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
              <Suspense
                fallback={
                  <div className="flex items-center justify-center min-h-[50vh]">
                    <span className="loading loading-spinner loading-lg text-primary" />
                  </div>
                }
              >
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
        <aside
          aria-label="Menu principal"
          className="w-64 bg-base-200 border-r border-base-300 h-screen flex flex-col justify-between shrink-0"
        >
          <div className="p-6 overflow-y-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="block text-lg font-black tracking-tight text-base-content uppercase leading-none">
                  Panelinha
                </span>
                <p className="text-[9px] text-base-content/60 font-bold tracking-wider uppercase mt-1">
                  Plataforma Esportiva
                </p>
              </div>
            </div>

            {/* MÓDULO DA COMUNIDADE BANNER */}
            {currentCommunity && (
              <div className="bg-primary/10 border border-primary/25 rounded-2xl p-3 mb-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="badge badge-primary badge-xs font-black uppercase tracking-wider text-[9px]">
                    Módulo da Comunidade
                  </span>
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary text-primary-content font-black flex items-center justify-center text-xs uppercase shadow-sm shrink-0">
                    {currentCommunity.name.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-base-content truncate">
                      {currentCommunity.name}
                    </p>
                    <p className="text-[10px] text-base-content/60 font-medium truncate">
                      {currentCommunity.location || 'Comunidade Ativa'}
                    </p>
                  </div>
                </div>
              </div>
            )}
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
                      className={`w-full flex items-center gap-3.5 px-4 min-h-[44px] rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
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
