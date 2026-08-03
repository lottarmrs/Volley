/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  LayoutDashboard,
  Trophy,
  Users,
  Medal,
  BarChart3,
  Settings,
  ShieldCheck,
  Cloud,
} from 'lucide-react';

import { usePlayers } from './hooks/usePlayers';
import { useSessions } from './hooks/useSessions';
import { useSessionWizard } from './hooks/useSessionWizard';
import { useCommunities } from './hooks/useCommunities';
import { useCommunityPresence } from './hooks/useCommunityPresence';
import { useCommunityRules } from './hooks/useCommunityRules';
import { useWhatsAppListTemplates } from './hooks/useWhatsAppListTemplates';
import { useChampionships } from './hooks/useChampionships';
import { useAuth } from './hooks/useAuth';
import { supabaseAuthClient } from '@infra/supabase/authClient';
import { useCloudSync } from './hooks/useCloudSync';
import { useToast } from './ui/common/ToastProvider';
import { useCommunityPermissions } from './hooks/useCommunityPermissions';

import { ToastViewport } from '@ui/common/ToastViewport';

import { loadSessionDraft, clearSessionDraft, saveSessionDraft } from './logic/sessionDraft';
import { VutRevealModal, RevealItem } from './components/player/VutRevealModal';
import { Community, CommunityRules, Game, Player, SessionConfig, Team } from './types';
import {
  STORAGE_KEYS,
  getLocalCacheOwnerId,
  loadFromStorage,
  saveToStorage,
} from './storage/localStorageRepository';
import { countPendingChanges } from './logic/syncStatus';
import { resolveUsername } from './logic/username';
import { generateUUID } from './logic/uuid';
import {
  applyCommunityDeletion,
  applyCommunityHistoryClear,
  applyCommunityMembershipDuplicate,
  applyLinkedCloudPlayer,
  applyPlayerCommunityMemberships,
} from './application/localCommunityUseCases';
import {
  applyGuestPlayerUpsert,
  applyPlayerCreationForCommunity,
} from './application/localPlayerUseCases';
import {
  buildActiveSessionClearResult,
  buildDraftClearResult,
  buildFinishedSessionResult,
  buildManualSessionStartResult,
  buildSessionFromCommunity,
  selectSessionTeams,
} from './application/sessionLifecycleUseCases';
import {
  buildPendingDeliveryNotice,
  getAccountDisplay,
  getCommunitiesNavigationTarget,
  getCurrentPageTitle,
  getDashboardNavigationTarget,
  getHistoryNavigationTarget,
  getHistorySessionNavigationTarget,
  getLiveSessionNavigationTarget,
  getModuleNavigationItems,
  getModuleNavigationTarget,
  getPlayersNavigationTarget,
  type Module,
  type ModuleNavigationItem,
  type Page,
  type ShellNavigationTarget,
} from '@app/appShellViewModel';
import {
  buildBackupFileName,
  buildBackupPayload,
  buildImportedBackupPersistencePlan,
  prepareImportedBackup,
} from './application/backupUseCases';
import { buildVutRevealItems } from './application/vutRevealUseCases';
import { getPlayerEditActionErrorMessage } from './application/playerEditActionUseCases';
import { planStartupCloudDownload } from './application/cloudSyncStartupUseCases';
import {
  detachChampionshipTeamBridges,
  materializeRound,
} from './application/championshipUseCases';
import { appOk, productError } from '@app/appResult';

