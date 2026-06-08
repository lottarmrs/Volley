/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
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
  Plus, 
  ArrowRight,
  Download,
  Upload,
  RefreshCw,
  Search,
  UserCheck,
  Cloud
} from 'lucide-react';

import { usePlayers }       from './hooks/usePlayers';
import { useSessions }      from './hooks/useSessions';
import { useSessionWizard } from './hooks/useSessionWizard';
import { useCommunities }   from './hooks/useCommunities';
import { useCommunityPresence } from './hooks/useCommunityPresence';
import { useCommunityRules } from './hooks/useCommunityRules';
import { useWhatsAppListTemplates } from './hooks/useWhatsAppListTemplates';
import { useAuth } from './hooks/useAuth';

import { Dashboard }         from './components/dashboard/Dashboard';
import { PlayersView }       from './components/player/PlayersView';
import { PlayerEditView }    from './components/player/PlayerEditView';
import { SessionWizard }     from './components/session/SessionWizard';
import { SessionActiveView } from './components/live/SessionActiveView';
import { HistoryView }       from './components/history/HistoryView';
import { CommunitiesView }   from './components/community/CommunitiesView';
import { AccountSyncView }   from './components/account/AccountSyncView';

import { syncService } from './services/supabase/syncService';
import { loadSessionDraft, clearSessionDraft, saveSessionDraft } from './logic/sessionDraft';
import { generateSessionReport } from './logic/reports';
import { Community, CommunityRules, FreePlayConfig, Game, Player, Session, Team, TournamentConfig } from './types';
import { normalizeCommunities, normalizeGames, normalizeSessions } from './logic/migrations';
import { STORAGE_KEYS, saveToStorage, loadFromStorage } from './storage/localStorageRepository';
import { calculatePlayerStats } from './logic/statistics';
import { calculateGeneralOverall } from './logic/calculations';

