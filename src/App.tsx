/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  LayoutDashboard,
  Activity,
  Trophy,
  Users,
  Shield,
  Medal,
  BarChart3,
  Settings,
  ShieldCheck,
  Plus,
  ArrowRight,
  Download,
  Upload,
  Search,
  UserCheck,
  Cloud,
} from 'lucide-react';

import { usePlayers } from './hooks/usePlayers';
import { useSessions } from './hooks/useSessions';
import { useSessionWizard } from './hooks/useSessionWizard';
import { useCommunities } from './hooks/useCommunities';
import { useCommunityPresence } from './hooks/useCommunityPresence';
import { useCommunityRules } from './hooks/useCommunityRules';
import { useWhatsAppListTemplates } from './hooks/useWhatsAppListTemplates';
import { useAuth } from './hooks/useAuth';
import { useCloudSync } from './hooks/useCloudSync';
import { useToasts } from './hooks/useToasts';
import { useCommunityPermissions } from './hooks/useCommunityPermissions';
import { usePlayerLinkProposals } from './hooks/usePlayerLinkProposals';

import { Dashboard } from './components/dashboard/Dashboard';
import { PlayersView } from './components/player/PlayersView';
import { PlayerEditView } from './components/player/PlayerEditView';
import { SessionWizard } from './components/session/SessionWizard';
import { SessionActiveView } from './components/live/SessionActiveView';
import { HistoryView } from './components/history/HistoryView';
import { CommunitiesView } from './components/community/CommunitiesView';
import { AccountSyncView } from './components/account/AccountSyncView';
import { GestaoView } from './components/admin/GestaoView';
import { ToastViewport } from './components/common/ToastViewport';

import { loadSessionDraft, clearSessionDraft, saveSessionDraft } from './logic/sessionDraft';
import { VutRevealModal, RevealItem } from './components/player/VutRevealModal';
import { buildVutCard } from './logic/futCards';
import { Community, CommunityRules, Game, Player, Team } from './types';
import { migrateLocalDbToUuids } from './logic/migrations';
import {
  STORAGE_KEYS,
  getLocalCacheOwnerId,
  loadFromStorage,
  saveToStorage,
} from './storage/localStorageRepository';
import { calculatePlayerStats } from './logic/statistics';
import { calculateGeneralOverall } from './logic/calculations';
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
  buildFinishedSessionResult,
  buildManualSessionDraft,
  buildSessionFromCommunity,
} from './application/sessionLifecycleUseCases';
import { prepareImportedBackup } from './application/backupUseCases';

// Execute UUID migration on startup before any state/hook initializes
migrateLocalDbToUuids();

type Page =
  | 'dashboard'
  | 'players'
  | 'player-edit'
  | 'session-wizard'
  | 'session-active'
  | 'history'
  | 'communities';