const Dashboard = lazy(() =>
  import('./components/dashboard/Dashboard').then((module) => ({ default: module.Dashboard })),
);
const PlayersView = lazy(() =>
  import('./components/player/PlayersView').then((module) => ({ default: module.PlayersView })),
);
const PlayerEditView = lazy(() =>
  import('./components/player/PlayerEditView').then((module) => ({
    default: module.PlayerEditView,
  })),
);
const SessionWizard = lazy(() =>
  import('./components/session/SessionWizard').then((module) => ({
    default: module.SessionWizard,
  })),
);
const SessionActiveView = lazy(() =>
  import('./components/live/SessionActiveView').then((module) => ({
    default: module.SessionActiveView,
  })),
);
const HistoryView = lazy(() =>
  import('./components/history/HistoryView').then((module) => ({ default: module.HistoryView })),
);
const CommunitiesView = lazy(() =>
  import('./components/community/CommunitiesView').then((module) => ({
    default: module.CommunitiesView,
  })),
);
const AccountSyncView = lazy(() =>
  import('./components/account/AccountSyncView').then((module) => ({
    default: module.AccountSyncView,
  })),
);
const GestaoView = lazy(() =>
  import('./components/admin/GestaoView').then((module) => ({ default: module.GestaoView })),
);
const SettingsModule = lazy(() =>
  import('./components/settings/SettingsModule').then((module) => ({
    default: module.SettingsModule,
  })),
);
const RankingModule = lazy(() =>
  import('./components/ranking/RankingModule').then((module) => ({
    default: module.RankingModule,
  })),
);
const TournamentsModule = lazy(() =>
  import('./components/tournaments/TournamentsModule').then((module) => ({
    default: module.TournamentsModule,
  })),
);

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [activeModule, setActiveModule] = useState<Module>('dashboard');
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState(() => loadSessionDraft());
  const [revealQueue, setRevealQueue] = useState<RevealItem[]>([]);

  // Auth state
  const auth = useAuth();
  const toasts = useToast();

  // ── Domain hooks ──────────────────────────────────────────────────────────

  const sess = useSessions();
  const play = usePlayers(sess.games, sess.pointEvents, sess.teams);
  const comm = useCommunities();
  const communityPresence = useCommunityPresence();
  const communityRules = useCommunityRules();
  const whatsAppLists = useWhatsAppListTemplates();
  const championships = useChampionships();

  const editingPlayerCommunity = useMemo(() => {
    if (
      !play.editingPlayer ||
      !play.editingPlayer.communityIds ||
      play.editingPlayer.communityIds.length === 0
    )
      return null;
    return comm.communities.find((c) => play.editingPlayer!.communityIds!.includes(c.id)) || null;
  }, [play.editingPlayer, comm.communities]);

  const playerPermissions = useCommunityPermissions(editingPlayerCommunity);
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
        setPage('dashboard');
        setActiveModule('dashboard');

        window.alert('Dados importados com sucesso!');
      } catch (e) {
        console.error('Erro ao importar backup:', e);
        window.alert('Erro ao importar: arquivo inválido.');
      }
    };
    reader.readAsText(file);
  };

  const wizard = useSessionWizard({
    players: play.players,
    activeSession: sess.activeSession,
    setActiveSession: sess.setActiveSession,
    setSessions: sess.setSessions,
    setTeams: sess.setTeams,
    games: sess.games,
    setGames: sess.setGames,
    setPage,
    sessions: sess.sessions,
    teams: sess.teams,
  });

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
    setPage('session-wizard');
    setActiveModule('dashboard');
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
        games: sess.games,
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
      sess.setActiveSession(null);

      // Trigger modal reveal queue if any
      if (itemsToReveal.length > 0) {
        setRevealQueue(itemsToReveal);
      }

      setPage('dashboard');
      setActiveModule('dashboard');
    } catch (e) {
      console.error('Error in handleFinishSession:', e);
    }
  };

  // ── Navigation shell helpers ──────────────────────────────────────────────

  const handleNav = (module: Module) => {
    const target = getModuleNavigationTarget({
      module,
      activeSessionStatus: sess.activeSession?.status,
    });
    applyShellNavigationTarget(target);
  };

  const applyShellNavigationTarget = (target: ShellNavigationTarget) => {
    setActiveModule(target.activeModule);
    if (target.page) setPage(target.page);
    if (target.selectedHistorySessionId !== undefined) {
      setSelectedHistorySessionId(target.selectedHistorySessionId);
    }
  };

  const handlePlayerEditActionError = (error: unknown) => {
    const message = getPlayerEditActionErrorMessage(error);
    if (message) toasts.push(message, 'error');
  };

  // ── Render Views ──────────────────────────────────────────────────────────

  const renderActiveContent = () => {
    switch (activeModule) {
      case 'dashboard':
        if (page === 'session-wizard') {
          return (
            <SessionWizard
              activeSession={sess.activeSession}
              players={play.players}
              communities={comm.communities}
              wizardStep={wizard.wizardStep}
              validationErrors={wizard.validationErrors}
              bestDivisions={wizard.bestDivisions}
              setBestDivisions={wizard.setBestDivisions}
              selectedDivisionIndex={wizard.selectedDivisionIndex}
              partnershipMatrix={wizard.partnershipMatrix}
              onNext={() => {
                if (wizard.validateCurrentStep()) wizard.nextStep();
              }}
              onPrev={wizard.prevStep}
              onCancel={wizard.cancelWizard}
              onUpdateSession={wizard.updateSession}
              onTogglePlayer={wizard.togglePlayer}
              onSelectAllActive={wizard.selectAllActivePlayers}
              onClearSelection={wizard.clearSelectedPlayers}
              onUseLastSelection={wizard.useLastSelection}
              onGenerateDivisions={wizard.generateDivisions}
              onCancelGeneration={wizard.cancelGeneration}
              isGenerating={wizard.isGenerating}
              generationProgress={wizard.progress}
              onConfirmDivision={wizard.confirmDivision}
              onStartGeneratedTournament={wizard.startGeneratedTournament}
              setSelectedDivisionIndex={wizard.setSelectedDivisionIndex}
              togglePlayerLock={wizard.togglePlayerLock}
              addPairConstraint={wizard.addPairConstraint}
              removePairConstraint={wizard.removePairConstraint}
              onAddGuestPlayer={(newPlayer, editDetails) => {
                const result = applyGuestPlayerUpsert(play.rawPlayers, newPlayer);
                play.setPlayers(result.players);
                if (sess.activeSession) {
                  const nextSelected = [
                    ...new Set([...sess.activeSession.selectedPlayerIds, result.selectedPlayer.id]),
                  ];
                  wizard.updateSession({ selectedPlayerIds: nextSelected });
                }
                if (editDetails) {
                  play.setEditingPlayer(result.selectedPlayer);
                  setPage('player-edit');
                }
              }}
            />
          );
        }
        if (page === 'player-edit') {
          return (
            <PlayerEditView
              editingPlayer={play.editingPlayer!}
              setEditingPlayer={play.setEditingPlayer}
              players={play.players}
              games={sess.games}
              pointEvents={sess.pointEvents}
              teams={sess.teams}
              communities={comm.communities}
              sessions={sess.sessions}
              onBack={() => setPage('session-wizard')}
              onSave={() => {
                try {
                  if (play.handleSavePlayer(playerPermissions, editingPlayerCommunity?.id))
                    setPage('session-wizard');
                } catch (err) {
                  handlePlayerEditActionError(err);
                }
              }}
              onDelete={() => {
                try {
                  play.handleDeletePlayer(playerPermissions);
                  setPage('session-wizard');
                } catch (err) {
                  handlePlayerEditActionError(err);
                }
              }}
              validationErrors={play.validationErrors}
              showDeleteConfirm={play.showDeleteConfirm}
              setShowDeleteConfirm={play.setShowDeleteConfirm}
              permissions={playerPermissions}
              currentUserId={auth.user?.id ?? null}
            />
          );
        }
        if (page === 'session-active') {
          return (
            <SessionActiveView
              activeSession={sess.activeSession!}
              games={sess.games}
              setGames={sess.setGames}
              pointEvents={sess.pointEvents}
              setPointEvents={sess.setPointEvents}
              players={play.players}
              sessionTeams={selectSessionTeams(sess.teams, sess.activeSession?.id)}
              gameReports={sess.gameReports}
              setGameReports={sess.setGameReports}
              setActiveSession={sess.updateActiveSession}
              onExit={() => {
                setPage('dashboard');
                setActiveModule('dashboard');
              }}
              onFinishSession={handleFinishSession}
            />
          );
        }
        return (
          <Dashboard
            activeSession={sess.activeSession}
            sessionDraft={sessionDraft}
            onNewSession={() => {
              const result = buildManualSessionStartResult({
                now: new Date(),
                createId: generateUUID,
              });
              sess.setActiveSession(result.session);
              wizard.setWizardStep(result.nextWizardStep);
              setPage('session-wizard');
            }}
            onResumeSession={() => {
              applyShellNavigationTarget(getLiveSessionNavigationTarget());
            }}
            onResumeDraft={(draft) => {
              wizard.resumeDraft(draft);
              setPage('session-wizard');
            }}
            onClearDraft={() => {
              if (window.confirm('Deseja realmente descartar o rascunho?')) {
                const result = buildDraftClearResult();
                clearSessionDraft();
                setSessionDraft(result.nextSessionDraft);
                sess.setActiveSession(result.nextActiveSession);
              }
            }}
            onClearActiveSession={() => {
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
                setSessionDraft(result.nextSessionDraft);
              }
            }}
            onPlayers={() => {
              applyShellNavigationTarget(getPlayersNavigationTarget());
            }}
            onHistory={() => {
              applyShellNavigationTarget(getHistoryNavigationTarget());
            }}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onCommunities={() => {
              applyShellNavigationTarget(getCommunitiesNavigationTarget());
            }}
          />
        );

      case 'players':
        if (page === 'player-edit') {
          return (
            <PlayerEditView
              editingPlayer={play.editingPlayer!}
              setEditingPlayer={play.setEditingPlayer}
              players={play.players}
              games={sess.games}
              pointEvents={sess.pointEvents}
              teams={sess.teams}
              communities={comm.communities}
              sessions={sess.sessions}
              onBack={() => setPage('players')}
              onSave={() => {
                try {
                  if (play.handleSavePlayer(playerPermissions, editingPlayerCommunity?.id))
                    setPage('players');
                } catch (err) {
                  handlePlayerEditActionError(err);
                }
              }}
              onDelete={() => {
                try {
                  play.handleDeletePlayer(playerPermissions);
                  setPage('players');
                } catch (err) {
                  handlePlayerEditActionError(err);
                }
              }}
              validationErrors={play.validationErrors}
              showDeleteConfirm={play.showDeleteConfirm}
              setShowDeleteConfirm={play.setShowDeleteConfirm}
              permissions={playerPermissions}
              currentUserId={auth.user?.id ?? null}
            />
          );
        }
        if (page === 'communities') {
          return (
            <CommunitiesView
              communities={comm.communities}
              players={play.players}
              sessions={sess.sessions}
              games={sess.games}
              pointEvents={sess.pointEvents}
              teams={sess.teams}
              sessionReports={sess.sessionReports}
              championships={championships.championships}
              championshipTeams={championships.championshipTeams}
              championshipRounds={championships.championshipRounds}
              presenceApi={communityPresence}
              whatsAppApi={whatsAppLists}
              rulesApi={communityRules}
              onBack={() => setPage('players')}
              onAddCommunity={comm.addCommunity}
              onUpdateCommunity={comm.updateCommunity}
              onDeleteCommunity={(communityId) => {
                if (!window.confirm('Excluir esta comunidade? Os atletas continuarao cadastrados.'))
                  return;
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
              }}
              onDuplicateCommunity={(communityId, includeAthletes) => {
                const result = comm.duplicateCommunity(communityId, includeAthletes);
                if (result?.includeAthletes) {
                  play.setPlayers((prev) =>
                    applyCommunityMembershipDuplicate(prev, {
                      sourceCommunityId: communityId,
                      duplicateCommunityId: result.duplicate.id,
                    }),
                  );
                }
              }}
              onUpdatePlayerCommunities={(communityId, memberPlayerIds) => {
                play.setPlayers((prev) =>
                  applyPlayerCommunityMemberships(prev, communityId, memberPlayerIds),
                );
              }}
              onCreatePlayer={createPlayerForCommunity}
              onCreateSession={createSessionFromCommunity}
              onViewSession={(sessionId) => {
                applyShellNavigationTarget(getHistorySessionNavigationTarget(sessionId));
              }}
              onClearCommunityHistory={(communityId) => {
                sess.setSessions((prev) => applyCommunityHistoryClear(prev, communityId));
              }}
              onCreateChampionship={championships.create}
              onMaterializeRound={materializeChampionshipRound}
              onDeleteChampionship={deleteChampionshipAggregate}
              onRescheduleRound={championships.rescheduleRound}
              onSetRoundSkipped={championships.setRoundSkipped}
              onUpdateChampionshipRecurrence={championships.updateRecurrence}
              currentUserId={auth.user?.id ?? null}
              isSupabaseConfigured={auth.isSupabaseConfigured}
              globalRole={auth.profile?.role ?? null}
              onLinkedCloudPlayer={(player, communityId) => {
                play.setPlayers((prev) => applyLinkedCloudPlayer(prev, player, communityId));
              }}
            />
          );
        }
        return (
          <PlayersView
            players={play.players}
            communities={comm.communities}
            games={sess.games}
            pointEvents={sess.pointEvents}
            teams={sess.teams}
            sessions={sess.sessions}
            onBack={() => {
              applyShellNavigationTarget(getDashboardNavigationTarget());
            }}
            onAddPlayer={() => {
              play.handleAddPlayer();
              setPage('player-edit');
            }}
            onEditPlayer={(p) => {
              play.handleEditPlayer(p);
              setPage('player-edit');
            }}
            onRestoreDemoPlayers={play.handleRestoreDemoPlayers}
            onAddGuestPlayer={(newPlayer, editDetails) => {
              const result = applyGuestPlayerUpsert(play.rawPlayers, newPlayer);
              play.setPlayers(result.players);
              if (editDetails) {
                play.setEditingPlayer(result.selectedPlayer);
                setPage('player-edit');
              }
            }}
          />
        );

      case 'torneios':
        return (
          <TournamentsModule
            sessions={sess.sessions}
            games={sess.games}
            teams={sess.teams}
            sessionReports={sess.sessionReports}
            onNewTournament={() => {
              const result = buildManualSessionStartResult({
                type: 'tournament',
                now: new Date(),
                createId: generateUUID,
              });
              sess.setActiveSession(result.session);
              wizard.setWizardStep(result.nextWizardStep);
              setPage('session-wizard');
              setActiveModule('dashboard');
            }}
            onOpenTournament={(tournament, shouldOpenLive) => {
              if (shouldOpenLive) {
                sess.setActiveSession(tournament);
                applyShellNavigationTarget(getLiveSessionNavigationTarget());
              } else {
                applyShellNavigationTarget(getHistorySessionNavigationTarget(tournament.id));
              }
            }}
          />
        );

      case 'ranking':
        return (
          <RankingModule
            players={play.players}
            games={sess.games}
            pointEvents={sess.pointEvents}
            teams={sess.teams}
            sessions={sess.sessions}
          />
        );

      case 'historico':
        return (
          <HistoryView
            sessions={sess.sessions}
            games={sess.games}
            pointEvents={sess.pointEvents}
            teams={sess.teams}
            players={play.players}
            sessionReports={sess.sessionReports}
            selectedHistorySessionId={selectedHistorySessionId}
            setSelectedHistorySessionId={setSelectedHistorySessionId}
            onDeleteSession={(sessionId) => {
              sess.deleteSession(sessionId);
              setSelectedHistorySessionId(null);
            }}
            onBackToDashboard={() => {
              applyShellNavigationTarget(getDashboardNavigationTarget());
            }}
            initialTab="sessions"
            hideTabs={false}
          />
        );

      case 'configuracoes':
        return (
          <SettingsModule
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onRestoreDemoPlayers={play.handleRestoreDemoPlayers}
          />
        );

      case 'gestao':
        return auth.isStaff ? (
          <GestaoView
            currentUserId={auth.user?.id ?? null}
            isMaster={auth.isMaster}
            players={play.players}
            onToast={toasts.push}
          />
        ) : null;

      case 'conta':
        return (
          <AccountSyncView
            user={auth.user}
            profile={auth.profile}
            loading={auth.loading}
            isSupabaseConfigured={auth.isSupabaseConfigured}
            onSignOut={auth.signOut}
            onLinkGoogleIdentity={supabaseAuthClient.linkGoogleIdentity}
            onSync={cloudSync.sync}
            onRepairDuplicates={cloudSync.repairDuplicateCloudData}
            lastSyncedAt={cloudSync.lastSyncedAt}
            syncLoading={cloudSync.syncLoading}
            players={play.players}
            recoverableSyncActions={cloudSync.recoverableSyncActions}
            syncIssueSummary={cloudSync.syncIssueSummary}
            onRetryPrimarySyncAction={cloudSync.retryPrimarySyncAction}
            onClearResolvedSyncIssues={cloudSync.clearResolvedSyncIssues}
          />
        );

      default:
        return null;
    }
  };

  // ── Sub-view Renderers ───────────────────────────────────────────────────

  const navigationIconByKey: Record<ModuleNavigationItem['icon'], ReactNode> = {
    dashboard: <LayoutDashboard className="w-5 h-5" />,
    tournament: <Trophy className="w-5 h-5" />,
    players: <Users className="w-5 h-5" />,
    ranking: <Medal className="w-5 h-5" />,
    history: <BarChart3 className="w-5 h-5" />,
    cloud: <Cloud className="w-5 h-5" />,
    settings: <Settings className="w-5 h-5" />,
    admin: <ShieldCheck className="w-5 h-5" />,
  };
  const navItems = getModuleNavigationItems({
    isStaff: auth.isStaff,
    pendingChanges,
  }).map((item) => ({
    ...item,
    icon: navigationIconByKey[item.icon],
  }));
  return (
    <div className="drawer lg:drawer-open">
      <ToastViewport toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      <input id="sidebar-drawer" type="checkbox" className="drawer-toggle" />

      <div className="drawer-content flex flex-col min-h-screen min-w-0 bg-base-100 text-base-content">
        {pendingDeliveryNotice && (
          <button
            type="button"
            onClick={() => handleNav('conta')}
            className="w-full bg-warning/20 text-warning-content text-xs font-bold px-4 py-2 text-left"
          >
            {pendingDeliveryNotice.message} Toque para ver os detalhes.
          </button>
        )}
        {/* Top Header */}
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
                {getCurrentPageTitle({ page, activeModule })}
              </h2>
              {sess.activeSession && sess.activeSession.status === 'active' && (
                <p className="text-[10px] text-base-content/60 font-medium mt-0.5">
                  Sessão Ativa:{' '}
                  <span className="text-primary font-bold">{sess.activeSession.name}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {sess.activeSession?.status === 'active' && (
              <div className="badge badge-success badge-soft gap-1.5 sm:gap-2 px-2 sm:px-3 py-3 font-black uppercase text-[9px] tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span className="hidden sm:inline">Partida em Andamento</span>
              </div>
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

        {/* Main Content Area */}
        <main className="p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeModule + '_' + page}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
            >
              <Suspense fallback={null}>{renderActiveContent()}</Suspense>
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

      {/* Drawer Sidebar */}
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
                    <button
                      onClick={() => {
                        handleNav(item.id);
                        const checkbox = document.getElementById(
                          'sidebar-drawer',
                        ) as HTMLInputElement;
                        if (checkbox) checkbox.checked = false;
                      }}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                        activeModule === item.id
                          ? 'bg-primary! text-primary-content! shadow-lg shadow-primary/20'
                          : 'text-base-content/70 hover:text-base-content hover:bg-base-300'
                      }`}
                    >
                      {item.icon}
                      <span className="flex-1 text-left">{item.label}</span>
                      {!!item.badge && item.badge > 0 && (
                        <span
                          className="badge badge-sm badge-warning font-black"
                          title={`${item.badge} alteração(ões) pendente(s) de sincronização`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Sidebar Footer */}
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