type Page = 'dashboard' | 'players' | 'player-edit' | 'session-wizard' | 'session-active' | 'history' | 'communities';
type Module = 'dashboard' | 'torneios' | 'players' | 'ranking' | 'historico' | 'configuracoes' | 'conta';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [activeModule, setActiveModule] = useState<Module>('dashboard');
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState(() => loadSessionDraft());
  
  // Auth state
  const auth = useAuth();
  const [syncLoading, setSyncLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => 
    loadFromStorage<string | null>('vpg_last_synced_at', null)
  );

  // Search & Filters for custom sub-views
  const [matchesSearch, setMatchesSearch] = useState('');
  const [matchesFilter, setMatchesFilter] = useState<'all' | 'active' | 'finished' | 'scheduled'>('all');
  const [rankingSearch, setRankingSearch] = useState('');
  const [rankingSort, setRankingSort] = useState<'overall' | 'winRate' | 'points'>('overall');

  // ── Domain hooks ──────────────────────────────────────────────────────────

  const sess = useSessions();
  const play = usePlayers(sess.games, sess.pointEvents, sess.teams);
  const comm = useCommunities();
  const communityPresence = useCommunityPresence();
  const communityRules = useCommunityRules();
  const whatsAppLists = useWhatsAppListTemplates();

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
      lastSelectedPlayerIds: loadFromStorage<string[] | null>(STORAGE_KEYS.lastSelectedPlayerIds, null),
      lastSessionConfig: loadFromStorage<any | null>(STORAGE_KEYS.lastSessionConfig, null)
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
        const data = JSON.parse(e.target?.result as string);
        if (data.players)        play.setPlayers(data.players);
        if (data.sessions)       sess.setSessions(normalizeSessions(data.sessions));
        if (data.teams)          sess.setTeams(data.teams);
        if (data.games)          sess.setGames(normalizeGames(data.games));
        if (data.pointEvents)    sess.setPointEvents(data.pointEvents);
        if (data.gameReports)    sess.setGameReports(data.gameReports);
        if (data.sessionReports) sess.setSessionReports(data.sessionReports);
        if (data.communities)    comm.setCommunities(normalizeCommunities(data.communities));
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

  const handleUploadToCloud = async () => {
    if (!auth.user) throw new Error('Usuário não autenticado.');
    setSyncLoading(true);
    try {
      const result = await syncService.uploadLocalDataToCloud({
        communities: comm.rawCommunities,
        players: play.rawPlayers,
        rules: communityRules.rawRules,
        templates: whatsAppLists.rawTemplates
      }, auth.user.id);
      
      comm.setCommunities(result.communities);
      play.setPlayers(result.players);
      communityRules.setRules(result.rules);
      whatsAppLists.setTemplates(result.templates);
      
      const nowStr = new Date().toISOString();
      setLastSyncedAt(nowStr);
      saveToStorage('vpg_last_synced_at', nowStr);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDownloadFromCloud = async () => {
    if (!auth.user) throw new Error('Usuário não autenticado.');
    setSyncLoading(true);
    try {
      const result = await syncService.downloadCloudDataToLocal();
      comm.setCommunities(result.communities);
      play.setPlayers(result.players);
      communityRules.setRules(result.rules);
      whatsAppLists.setTemplates(result.templates);
      
      const nowStr = new Date().toISOString();
      setLastSyncedAt(nowStr);
      saveToStorage('vpg_last_synced_at', nowStr);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSync = async () => {
    if (!auth.user) throw new Error('Usuário não autenticado.');
    setSyncLoading(true);
    try {
      const result = await syncService.syncNow({
        communities: comm.rawCommunities,
        players: play.rawPlayers,
        rules: communityRules.rawRules,
        templates: whatsAppLists.rawTemplates
      }, auth.user.id);
      
      comm.setCommunities(result.communities);
      play.setPlayers(result.players);
      communityRules.setRules(result.rules);
      whatsAppLists.setTemplates(result.templates);
      
      const nowStr = new Date().toISOString();
      setLastSyncedAt(nowStr);
      saveToStorage('vpg_last_synced_at', nowStr);
    } finally {
      setSyncLoading(false);
    }
  };

  const wizard = useSessionWizard({
    players: play.players,
    activeSession: sess.activeSession,
    setActiveSession: sess.setActiveSession,
    setSessions: sess.setSessions,
    setTeams: sess.setTeams,
    setGames: sess.setGames,
    setPage,
  });

  const buildFreePlayConfig = (rules: CommunityRules): FreePlayConfig => {
    const teamCount = Math.max(3, rules.freePlay?.teamCount ?? 3);
    return {
      type: 'free_play',
      teamCount,
      maxPoints: rules.freePlay?.maxPoints ?? 15,
      tieBreakMethod: rules.freePlay?.tieBreakMethod ?? 'win_by_2',
      hardPointCap: rules.freePlay?.hardPointCap ?? null,
      rotationSystem: rules.freePlay?.rotationSystem ?? 'winner_stays',
      maxConsecutiveGames: rules.freePlay?.maxConsecutiveGames ?? 3,
      initialCourtTeams: ['', ''],
      initialQueue: [],
      queuePolicy: 'fifo',
      balanceMode: rules.freePlay?.balanceMode ?? 'balanced',
      balanceSpeed: rules.freePlay?.balanceSpeed ?? 'advanced',
      balanceConstraints: rules.freePlay?.balanceConstraints,
    };
  };

  const buildTournamentConfig = (rules: CommunityRules): TournamentConfig => ({
    type: 'tournament',
    format: rules.tournament?.format ?? 'round_robin',
    teamCount: Math.max(2, rules.tournament?.teamCount ?? 3),
    useGroupStage: rules.tournament?.useGroupStage ?? false,
    groups: rules.tournament?.groups,
    qualifiedPerGroup: rules.tournament?.qualifiedPerGroup,
    roundTrip: rules.tournament?.roundTrip ?? false,
    maxPoints: rules.tournament?.maxPoints ?? 15,
    tieBreakMethod: rules.tournament?.tieBreakMethod ?? 'direct_3',
    victoryRule: rules.tournament?.victoryRule ?? rules.tournament?.tieBreakMethod ?? 'direct_3',
    hardPointCap: rules.tournament?.hardPointCap ?? null,
    hasFinal: rules.tournament?.hasFinal ?? true,
    hasThirdPlaceMatch: rules.tournament?.hasThirdPlaceMatch ?? true,
    classificationPoints: {
      win: rules.tournament?.classificationPoints?.win ?? 3,
      loss: rules.tournament?.classificationPoints?.loss ?? 0,
      walkoverWin: rules.tournament?.classificationPoints?.walkoverWin ?? 3,
      walkoverLoss: rules.tournament?.classificationPoints?.walkoverLoss ?? 0,
    },
    standingsRules: rules.tournament?.standingsRules ?? ['classificationPoints', 'wins', 'pointDifference', 'pointsFor', 'headToHead', 'pointsAgainst'],
    balanceMode: rules.tournament?.balanceMode ?? 'balanced',
    balanceSpeed: rules.tournament?.balanceSpeed ?? 'advanced',
    balanceConstraints: rules.tournament?.balanceConstraints,
  });

  const createSessionFromCommunity = (community: Community, playerIds: string[], rules: CommunityRules) => {
    const now = new Date();
    const type = rules.defaultFormat || community.defaultFormat || 'free_play';
    const selectedPlayerIds = Array.from(new Set(playerIds)).filter(Boolean);
    const config = type === 'tournament'
      ? buildTournamentConfig(rules)
      : buildFreePlayConfig(rules);
    const s: Session = {
      id: `sessao-${Date.now()}`,
      communityId: community.id,
      name: `${community.name} - ${now.toLocaleDateString('pt-BR')}`,
      date: now.toISOString().split('T')[0],
      location: rules.defaultLocation || community.defaultLocation || null,
      notes: rules.notes || null,
      status: 'draft',
      type,
      selectedPlayerIds,
      teamIds: [],
      config,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    sess.setActiveSession(s);
    wizard.setWizardStep(selectedPlayerIds.length > 0 ? 2 : 0);
    setPage('session-wizard');
    setActiveModule('dashboard');
  };

  const createPlayerForCommunity = (name: string, communityId: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const player: Player = {
      id: `player-${Date.now()}`,
      nome: trimmed,
      apelido: trimmed,
      genero: 'M',
      ativo: true,
      posicaoPrincipal: 'ponteiro',
      posicoesSecundarias: [],
      maoDominante: 'direita',
      atributos: {
        saque: 5, recepcao: 5, levantamento: 5, ataque: 5, bloqueio: 5,
        defesa: 5, velocidade: 5, resistencia: 5, leituraDeJogo: 5,
        regularidade: 5, controleEmocional: 5
      },
      perfil: { nivel: 1, classe: 'Atleta', arquetipo: 'Versatil', especialidade: 'Em avaliacao', fraqueza: 'Nao informado' },
      formaAtual: { valor: 0, observacao: 'Em avaliacao', ultimasPartidas: [] },
      status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
      metadata: { criadoEm: now, atualizadoEm: now },
      communityIds: [communityId],
    };
    play.setPlayers(prev => [...prev, player]);
  };

  // Sync draft state
  useEffect(() => {
    setSessionDraft(loadSessionDraft());
  }, [wizard.wizardStep, sess.activeSession]);

  // ── Reset all (needs both play + sess) ────────────────────────────────────

  const handleResetAllData = () => {
    if (!window.confirm(
      'Tem certeza que deseja resetar TUDO?\n\n' +
      'Apagará atletas, sessões, times, jogos, pontos e relatórios.\n\n' +
      'Essa ação não pode ser desfeita.'
    )) return;

    play.setPlayers([]);
    sess.setSessions([]);
    sess.setTeams([]);
    sess.setGames([]);
    sess.setPointEvents([]);
    sess.setGameReports([]);
    sess.setSessionReports([]);
    sess.setActiveSession(null);
    play.setEditingPlayer(null);
    comm.setCommunities([]);
    comm.setEditingCommunity(null);
    communityPresence.setPresenceRecords([]);
    whatsAppLists.setTemplates([]);
    whatsAppLists.setDrafts([]);
    communityRules.setRules([]);
    setSelectedHistorySessionId(null);
    setPage('dashboard');
    setActiveModule('dashboard');

    // Clear all localStorage
    const KEYS = [
      'vpg_players','vpg_sessions','vpg_active_session','vpg_teams','vpg_games',
      'vpg_points','vpg_game_reports','vpg_session_reports','vpg_best_divisions',
      'vpg_selected_division_index','vpg_session_draft','vpg_last_selected_player_ids',
      'vpg_last_session_config','vpg_communities','vpg_community_presence',
      'vpg_whatsapp_list_templates','vpg_whatsapp_list_drafts','vpg_community_rules'
    ];
    KEYS.forEach(k => localStorage.removeItem(k));
    localStorage.setItem('vpg_players', JSON.stringify([]));
  };

  // ── Finish session ────────────────────────────────────────────────────────

  const handleFinishSession = () => {
    if (!sess.activeSession) return;
    if (!window.confirm('Deseja realmente encerrar a sessão atual?')) return;

    const finished: Session = { ...sess.activeSession, status: 'finished', updatedAt: new Date().toISOString() };
    const report = generateSessionReport(
      finished,
      sess.games.filter(g => g.sessionId === sess.activeSession!.id),
      sess.pointEvents.filter(p => p.sessionId === sess.activeSession!.id),
      sess.teams.filter(t => t.sessionId === sess.activeSession!.id),
      play.players
    );
    sess.setSessionReports(prev => [...prev, report]);
    sess.setSessions(prev => prev.map(s => s.id === finished.id ? finished : s));
    sess.setActiveSession(null);
    setPage('dashboard');
    setActiveModule('dashboard');
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
        return page === 'player-edit' ? 'Perfil do Atleta' : page === 'communities' ? 'Grupos de Comunidade' : 'Cadastro de Atletas';
      case 'ranking':
        return 'Líderes & Classificações';
      case 'historico':
        return 'Histórico & Estatísticas';
      case 'configuracoes':
        return 'Configurações do Sistema';
      case 'conta':
        return 'Sincronização & Backup Nuvem';
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
              onNext={() => { if (wizard.validateCurrentStep()) wizard.nextStep(); }}
              onPrev={wizard.prevStep}
              onCancel={wizard.cancelWizard}
              onUpdateSession={wizard.updateSession}
              onTogglePlayer={wizard.togglePlayer}
              onSelectAllActive={wizard.selectAllActivePlayers}
              onClearSelection={wizard.clearSelectedPlayers}
              onUseLastSelection={wizard.useLastSelection}
              onGenerateDivisions={wizard.generateDivisions}
              onConfirmDivision={wizard.confirmDivision}
              onStartGeneratedTournament={wizard.startGeneratedTournament}
              setSelectedDivisionIndex={wizard.setSelectedDivisionIndex}
              togglePlayerLock={wizard.togglePlayerLock}
              addPairConstraint={wizard.addPairConstraint}
              removePairConstraint={wizard.removePairConstraint}
              onAddGuestPlayer={(newPlayer, editDetails) => {
                play.setPlayers(prev => [...prev, newPlayer]);
                if (sess.activeSession) {
                  const nextSelected = [...sess.activeSession.selectedPlayerIds, newPlayer.id];
                  wizard.updateSession({ selectedPlayerIds: nextSelected });
                }
                if (editDetails) {
                  play.setEditingPlayer(newPlayer);
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
              onSave={() => { if (play.handleSavePlayer()) setPage('session-wizard'); }}
              onDelete={() => { play.handleDeletePlayer(); setPage('session-wizard'); }}
              validationErrors={play.validationErrors}
              showDeleteConfirm={play.showDeleteConfirm}
              setShowDeleteConfirm={play.setShowDeleteConfirm}
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
              sessionTeams={sess.teams.filter(t => t.sessionId === sess.activeSession?.id)}
              gameReports={sess.gameReports}
              setGameReports={sess.setGameReports}
              setActiveSession={sess.updateActiveSession}
              onExit={() => { setPage('dashboard'); setActiveModule('dashboard'); }}
              onFinishSession={handleFinishSession}
            />
          );
        }
        return (
          <Dashboard
            activeSession={sess.activeSession}
            sessionDraft={sessionDraft}
            onNewSession={() => {
              const s: Session = {
                id: `sessao-${Date.now()}`,
                name: `Sessão — ${new Date().toLocaleDateString('pt-BR')}`,
                date: new Date().toISOString().split('T')[0],
                status: 'draft',
                selectedPlayerIds: [],
                teamIds: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              sess.setActiveSession(s);
              wizard.setWizardStep(0);
              setPage('session-wizard');
            }}
            onResumeSession={() => { setPage('session-active'); setActiveModule('dashboard'); }}
            onResumeDraft={(draft) => { wizard.resumeDraft(draft); setPage('session-wizard'); }}
            onClearDraft={() => {
              if (window.confirm('Deseja realmente descartar o rascunho?')) {
                clearSessionDraft();
                setSessionDraft(null);
                sess.setActiveSession(null);
              }
            }}
            onClearActiveSession={() => {
              if (sess.activeSession && window.confirm('Deseja realmente descartar a sessão ativa? Todo o progresso e jogos gerados serão perdidos permanentemente.')) {
                const sessionId = sess.activeSession.id;
                const keepSession = (id: string | undefined | null) => !!id && id !== sessionId;
                sess.setSessions(prev => prev.filter(s => s.id !== sessionId));
                sess.setGames(prev => prev.filter(g => keepSession(g.sessionId)));
                sess.setPointEvents(prev => prev.filter(p => keepSession(p.sessionId)));
                sess.setTeams(prev => prev.filter(t => keepSession(t.sessionId)));
                sess.setGameReports(prev => prev.filter(r => keepSession(r.sessionId)));
                sess.setSessionReports(prev => prev.filter(r => keepSession(r.sessionId)));
                sess.setActiveSession(null);
                clearSessionDraft();
                setSessionDraft(null);
              }
            }}
            onPlayers={() => { setPage('players'); setActiveModule('players'); }}
            onHistory={() => { setActiveModule('historico'); }}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onCommunities={() => { setPage('communities'); setActiveModule('players'); }}
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
              onSave={() => { if (play.handleSavePlayer()) setPage('players'); }}
              onDelete={() => { play.handleDeletePlayer(); setPage('players'); }}
              validationErrors={play.validationErrors}
              showDeleteConfirm={play.showDeleteConfirm}
              setShowDeleteConfirm={play.setShowDeleteConfirm}
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
                if (!window.confirm('Excluir esta comunidade? Os atletas continuarao cadastrados.')) return;
                comm.setCommunities(prev => prev.filter(community => community.id !== communityId));
                play.setPlayers(prev => prev.map(p => ({
                  ...p,
                  communityIds: (p.communityIds ?? []).filter(id => id !== communityId)
                })));
                communityRules.removeRules(communityId);
                communityPresence.setPresenceRecords(prev => prev.filter(record => record.communityId !== communityId));
                whatsAppLists.setTemplates(prev => prev.filter(template => template.communityId !== communityId));
                whatsAppLists.setDrafts(prev => prev.filter(draft => draft.communityId !== communityId));
              }}
              onDuplicateCommunity={(communityId, includeAthletes) => {
                const result = comm.duplicateCommunity(communityId, includeAthletes);
                if (result?.includeAthletes) {
                  const sourcePlayers = play.players.filter(player => (player.communityIds ?? []).includes(communityId));
                  play.setPlayers(prev => prev.map(player => sourcePlayers.some(source => source.id === player.id)
                    ? { ...player, communityIds: [...(player.communityIds ?? []), result.duplicate.id] }
                    : player
                  ));
                }
              }}
              onUpdatePlayerCommunities={(communityId, memberPlayerIds) => {
                play.setPlayers(prev => prev.map(p => {
                  const currentIds = p.communityIds ?? [];
                  const isMember = memberPlayerIds.includes(p.id);
                  const exists = currentIds.includes(communityId);
                  if (isMember && !exists) return { ...p, communityIds: [...currentIds, communityId] };
                  if (!isMember && exists) return { ...p, communityIds: currentIds.filter(id => id !== communityId) };
                  return p;
                }));
              }}
              onCreatePlayer={createPlayerForCommunity}
              onCreateSession={createSessionFromCommunity}
              onViewSession={(sessionId) => {
                setSelectedHistorySessionId(sessionId);
                setActiveModule('historico');
              }}
              onClearCommunityHistory={(communityId) => {
                sess.setSessions(prev => prev.map(session => session.communityId === communityId ? { ...session, communityId: null } : session));
              }}
            />
          );
        }
        return (
          <PlayersView
            players={play.players}
            communities={comm.communities}
            onBack={() => { setPage('dashboard'); setActiveModule('dashboard'); }}
            onAddPlayer={() => { play.handleAddPlayer(); setPage('player-edit'); }}
            onEditPlayer={(p) => { play.handleEditPlayer(p); setPage('player-edit'); }}
            onResetAllData={handleResetAllData}
            onRestoreDemoPlayers={play.handleRestoreDemoPlayers}
            onAddGuestPlayer={(newPlayer, editDetails) => {
              play.setPlayers(prev => [...prev, newPlayer]);
              if (editDetails) {
                play.setEditingPlayer(newPlayer);
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
              const keepSession = (id: string | undefined | null) => !!id && id !== sessionId;
              sess.setSessions(prev => prev.filter(s => s.id !== sessionId));
              sess.setGames(prev => prev.filter(g => keepSession(g.sessionId)));
              sess.setPointEvents(prev => prev.filter(p => keepSession(p.sessionId)));
              sess.setTeams(prev => prev.filter(t => keepSession(t.sessionId)));
              sess.setGameReports(prev => prev.filter(r => keepSession(r.sessionId)));
              sess.setSessionReports(prev => prev.filter(r => keepSession(r.sessionId)));
              setSelectedHistorySessionId(null);
            }}
            onBackToDashboard={() => { setPage('dashboard'); setActiveModule('dashboard'); }}
            initialTab="sessions"
            hideTabs={false}
          />
        );

      case 'configuracoes':
        return renderSettingsModule();

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
            onUpload={handleUploadToCloud}
            onDownload={handleDownloadFromCloud}
            onSync={handleSync}
            lastSyncedAt={lastSyncedAt}
            syncLoading={syncLoading}
          />
        );

      default:
        return null;
    }
  };

  // ── Sub-view Renderers ───────────────────────────────────────────────────



  const renderTournamentsModule = () => {
    const tournaments = sess.sessions.filter(s => s.type === 'tournament');
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-border">
          <span className="text-xs font-bold text-text-muted uppercase">Torneios Registrados</span>
          <button
            onClick={() => {
              const s: Session = {
                id: `sessao-${Date.now()}`,
                name: `Torneio — ${new Date().toLocaleDateString('pt-BR')}`,
                date: new Date().toISOString().split('T')[0],
                status: 'draft',
                selectedPlayerIds: [],
                teamIds: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                type: 'tournament'
              };
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
          {tournaments.map(t => {
            const tGames = sess.games.filter(g => g.sessionId === t.id && g.status === 'finished');
            const finishedGames = tGames.length;
            const winnerId = t.status === 'finished' 
              ? sess.sessionReports.find(r => r.sessionId === t.id)?.teamStandings?.[0]?.teamId
              : null;
            const winnerName = winnerId ? (sess.teams.find(team => team.id === winnerId)?.name ?? '—') : '—';
            
            return (
              <div key={t.id} className="card card-border bg-base-200 p-6 rounded-2xl flex flex-col justify-between gap-4">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary uppercase">Torneio</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      t.status === 'active' 
                        ? 'bg-success-muted text-success' 
                        : t.status === 'finished' 
                          ? 'bg-primary/15 text-primary' 
                          : t.status === 'teams_generated'
                            ? 'bg-success/15 text-success'
                            : 'bg-surface-strong text-text-muted'
                    }`}>
                      {t.status === 'active' ? 'Ativo' : t.status === 'finished' ? 'Finalizado' : t.status === 'teams_generated' ? 'Pronto' : 'Rascunho'}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg text-base-content uppercase mt-3 tracking-tight">{t.name}</h3>
                  <p className="text-[10px] text-text-subtle font-mono uppercase mt-1">Data: {new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                </div>

                <div className="bg-surface-muted p-3.5 rounded-xl border border-border space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-text-muted">Partidas Realizadas:</span>
                    <span className="font-bold font-mono text-base-content">{finishedGames}</span>
                  </div>
                  {t.status === 'finished' && (
                    <div className="flex justify-between items-center text-xs border-t border-border pt-2 mt-2">
                      <span className="text-text-muted flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-accent" /> Campeão:</span>
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
              <p className="text-base-content/60 uppercase text-xs font-bold italic">Nenhum torneio cadastrado.</p>
            </div>
          )}
        </div>
      </div>
    );
  };



  const renderRankingModule = () => {
    // Generate Overall Rankings of all players
    const rankedPlayers = play.players.map(player => {
      const stats = calculatePlayerStats(player, sess.games, sess.pointEvents, sess.teams, sess.sessions);
      const overall = calculateGeneralOverall(player);
      return {
        player,
        stats,
        overall
      };
    }).filter(p => p.player.ativo);

    const searchedRankings = rankedPlayers.filter(p => {
      return p.player.nome.toLowerCase().includes(rankingSearch.toLowerCase()) || 
             (p.player.apelido ?? '').toLowerCase().includes(rankingSearch.toLowerCase());
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
      'all-rounder': 'Coringa'
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
            {(['overall', 'winRate', 'points'] as const).map(s => (
              <button
                key={s}
                onClick={() => setRankingSort(s)}
                className={`px-4 py-2 text-xs font-bold uppercase rounded-lg border transition-all ${
                  rankingSort === s 
                    ? 'bg-primary border-primary text-primary-content' 
                    : 'bg-surface-muted border-border text-text-muted hover:text-base-content'
                }`}
              >
                {s === 'overall' ? 'Por Rating' : s === 'winRate' ? 'Por % Vitória' : 'Por Pontos'}
              </button>
            ))}
          </div>
        </div>

        <div className="card card-border bg-base-200 rounded-2xl overflow-hidden">
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
                      {index + 1 === 1 ? '🥇' : index + 1 === 2 ? '🥈' : index + 1 === 3 ? '🥉' : `#${index + 1}`}
                    </td>
                    <td className="p-4 font-bold text-base-content uppercase">
                      {p.player.apelido || p.player.nome}
                      {p.player.status.lesionado && (
                        <span className="ml-2 px-1.5 py-0.5 bg-error/15 text-error text-[8px] rounded uppercase font-bold">Lesionado</span>
                      )}
                    </td>
                    <td className="p-4 font-semibold text-base-content/60 uppercase text-[10px]">
                      {positionLabels[p.player.posicaoPrincipal] || p.player.posicaoPrincipal}
                    </td>
                    <td className="p-4 text-center font-mono font-bold text-base-content/70">{p.stats.gamesPlayed}</td>
                    <td className="p-4 text-center font-mono font-bold text-success">{p.stats.wins}</td>
                    <td className="p-4 text-center font-mono font-bold text-base-content">{p.stats.winRate.toFixed(1)}%</td>
                    <td className="p-4 text-center font-mono text-base-content/60">{p.stats.aces}</td>
                    <td className="p-4 text-center font-mono text-base-content/60">{p.stats.blocks}</td>
                    <td className="p-4 text-center font-mono font-black text-accent text-sm">{p.stats.totalPoints}</td>
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
          <h3 className="text-base font-bold uppercase text-base-content tracking-wider mb-4">Dados & Backup</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-6">
            Exporte ou importe a base de dados de atletas, partidas, sessões e históricos para compartilhar ou salvar como backup.
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

        <div className="card card-border border-error/20 bg-error/5 p-6 rounded-2xl">
          <h3 className="text-base font-bold uppercase text-error tracking-wider mb-4">Zona de Risco</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-6">
            Ações destrutivas e administrativas. Redefina completamente todos os dados do aplicativo ou carregue o elenco original de atletas de exemplo.
          </p>
 
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleResetAllData}
              className="btn btn-error rounded-full uppercase tracking-wider text-xs"
            >
              <RefreshCw className="w-4 h-4" /> Resetar Banco de Dados
            </button>
            <button
              onClick={() => {
                if (confirm('Deseja carregar a lista de atletas de exemplo? Isto preservará seus dados atuais, mas adicionará novos atletas se não existirem.')) {
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

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'torneios', label: 'Torneios', icon: <Trophy className="w-5 h-5" /> },
    { id: 'players', label: 'Jogadores', icon: <Users className="w-5 h-5" /> },
    { id: 'ranking', label: 'Ranking', icon: <Medal className="w-5 h-5" /> },
    { id: 'historico', label: 'Histórico', icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'conta', label: 'Nuvem & Conta', icon: <Cloud className="w-5 h-5" /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Settings className="w-5 h-5" /> }
  ] as const;

  return (
    <div className="drawer lg:drawer-open">
      <input id="sidebar-drawer" type="checkbox" className="drawer-toggle" />
      
      <div className="drawer-content flex flex-col min-h-screen min-w-0 bg-base-100 text-base-content">
        {/* Top Header */}
        <header className="h-[72px] bg-base-200 border-b border-base-300 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <label htmlFor="sidebar-drawer" className="btn btn-ghost btn-circle lg:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block h-5 w-5 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </label>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider text-base-content">
                {getCurrentPageTitle()}
              </h2>
              {sess.activeSession && sess.activeSession.status === 'active' && (
                <p className="text-[10px] text-base-content/60 font-medium mt-0.5">
                  Sessão Ativa: <span className="text-primary font-bold">{sess.activeSession.name}</span>
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

      {/* Drawer Sidebar */}
      <div className="drawer-side z-30">
        <label htmlFor="sidebar-drawer" aria-label="close sidebar" className="drawer-overlay"></label>
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
                <p className="text-[9px] text-base-content/60 font-bold tracking-wider uppercase mt-1">Plataforma Esportiva</p>
              </div>
            </div>
            <nav className="space-y-1">
              <ul className="menu p-0">
                {navItems.map(item => (
                  <li key={item.id} className="mb-1">
                    <button
                      onClick={() => {
                        handleNav(item.id);
                        const checkbox = document.getElementById('sidebar-drawer') as HTMLInputElement;
                        if (checkbox) checkbox.checked = false;
                      }}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                        activeModule === item.id 
                          ? 'bg-primary! text-primary-content! shadow-lg shadow-primary/20' 
                          : 'text-base-content/70 hover:text-base-content hover:bg-base-300'
                      }`}
                    >
                      {item.icon}
                      {item.label}
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