type Module =
  | 'dashboard'
  | 'torneios'
  | 'players'
  | 'ranking'
  | 'historico'
  | 'configuracoes'
  | 'conta'
  | 'gestao';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [activeModule, setActiveModule] = useState<Module>('dashboard');
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState(() => loadSessionDraft());
  const [revealQueue, setRevealQueue] = useState<RevealItem[]>([]);

  // Auth state
  const auth = useAuth();
  const toasts = useToasts();

  // Search & Filters for custom sub-views
  const [matchesSearch, setMatchesSearch] = useState('');
  const [matchesFilter, setMatchesFilter] = useState<'all' | 'active' | 'finished' | 'scheduled'>(
    'all',
  );
  const [rankingSearch, setRankingSearch] = useState('');
  const [rankingSort, setRankingSort] = useState<'overall' | 'winRate' | 'points'>('overall');

  // ── Domain hooks ──────────────────────────────────────────────────────────

  const sess = useSessions();
  const play = usePlayers(sess.games, sess.pointEvents, sess.teams);
  const comm = useCommunities();
  const communityPresence = useCommunityPresence();
  const communityRules = useCommunityRules();
  const whatsAppLists = useWhatsAppListTemplates();
  const proposals = usePlayerLinkProposals(play.rawPlayers, play.setPlayers, auth.user?.id ?? null);

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
    linkProposals: proposals.linkProposals,
    setLinkProposals: proposals.setLinkProposals,
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
      proposals.linkProposals,
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
    proposals.linkProposals,
  ]);

  // ── Auto-sync on login (download-first) ───────────────────────────────────
  // Na entrada, ADOTAMOS o estado da nuvem (fonte da verdade) baixando-o — isso
  // hidrata cloudId/filiação e CONVERGE os ids entre dispositivos. NÃO empurramos
  // o estado local na entrada: um device com localStorage desatualizado empurrava
  // comunidades duplicadas e apagava vínculos. Só baixa quando NÃO há mudanças
  // locais pendentes (senão deixamos o usuário sincronizar manualmente, para não
  // sobrescrever trabalho offline). Uma vez por usuário.
  useEffect(() => {
    if (!auth.isSupabaseConfigured) return;
    const uid = auth.user?.id ?? null;
    if (!uid) {
      autoSyncedForUser.current = null;
      return;
    }
    if (autoSyncedForUser.current === uid) return;

    const cacheOwnerId = getLocalCacheOwnerId();
    if (cacheOwnerId && cacheOwnerId !== uid) {
      autoSyncedForUser.current = uid;
      cloudSync.downloadFromCloud().catch(() => {});
      return;
    }
    if (pendingChanges > 0) return; // não baixa por cima de pendências locais
    autoSyncedForUser.current = uid;
    cloudSync.downloadFromCloud().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isSupabaseConfigured, auth.user?.id, pendingChanges]);

  // ── Backup actions ────────────────────────────────────────────────────────

  const handleExportBackup = () => {
    const data = {
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
      activeSession: sess.activeSession,
      sessionDraft: loadSessionDraft(),
      lastSelectedPlayerIds: loadFromStorage<string[] | null>(
        STORAGE_KEYS.lastSelectedPlayerIds,
        null,
      ),
      lastSessionConfig: loadFromStorage<any | null>(STORAGE_KEYS.lastSessionConfig, null),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `panelinha_backup_${new Date().toISOString().slice(0, 10)}.json`;
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

        if (data.activeSession !== undefined) {
          sess.setActiveSession(data.activeSession);
        }
        if (data.sessionDraft !== undefined) {
          if (data.sessionDraft) {
            saveSessionDraft(data.sessionDraft);
          } else {
            clearSessionDraft();
          }
          setSessionDraft(data.sessionDraft);
        }
        if (data.lastSelectedPlayerIds !== undefined) {
          if (data.lastSelectedPlayerIds) {
            saveToStorage(STORAGE_KEYS.lastSelectedPlayerIds, data.lastSelectedPlayerIds);
          } else {
            localStorage.removeItem(STORAGE_KEYS.lastSelectedPlayerIds);
          }
        }
        if (data.lastSessionConfig !== undefined) {
          if (data.lastSessionConfig) {
            saveToStorage(STORAGE_KEYS.lastSessionConfig, data.lastSessionConfig);
          } else {
            localStorage.removeItem(STORAGE_KEYS.lastSessionConfig);
          }
        }

        // Go to dashboard to reload fresh data
        setPage('dashboard');
        setActiveModule('dashboard');

        alert('Dados importados com sucesso!');
      } catch {
        alert('Erro ao importar: arquivo inválido.');
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

      const beforeCards = result.participants.map((p) => ({
        playerId: p.id,
        card: buildVutCard(p, buildCtxBefore),
      }));

      // 2. Build cards AFTER the use case applies progression, rating and report updates.

      const buildCtxAfter = {
        sessions: result.updatedSessions,
        teams: sess.teams,
        games: sess.games,
        pointEvents: sess.pointEvents,
        players: result.updatedPlayers,
        sessionReports: result.updatedReports,
      };

      const afterCards = result.participants.map((p) => {
        const updatedP = result.updatedPlayers.find((up) => up.id === p.id) || p;
        return {
          playerId: p.id,
          card: buildVutCard(updatedP, buildCtxAfter),
        };
      });

      // 3. Compare before and after cards to detect reveals
      const itemsToReveal: RevealItem[] = [];
      for (const p of result.participants) {
        const before = beforeCards.find((bc) => bc.playerId === p.id)?.card;
        const after = afterCards.find((ac) => ac.playerId === p.id)?.card;

        if (!before || !after) continue;

        const reasons: string[] = [];

        // Special card edition?
        if (after.edition.kind !== 'base') {
          reasons.push(
            `${after.edition.emoji} EDIÇÃO ESPECIAL: ${after.edition.label.toUpperCase()}`,
          );
        }

        // New achievement unlocked?
        const beforeUnlocked = new Set(
          before.achievements.filter((a) => a.unlocked).map((a) => a.id),
        );
        const afterUnlocked = after.achievements.filter((a) => a.unlocked);

        for (const ach of afterUnlocked) {
          if (!beforeUnlocked.has(ach.id)) {
            reasons.push(`🏆 CONQUISTA: ${ach.name.toUpperCase()} (${ach.emoji})`);
          }
        }

        if (reasons.length > 0) {
          itemsToReveal.push({
            card: after,
            reasons,
          });
        }
      }

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
    setActiveModule(module);
    if (module === 'dashboard') {
      if (sess.activeSession?.status === 'active') {
        setPage('session-active');
      } else {
        setPage('dashboard');
      }
    } else if (module === 'players') {
      setPage('players');
    }
  };

  const getCurrentPageTitle = () => {
    switch (activeModule) {
      case 'dashboard':
        return page === 'session-wizard' ? 'Configuração da Sessão' : 'Painel de Controle';
      case 'torneios':
        return 'Torneios & Campeonatos';
      case 'players':
        return page === 'player-edit'
          ? 'Perfil do Atleta'
          : page === 'communities'
            ? 'Grupos de Comunidade'
            : 'Cadastro de Atletas';
      case 'ranking':
        return 'Líderes & Classificações';
      case 'historico':
        return 'Histórico & Estatísticas';
      case 'configuracoes':
        return 'Configurações do Sistema';
      case 'conta':
        return 'Sincronização & Backup Nuvem';
      case 'gestao':
        return 'Gestão & Administração';
      default:
        return 'Panelinha';
    }
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
                  if (play.handleSavePlayer(playerPermissions)) setPage('session-wizard');
                } catch (err: any) {
                  if (err.message === 'PERMISSION_DENIED') {
                    toasts.push('Erro: Ação não autorizada pelo nível de permissão.', 'error');
                  }
                }
              }}
              onDelete={() => {
                try {
                  play.handleDeletePlayer(playerPermissions);
                  setPage('session-wizard');
                } catch (err: any) {
                  if (err.message === 'PERMISSION_DENIED') {
                    toasts.push('Erro: Ação não autorizada pelo nível de permissão.', 'error');
                  }
                }
              }}
              validationErrors={play.validationErrors}
              showDeleteConfirm={play.showDeleteConfirm}
              setShowDeleteConfirm={play.setShowDeleteConfirm}
              permissions={playerPermissions}
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
              sessionTeams={sess.teams.filter((t) => t.sessionId === sess.activeSession?.id)}
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
              const s = buildManualSessionDraft({
                now: new Date(),
                createId: generateUUID,
              });
              sess.setActiveSession(s);
              wizard.setWizardStep(0);
              setPage('session-wizard');
            }}
            onResumeSession={() => {
              setPage('session-active');
              setActiveModule('dashboard');
            }}
            onResumeDraft={(draft) => {
              wizard.resumeDraft(draft);
              setPage('session-wizard');
            }}
            onClearDraft={() => {
              if (window.confirm('Deseja realmente descartar o rascunho?')) {
                clearSessionDraft();
                setSessionDraft(null);
                sess.setActiveSession(null);
              }
            }}
            onClearActiveSession={() => {
              if (
                sess.activeSession &&
                window.confirm(
                  'Deseja realmente descartar a sessão ativa? Todo o progresso e jogos gerados serão perdidos permanentemente.',
                )
              ) {
                const sessionId = sess.activeSession.id;
                sess.deleteSession(sessionId);
                sess.setActiveSession(null);
                clearSessionDraft();
                setSessionDraft(null);
              }
            }}
            onPlayers={() => {
              setPage('players');
              setActiveModule('players');
            }}
            onHistory={() => {
              setActiveModule('historico');
            }}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onCommunities={() => {
              setPage('communities');
              setActiveModule('players');
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
                  if (play.handleSavePlayer(playerPermissions)) setPage('players');
                } catch (err: any) {
                  if (err.message === 'PERMISSION_DENIED') {
                    toasts.push('Erro: Ação não autorizada pelo nível de permissão.', 'error');
                  }
                }
              }}
              onDelete={() => {
                try {
                  play.handleDeletePlayer(playerPermissions);
                  setPage('players');
                } catch (err: any) {
                  if (err.message === 'PERMISSION_DENIED') {
                    toasts.push('Erro: Ação não autorizada pelo nível de permissão.', 'error');
                  }
                }
              }}
              validationErrors={play.validationErrors}
              showDeleteConfirm={play.showDeleteConfirm}
              setShowDeleteConfirm={play.setShowDeleteConfirm}
              permissions={playerPermissions}
              currentUserId={auth.user?.id ?? null}
              linkProposals={proposals.linkProposals}
              onProposeLink={proposals.handleProposePlayerLink}
              onReviewLink={proposals.handleReviewPlayerLink}
              onCancelLink={proposals.handleCancelPlayerLink}
              onUnlinkPlayer={proposals.handleUnlinkPlayer}
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
                setSelectedHistorySessionId(sessionId);
                setActiveModule('historico');
              }}
              onClearCommunityHistory={(communityId) => {
                sess.setSessions((prev) => applyCommunityHistoryClear(prev, communityId));
              }}
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
              setPage('dashboard');
              setActiveModule('dashboard');
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
        return renderTournamentsModule();

      case 'ranking':
        return renderRankingModule();

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
              setPage('dashboard');
              setActiveModule('dashboard');
            }}
            initialTab="sessions"
            hideTabs={false}
          />
        );

      case 'configuracoes':
        return renderSettingsModule();

      case 'gestao':
        return auth.isStaff ? (
          <GestaoView
            currentUserId={auth.user?.id ?? null}
            isMaster={auth.isMaster}
            players={play.players}
            linkProposals={proposals.linkProposals}
            onReviewLink={proposals.handleReviewPlayerLink}
            onRefreshLinkProposals={proposals.handleRefreshPlayerLinkProposals}
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
            onSignIn={auth.signIn}
            onSignUp={auth.signUp}
            onSignOut={auth.signOut}
            onSync={cloudSync.sync}
            onRepairDuplicates={cloudSync.repairDuplicateCloudData}
            lastSyncedAt={cloudSync.lastSyncedAt}
            syncLoading={cloudSync.syncLoading}
            players={play.players}
            linkProposals={proposals.linkProposals}
            onProposeLink={proposals.handleProposePlayerLink}
            onCancelLink={proposals.handleCancelPlayerLink}
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

  const renderTournamentsModule = () => {
    const tournaments = sess.sessions.filter((s) => s.type === 'tournament');
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-border">
          <span className="text-xs font-bold text-text-muted uppercase">Torneios Registrados</span>
          <button
            onClick={() => {
              const s = buildManualSessionDraft({
                type: 'tournament',
                now: new Date(),
                createId: generateUUID,
              });
              sess.setActiveSession(s);
              wizard.setWizardStep(0);
              setPage('session-wizard');
              setActiveModule('dashboard');
            }}
            className="btn btn-primary rounded-full uppercase tracking-wider text-xs"
          >
            <Plus className="w-4 h-4" /> Novo Torneio
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((t) => {
            const tGames = sess.games.filter(
              (g) => g.sessionId === t.id && g.status === 'finished',
            );
            const finishedGames = tGames.length;
            const winnerId =
              t.status === 'finished'
                ? sess.sessionReports.find((r) => r.sessionId === t.id)?.teamStandings?.[0]?.teamId
                : null;
            const winnerName = winnerId
              ? (sess.teams.find((team) => team.id === winnerId)?.name ?? '—')
              : '—';

            return (
              <div
                key={t.id}
                className="card card-border bg-base-200 p-6 rounded-2xl flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary uppercase">
                      Torneio
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        t.status === 'active'
                          ? 'bg-success-muted text-success'
                          : t.status === 'finished'
                            ? 'bg-primary/15 text-primary'
                            : t.status === 'teams_generated'
                              ? 'bg-success/15 text-success'
                              : 'bg-surface-strong text-text-muted'
                      }`}
                    >
                      {t.status === 'active'
                        ? 'Ativo'
                        : t.status === 'finished'
                          ? 'Finalizado'
                          : t.status === 'teams_generated'
                            ? 'Pronto'
                            : 'Rascunho'}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg text-base-content uppercase mt-3 tracking-tight">
                    {t.name}
                  </h3>
                  <p className="text-[10px] text-text-subtle font-mono uppercase mt-1">
                    Data: {new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <div className="bg-surface-muted p-3.5 rounded-xl border border-border space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-muted">Partidas Realizadas:</span>
                    <span className="font-bold font-mono text-base-content">{finishedGames}</span>
                  </div>
                  {t.status === 'finished' && (
                    <div className="flex justify-between items-center text-xs border-t border-border pt-2 mt-2">
                      <span className="text-text-muted flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-accent" /> Campeão:
                      </span>
                      <span className="font-black text-accent uppercase">{winnerName}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (t.status === 'active' || t.status === 'teams_generated') {
                      sess.setActiveSession(t);
                      setPage('session-active');
                      setActiveModule('dashboard');
                    } else {
                      setSelectedHistorySessionId(t.id);
                      setActiveModule('historico');
                    }
                  }}
                  className="btn btn-secondary rounded-full w-full uppercase tracking-wider text-xs"
                >
                  Ver Detalhes
                </button>
              </div>
            );
          })}
          {tournaments.length === 0 && (
            <div className="col-span-full py-20 card card-border border-dashed bg-base-200 text-center">
              <p className="text-base-content/60 uppercase text-xs font-bold italic">
                Nenhum torneio cadastrado.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRankingModule = () => {
    // Generate Overall Rankings of all players
    const rankedPlayers = play.players
      .map((player) => {
        const stats = calculatePlayerStats(
          player,
          sess.games,
          sess.pointEvents,
          sess.teams,
          sess.sessions,
        );
        const overall = calculateGeneralOverall(player);
        return {
          player,
          stats,
          overall,
        };
      })
      .filter((p) => p.player.ativo);

    const searchedRankings = rankedPlayers.filter((p) => {
      return (
        p.player.nome.toLowerCase().includes(rankingSearch.toLowerCase()) ||
        (p.player.apelido ?? '').toLowerCase().includes(rankingSearch.toLowerCase())
      );
    });

    const sortedRankings = searchedRankings.sort((a, b) => {
      if (rankingSort === 'winRate') return b.stats.winRate - a.stats.winRate;
      if (rankingSort === 'points') return b.stats.totalPoints - a.stats.totalPoints;
      return b.overall - a.overall;
    });

    const positionLabels: Record<string, string> = {
      levantador: 'Levantador',
      oposto: 'Oposto',
      ponteiro: 'Ponteiro',
      central: 'Central',
      libero: 'Líbero',
      'all-rounder': 'Coringa',
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-surface p-4 rounded-xl border border-border">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle" />
            <input
              type="text"
              placeholder="Buscar por jogador..."
              value={rankingSearch}
              onChange={(e) => setRankingSearch(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {(['overall', 'winRate', 'points'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setRankingSort(s)}
                className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold uppercase rounded-lg border transition-all ${
                  rankingSort === s
                    ? 'bg-primary border-primary text-primary-content'
                    : 'bg-surface-muted border-border text-text-muted hover:text-base-content'
                }`}
              >
                {s === 'overall' ? 'Rating' : s === 'winRate' ? '% Vitória' : 'Pontos'}
              </button>
            ))}
          </div>
        </div>

        {/* ─── MOBILE: Card-based ranking ─── */}
        <div className="lg:hidden space-y-2.5">
          {sortedRankings.map((p, index) => {
            const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
            return (
              <div
                key={p.player.id}
                className={`bg-base-200 border rounded-xl p-3.5 ${
                  index < 3 ? 'border-accent/30' : 'border-base-300'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm font-black font-mono text-base-content/60 w-7 shrink-0 text-center">
                      {rankEmoji || `#${index + 1}`}
                    </span>
                    <div className="min-w-0">
                      <span className="font-bold text-sm text-base-content truncate block">
                        {p.player.apelido || p.player.nome}
                      </span>
                      <span className="text-[10px] font-semibold text-base-content/50 uppercase">
                        {positionLabels[p.player.posicaoPrincipal] || p.player.posicaoPrincipal}
                        {p.player.status.lesionado && (
                          <span className="ml-1.5 px-1 py-0.5 bg-error/15 text-error text-[8px] rounded uppercase font-bold">
                            Lesionado
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono font-black text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded text-sm shrink-0">
                    {p.overall}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-base-300/50 rounded-lg p-1.5">
                    <span className="text-[8px] font-bold text-base-content/40 uppercase block">
                      Jogos
                    </span>
                    <span className="text-xs font-black font-mono text-base-content/80">
                      {p.stats.gamesPlayed}
                    </span>
                  </div>
                  <div className="bg-base-300/50 rounded-lg p-1.5">
                    <span className="text-[8px] font-bold text-base-content/40 uppercase block">
                      Win%
                    </span>
                    <span className="text-xs font-black font-mono text-success">
                      {p.stats.winRate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="bg-base-300/50 rounded-lg p-1.5">
                    <span className="text-[8px] font-bold text-base-content/40 uppercase block">
                      Pontos
                    </span>
                    <span className="text-xs font-black font-mono text-accent">
                      {p.stats.totalPoints}
                    </span>
                  </div>
                  <div className="bg-base-300/50 rounded-lg p-1.5">
                    <span className="text-[8px] font-bold text-base-content/40 uppercase block">
                      Bloq
                    </span>
                    <span className="text-xs font-black font-mono text-base-content/70">
                      {p.stats.blocks}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {sortedRankings.length === 0 && (
            <div className="py-16 text-center card bg-base-200 border border-base-300 border-dashed">
              <p className="text-base-content/50 uppercase text-xs font-bold italic">
                Nenhum atleta encontrado.
              </p>
            </div>
          )}
        </div>

        {/* ─── DESKTOP: Original table ─── */}
        <div className="hidden lg:block card card-border bg-base-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-zebra table-sm w-full text-xs text-left">
              <thead>
                <tr className="border-b border-base-300 font-bold text-base-content/60">
                  <th className="p-4 w-16">Rank</th>
                  <th className="p-4">Atleta</th>
                  <th className="p-4">Posição</th>
                  <th className="p-4 text-center">Jogos</th>
                  <th className="p-4 text-center">Vitórias</th>
                  <th className="p-4 text-center">% Vitórias</th>
                  <th className="p-4 text-center">Aces</th>
                  <th className="p-4 text-center">Bloqueios</th>
                  <th className="p-4 text-center">Pontos Totais</th>
                  <th className="p-4 text-center">Rating</th>
                </tr>
              </thead>
              <tbody>
                {sortedRankings.map((p, index) => (
                  <tr key={p.player.id}>
                    <td className="p-4 font-mono font-black text-base-content/70 text-sm">
                      {index + 1 === 1
                        ? '🥇'
                        : index + 1 === 2
                          ? '🥈'
                          : index + 1 === 3
                            ? '🥉'
                            : `#${index + 1}`}
                    </td>
                    <td className="p-4 font-bold text-base-content">
                      {p.player.apelido || p.player.nome}
                      {p.player.status.lesionado && (
                        <span className="ml-2 px-1.5 py-0.5 bg-error/15 text-error text-[8px] rounded uppercase font-bold">
                          Lesionado
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-semibold text-base-content/60 uppercase text-[10px]">
                      {positionLabels[p.player.posicaoPrincipal] || p.player.posicaoPrincipal}
                    </td>
                    <td className="p-4 text-center font-mono font-bold text-base-content/70">
                      {p.stats.gamesPlayed}
                    </td>
                    <td className="p-4 text-center font-mono font-bold text-success">
                      {p.stats.wins}
                    </td>
                    <td className="p-4 text-center font-mono font-bold text-base-content">
                      {p.stats.winRate.toFixed(1)}%
                    </td>
                    <td className="p-4 text-center font-mono text-base-content/60">
                      {p.stats.aces}
                    </td>
                    <td className="p-4 text-center font-mono text-base-content/60">
                      {p.stats.blocks}
                    </td>
                    <td className="p-4 text-center font-mono font-black text-accent text-sm">
                      {p.stats.totalPoints}
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-mono font-black text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded text-xs">
                        {p.overall}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderSettingsModule = () => {
    return (
      <div className="space-y-6">
        <div className="card card-border bg-base-200 p-6 rounded-2xl">
          <h3 className="text-base font-bold uppercase text-base-content tracking-wider mb-4">
            Dados & Backup
          </h3>
          <p className="text-xs text-text-muted leading-relaxed mb-6">
            Exporte ou importe a base de dados de atletas, partidas, sessões e históricos para
            compartilhar ou salvar como backup.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleExportBackup}
              className="flex items-center justify-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-xl text-xs font-bold uppercase text-primary hover:bg-primary/20 transition-all cursor-pointer"
            >
              <Download className="w-5 h-5" /> Exportar Backup (JSON)
            </button>

            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportBackup(file);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="flex items-center justify-center gap-3 p-4 bg-surface-strong border border-border rounded-xl text-xs font-bold uppercase text-base-content hover:bg-surface-strong/80 transition-all">
                <Upload className="w-5 h-5 text-accent" /> Importar Backup (JSON)
              </div>
            </div>
          </div>
        </div>

        <div className="card card-border border-border bg-surface-strong/40 p-6 rounded-2xl">
          <h3 className="text-base font-bold uppercase text-base-content tracking-wider mb-4">
            Dados de Exemplo
          </h3>
          <p className="text-xs text-text-muted leading-relaxed mb-6">
            Carregue o elenco original de atletas de exemplo. Esta ação é aditiva e preserva seus
            dados atuais. (A redefinição completa do banco foi removida do aplicativo — use o painel
            do Supabase, se necessário.)
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => {
                if (
                  confirm(
                    'Deseja carregar a lista de atletas de exemplo? Isto preservará seus dados atuais, mas adicionará novos atletas se não existirem.',
                  )
                ) {
                  play.handleRestoreDemoPlayers();
                  alert('Atletas de exemplo restaurados!');
                }
              }}
              className="btn btn-secondary rounded-full uppercase tracking-wider text-xs"
            >
              <UserCheck className="w-4 h-4" /> Restaurar Atletas de Exemplo
            </button>
          </div>
        </div>
      </div>
    );
  };

  const navItems: Array<{ id: Module; label: string; icon: ReactNode; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'torneios', label: 'Torneios', icon: <Trophy className="w-5 h-5" /> },
    { id: 'players', label: 'Jogadores', icon: <Users className="w-5 h-5" /> },
    { id: 'ranking', label: 'Ranking', icon: <Medal className="w-5 h-5" /> },
    { id: 'historico', label: 'Histórico', icon: <BarChart3 className="w-5 h-5" /> },
    {
      id: 'conta',
      label: 'Nuvem & Conta',
      icon: <Cloud className="w-5 h-5" />,
      badge: pendingChanges,
    },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings className="w-5 h-5" /> },
    ...(auth.isStaff
      ? [{ id: 'gestao' as Module, label: 'Gestão', icon: <ShieldCheck className="w-5 h-5" /> }]
      : []),
  ];

  return (
    <div className="drawer lg:drawer-open">
      <ToastViewport toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      <input id="sidebar-drawer" type="checkbox" className="drawer-toggle" />

      <div className="drawer-content flex flex-col min-h-screen min-w-0 bg-base-100 text-base-content">
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
                {getCurrentPageTitle()}
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
                {auth.profile?.name || auth.user?.email?.split('@')[0] || 'Administrador'}
              </span>
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black uppercase text-xs">
                {auth.profile?.name
                  ? auth.profile.name.slice(0, 2).toUpperCase()
                  : auth.user?.email
                    ? auth.user.email.slice(0, 2).toUpperCase()
                    : 'AD'}
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
              {renderActiveContent()}
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
              {auth.profile?.name
                ? auth.profile.name.slice(0, 2).toUpperCase()
                : auth.user?.email
                  ? auth.user.email.slice(0, 2).toUpperCase()
                  : 'PL'}
            </div>
            <div>
              <p className="text-xs font-bold text-base-content uppercase leading-none">
                {auth.profile?.name || auth.user?.email?.split('@')[0] || 'Panelinha'}
              </p>
              <span className="text-[9px] text-base-content/40 uppercase">v1.0.0</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
