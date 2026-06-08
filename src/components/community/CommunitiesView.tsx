import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  ChevronLeft,
  Clock,
  Copy,
  FileText,
  MapPin,
  MoreVertical,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  Trophy,
  Users,
  Volleyball,
} from 'lucide-react';
import {
  Community,
  CommunityPresenceStatus,
  CommunityRankingFilter,
  CommunityRules,
  Game,
  Player,
  PointEvent,
  Position,
  Session,
  SessionReport,
  ShareBlock,
  Team,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '../../types';
import { calculateGeneralOverall } from '../../logic/calculations';
import {
  getCommunityFrequency,
  getCommunityGames,
  getCommunityPlayers,
  getCommunityRanking,
  getCommunitySessions,
  getCommunitySummary,
  getPlayerDisplayName,
} from '../../logic/community';
import {
  formatPresenceText,
  getPresenceAlerts,
  getPresenceGroups,
  getPresenceStatus,
  getPresenceSummary,
} from '../../logic/communityPresence';
import {
  createDefaultTemplate,
  createDraftFromTemplate,
  formatMainListSection,
  formatOpenSlotsMessage,
  formatPaymentInfo,
  formatPaymentReminder,
  formatReserveSection,
  formatSettersSection,
  formatShortCallMessage,
  formatWhatsAppHeader,
  formatWhatsAppList,
} from '../../logic/whatsappList';
import {
  formatCommunityPlayersText,
  formatCommunityRankingText,
  formatCommunitySessionsText,
  formatCommunitySummaryText,
} from '../../logic/shareFormatters';
import { createDefaultCommunityRules } from '../../hooks/useCommunityRules';
import { ShareActions } from '../share/ShareActions';

type CommunityTab = 'summary' | 'players' | 'presence' | 'whatsapp' | 'sessions' | 'ranking' | 'rules' | 'data';
type PlayerFilter = 'all' | 'active' | 'inactive' | 'frequent' | 'absent' | 'setters' | 'central' | 'wing' | 'libero' | 'limited';

interface CommunityPresenceApi {
  getPresence: (communityId: string) => import('../../types').CommunityPresence | null;
  setPresenceStatus: (communityId: string, playerId: string, status: CommunityPresenceStatus) => void;
  clearPresence: (communityId: string) => void;
  selectFrequentPlayers: (communityId: string, players: Player[]) => void;
  useLastPresence: (communityId: string) => void;
  addGuest: (communityId: string, temporaryName: string) => void;
  getPresentPlayers: (communityId: string, players: Player[]) => Player[];
}

interface WhatsAppApi {
  saveTemplate: (template: WhatsAppListTemplate) => void;
  saveDraft: (draft: WhatsAppListDraft) => void;
  getCommunityTemplates: (communityId: string) => WhatsAppListTemplate[];
  getLatestDraft: (communityId: string) => WhatsAppListDraft | undefined;
}

interface RulesApi {
  getRules: (community: Community) => CommunityRules;
  saveRules: (rules: CommunityRules) => void;
  removeRules: (communityId: string) => void;
}

interface CommunitiesViewProps {
  communities: Community[];
  players: Player[];
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessionReports: SessionReport[];
  presenceApi: CommunityPresenceApi;
  whatsAppApi: WhatsAppApi;
  rulesApi: RulesApi;
  onBack: () => void;
  onAddCommunity: (input: Partial<Community>) => Community;
  onUpdateCommunity: (communityId: string, patch: Partial<Community>) => void;
  onDeleteCommunity: (communityId: string) => void;
  onDuplicateCommunity: (communityId: string, includeAthletes: boolean) => void;
  onUpdatePlayerCommunities: (communityId: string, playerIds: string[]) => void;
  onCreatePlayer: (name: string, communityId: string) => void;
  onCreateSession: (community: Community, playerIds: string[], rules: CommunityRules) => void;
  onViewSession: (sessionId: string) => void;
  onClearCommunityHistory: (communityId: string) => void;
}

const TAB_ITEMS: Array<{ id: CommunityTab; label: string }> = [
  { id: 'summary', label: 'Resumo' },
  { id: 'players', label: 'Atletas' },
  { id: 'presence', label: 'Presenca' },
  { id: 'whatsapp', label: 'Lista WhatsApp' },
  { id: 'sessions', label: 'Sessoes' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'rules', label: 'Regras' },
  { id: 'data', label: 'Dados' },
];

const POSITION_LABELS: Record<Position, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Libero',
  'all-rounder': 'Versatil',
};

function formatDate(date?: string) {
  if (!date) return '-';
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatFormat(type?: string) {
  return type === 'tournament' ? 'Campeonato' : 'Jogo Livre';
}

function emptyCommunityInput(): Partial<Community> {
  const now = new Date().toISOString();
  return {
    name: 'Nova comunidade',
    description: '',
    defaultLocation: '',
    defaultDay: '',
    defaultStartTime: '',
    defaultEndTime: '',
    defaultFormat: 'free_play',
    color: 'primary',
    icon: 'volleyball',
    archived: false,
    createdAt: now,
  };
}

export function CommunitiesView({
  communities,
  players,
  sessions,
  games,
  pointEvents,
  teams,
  sessionReports,
  presenceApi,
  whatsAppApi,
  rulesApi,
  onBack,
  onAddCommunity,
  onUpdateCommunity,
  onDeleteCommunity,
  onDuplicateCommunity,
  onUpdatePlayerCommunities,
  onCreatePlayer,
  onCreateSession,
  onViewSession,
  onClearCommunityHistory,
}: CommunitiesViewProps) {
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const selectedCommunity = communities.find(community => community.id === selectedCommunityId) || null;

  const visibleCommunities = useMemo(() => (
    communities.filter(community => showArchived || !community.archived)
  ), [communities, showArchived]);

  const handleAdd = () => {
    const community = onAddCommunity(emptyCommunityInput());
    setSelectedCommunityId(community.id);
  };

  if (selectedCommunity) {
    return (
      <CommunityDetailView
        community={selectedCommunity}
        players={players}
        sessions={sessions}
        games={games}
        pointEvents={pointEvents}
        teams={teams}
        sessionReports={sessionReports}
        presenceApi={presenceApi}
        whatsAppApi={whatsAppApi}
        rulesApi={rulesApi}
        onBack={() => setSelectedCommunityId(null)}
        onUpdateCommunity={onUpdateCommunity}
        onDeleteCommunity={(communityId) => {
          onDeleteCommunity(communityId);
          setSelectedCommunityId(null);
        }}
        onDuplicateCommunity={onDuplicateCommunity}
        onUpdatePlayerCommunities={onUpdatePlayerCommunities}
        onCreatePlayer={onCreatePlayer}
        onCreateSession={onCreateSession}
        onViewSession={onViewSession}
        onClearCommunityHistory={onClearCommunityHistory}
      />
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="btn btn-ghost btn-sm">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex items-center gap-2">
          <label className="label cursor-pointer gap-2 text-xs font-bold uppercase">
            <span>Arquivadas</span>
            <input type="checkbox" className="toggle toggle-sm" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />
          </label>
          <button type="button" onClick={handleAdd} className="btn btn-primary btn-sm">
            <Plus className="w-4 h-4" /> Nova
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-black uppercase tracking-tight">Comunidades</h2>
        <p className="text-sm text-base-content/60">Central local dos grupos recorrentes de volei.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visibleCommunities.map(community => (
          <React.Fragment key={community.id}>
            <CommunityCard
              community={community}
              players={players}
              sessions={sessions}
              games={games}
              pointEvents={pointEvents}
              sessionReports={sessionReports}
              onOpen={() => setSelectedCommunityId(community.id)}
              onCreateSession={() => onCreateSession(
                community,
                getCommunityPlayers(community.id, players).filter(player => player.ativo).map(player => player.id),
                rulesApi.getRules(community)
              )}
              onUpdateCommunity={onUpdateCommunity}
              onDuplicateCommunity={onDuplicateCommunity}
              onDeleteCommunity={onDeleteCommunity}
            />
          </React.Fragment>
        ))}
      </div>

      {visibleCommunities.length === 0 && (
        <div className="card card-border bg-base-200 border-dashed">
          <div className="card-body items-center text-center py-16">
            <Volleyball className="w-10 h-10 text-base-content/30" />
            <h3 className="card-title text-base">Nenhuma comunidade cadastrada</h3>
            <p className="text-sm text-base-content/60">Crie uma comunidade para organizar presenca, listas e sessoes recorrentes.</p>
            <button type="button" onClick={handleAdd} className="btn btn-primary mt-2">
              <Plus className="w-4 h-4" /> Criar comunidade
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommunityCard({
  community,
  players,
  sessions,
  games,
  pointEvents,
  sessionReports,
  onOpen,
  onCreateSession,
  onUpdateCommunity,
  onDuplicateCommunity,
  onDeleteCommunity,
}: {
  community: Community;
  players: Player[];
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  sessionReports: SessionReport[];
  onOpen: () => void;
  onCreateSession: () => void;
  onUpdateCommunity: (communityId: string, patch: Partial<Community>) => void;
  onDuplicateCommunity: (communityId: string, includeAthletes: boolean) => void;
  onDeleteCommunity: (communityId: string) => void;
}) {
  const summary = getCommunitySummary({ community, players, sessions, games, pointEvents, sessionReports });

  return (
    <div className="card card-border bg-base-200">
      <div className="card-body gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`badge badge-${community.archived ? 'neutral' : 'primary'} badge-soft`}>
                {community.archived ? 'Arquivada' : formatFormat(community.defaultFormat)}
              </span>
              <span className="badge badge-outline">{summary.activeAthletes} atletas</span>
            </div>
            <h3 className="card-title mt-2 text-lg uppercase">{community.name}</h3>
            <p className="text-sm text-base-content/60 line-clamp-2">{community.description || 'Sem descricao.'}</p>
          </div>
          <div className="dropdown dropdown-end">
            <button type="button" className="btn btn-ghost btn-sm btn-square" aria-label="Acoes da comunidade">
              <MoreVertical className="w-4 h-4" />
            </button>
            <ul className="menu dropdown-content bg-base-200 rounded-box z-20 w-52 p-2 shadow-xl border border-base-300">
              <li><button type="button" onClick={onOpen}>Editar / abrir</button></li>
              <li><button type="button" onClick={() => onDuplicateCommunity(community.id, true)}>Duplicar com atletas</button></li>
              <li><button type="button" onClick={() => onUpdateCommunity(community.id, { archived: !community.archived })}>{community.archived ? 'Desarquivar' : 'Arquivar'}</button></li>
              <li><button type="button" onClick={() => exportCommunity(community, players, sessions)}>Exportar</button></li>
              <li><button type="button" className="text-error" onClick={() => onDeleteCommunity(community.id)}>Excluir</button></li>
            </ul>
          </div>
        </div>

        <div className="text-xs text-base-content/60 flex flex-col gap-1">
          <span className="inline-flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {community.defaultLocation || 'Local nao informado'}</span>
          <span className="inline-flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> {community.defaultDay || 'Dia nao definido'} {community.defaultStartTime ? `- ${community.defaultStartTime}` : ''}{community.defaultEndTime ? ` as ${community.defaultEndTime}` : ''}</span>
        </div>

        <div className="stats stats-vertical sm:stats-horizontal bg-base-100">
          <div className="stat">
            <div className="stat-title">Sessoes</div>
            <div className="stat-value text-lg">{summary.totalSessions}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Ultima sessao</div>
            <div className="stat-value text-lg">{formatDate(summary.lastSession?.date)}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Ultimo MVP</div>
            <div className="stat-value text-sm">{summary.lastMvpName || '-'}</div>
          </div>
        </div>

        <div className="card-actions grid grid-cols-2 gap-2">
          <button type="button" onClick={onOpen} className="btn btn-outline btn-sm">Abrir</button>
          <button type="button" onClick={onCreateSession} className="btn btn-primary btn-sm">Criar sessao</button>
        </div>
      </div>
    </div>
  );
}

function CommunityDetailView({
  community,
  players,
  sessions,
  games,
  pointEvents,
  teams,
  sessionReports,
  presenceApi,
  whatsAppApi,
  rulesApi,
  onBack,
  onUpdateCommunity,
  onDeleteCommunity,
  onDuplicateCommunity,
  onUpdatePlayerCommunities,
  onCreatePlayer,
  onCreateSession,
  onViewSession,
  onClearCommunityHistory,
}: Omit<CommunitiesViewProps, 'communities' | 'onAddCommunity'> & {
  community: Community;
}) {
  const [activeTab, setActiveTab] = useState<CommunityTab>('summary');
  const summary = getCommunitySummary({ community, players, sessions, games, pointEvents, sessionReports });
  const communityPlayers = getCommunityPlayers(community.id, players);
  const rules = rulesApi.getRules(community);

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="btn btn-ghost btn-sm">
          <ChevronLeft className="w-4 h-4" /> Comunidades
        </button>
        <ShareActions
          title={community.name}
          text={formatCommunitySummaryText(community, summary)}
          variant="icon"
          blocks={[
            { id: 'summary', label: 'Resumo', text: formatCommunitySummaryText(community, summary) },
            { id: 'players', label: 'Atletas', text: formatCommunityPlayersText(community, communityPlayers) },
          ]}
        />
      </div>

      <div className="card card-border bg-base-200">
        <div className="card-body gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                <span className="badge badge-primary badge-soft">{formatFormat(community.defaultFormat)}</span>
                {community.archived && <span className="badge badge-neutral">Arquivada</span>}
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight">{community.name}</h2>
              <p className="text-sm text-base-content/60">{community.description || 'Sem descricao.'}</p>
              <div className="mt-3 text-xs text-base-content/60 space-y-1">
                <p className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {community.defaultLocation || 'Local nao informado'}</p>
                <p className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> {community.defaultDay || 'Dia nao definido'} {community.defaultStartTime ? `${community.defaultStartTime}` : ''}{community.defaultEndTime ? ` as ${community.defaultEndTime}` : ''}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onCreateSession(community, communityPlayers.filter(player => player.ativo).map(player => player.id), rules)}
              className="btn btn-primary btn-block sm:btn-wide"
            >
              <Plus className="w-4 h-4" /> Criar sessao com esta comunidade
            </button>
          </div>
        </div>
      </div>

      <div role="tablist" className="tabs tabs-box overflow-x-auto flex-nowrap justify-start">
        {TAB_ITEMS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`tab whitespace-nowrap ${activeTab === tab.id ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <CommunitySummaryTab
          community={community}
          players={players}
          sessions={sessions}
          games={games}
          pointEvents={pointEvents}
          sessionReports={sessionReports}
          onCreateSession={() => onCreateSession(community, communityPlayers.filter(player => player.ativo).map(player => player.id), rules)}
          onGoToWhatsApp={() => setActiveTab('whatsapp')}
        />
      )}
      {activeTab === 'players' && (
        <CommunityPlayersTab
          community={community}
          players={players}
          sessions={sessions}
          onUpdatePlayerCommunities={onUpdatePlayerCommunities}
          onCreatePlayer={onCreatePlayer}
        />
      )}
      {activeTab === 'presence' && (
        <CommunityPresenceTab
          community={community}
          players={communityPlayers}
          presenceApi={presenceApi}
          onCreateSession={() => onCreateSession(community, presenceApi.getPresentPlayers(community.id, communityPlayers).map(player => player.id), rules)}
        />
      )}
      {activeTab === 'whatsapp' && (
        <CommunityWhatsAppListTab community={community} players={communityPlayers} whatsAppApi={whatsAppApi} />
      )}
      {activeTab === 'sessions' && (
        <CommunitySessionsTab
          community={community}
          sessions={sessions}
          games={games}
          pointEvents={pointEvents}
          sessionReports={sessionReports}
          onViewSession={onViewSession}
          onRepeatSession={(session) => onCreateSession(community, session.selectedPlayerIds, rules)}
        />
      )}
      {activeTab === 'ranking' && (
        <CommunityRankingTab
          community={community}
          players={players}
          sessions={sessions}
          games={games}
          pointEvents={pointEvents}
          teams={teams}
          sessionReports={sessionReports}
        />
      )}
      {activeTab === 'rules' && (
        <CommunityRulesTab community={community} rules={rules} onSave={rulesApi.saveRules} onUpdateCommunity={onUpdateCommunity} />
      )}
      {activeTab === 'data' && (
        <CommunityDataTab
          community={community}
          players={players}
          sessions={sessions}
          onUpdateCommunity={onUpdateCommunity}
          onDeleteCommunity={onDeleteCommunity}
          onDuplicateCommunity={onDuplicateCommunity}
          onClearCommunityHistory={onClearCommunityHistory}
        />
      )}
    </div>
  );
}

function CommunitySummaryTab({
  community,
  players,
  sessions,
  games,
  pointEvents,
  sessionReports,
  onCreateSession,
  onGoToWhatsApp,
}: {
  community: Community;
  players: Player[];
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  sessionReports: SessionReport[];
  onCreateSession: () => void;
  onGoToWhatsApp: () => void;
}) {
  const summary = getCommunitySummary({ community, players, sessions, games, pointEvents, sessionReports });
  const text = formatCommunitySummaryText(community, summary);

  return (
    <div className="space-y-4">
      <div className="stats stats-vertical sm:stats-horizontal w-full bg-base-200">
        <div className="stat"><div className="stat-title">Atletas</div><div className="stat-value">{summary.totalAthletes}</div><div className="stat-desc">{summary.activeAthletes} ativos</div></div>
        <div className="stat"><div className="stat-title">Sessoes</div><div className="stat-value">{summary.totalSessions}</div><div className="stat-desc">{summary.totalMatches} partidas</div></div>
        <div className="stat"><div className="stat-title">Pontos</div><div className="stat-value">{summary.totalPoints}</div><div className="stat-desc">registrados</div></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InfoCard title="Ultima sessao" value={summary.lastSession ? `${summary.lastSession.name} - ${formatDate(summary.lastSession.date)}` : 'Sem sessoes'} icon={<Calendar className="w-4 h-4" />} />
        <InfoCard title="Ultimo MVP" value={summary.lastMvpName || 'Sem MVP'} icon={<Trophy className="w-4 h-4" />} />
        <InfoCard title="Atleta frequente" value={summary.mostFrequentPlayerName || 'Sem dados'} icon={<Users className="w-4 h-4" />} />
        <InfoCard title="Formato mais usado" value={summary.mostUsedFormat ? formatFormat(summary.mostUsedFormat) : formatFormat(community.defaultFormat)} icon={<BarChart3 className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button type="button" onClick={onCreateSession} className="btn btn-primary btn-block"><Plus className="w-4 h-4" /> Criar sessao</button>
        <button type="button" onClick={onGoToWhatsApp} className="btn btn-outline btn-block"><FileText className="w-4 h-4" /> Lista WhatsApp</button>
        <ShareActions title={community.name} text={text} variant="buttons" copyLabel="Copiar resumo" shareLabel="Compartilhar" />
      </div>
    </div>
  );
}

function InfoCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="card card-border bg-base-200">
      <div className="card-body p-4">
        <div className="flex items-center gap-2 text-base-content/60 text-xs uppercase font-bold">{icon}{title}</div>
        <p className="font-black uppercase">{value}</p>
      </div>
    </div>
  );
}

function CommunityPlayersTab({
  community,
  players,
  sessions,
  onUpdatePlayerCommunities,
  onCreatePlayer,
}: {
  community: Community;
  players: Player[];
  sessions: Session[];
  onUpdatePlayerCommunities: (communityId: string, playerIds: string[]) => void;
  onCreatePlayer: (name: string, communityId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PlayerFilter>('all');
  const [newPlayerName, setNewPlayerName] = useState('');
  const communitySessions = getCommunitySessions(community.id, sessions);
  const selectedIds = useMemo<Set<string>>(() => new Set(getCommunityPlayers(community.id, players).map(player => player.id)), [community.id, players]);

  const filteredPlayers = useMemo(() => {
    return players
      .filter(player => {
        const isMember = selectedIds.has(player.id);
        const matchesSearch = !search || player.nome.toLowerCase().includes(search.toLowerCase()) || (player.apelido || '').toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;
        if (filter === 'active') return isMember && player.ativo;
        if (filter === 'inactive') return isMember && !player.ativo;
        if (filter === 'frequent') return isMember && player.status.presencaFrequente;
        if (filter === 'absent') return isMember && getCommunityFrequency(player.id, communitySessions) < 30;
        if (filter === 'setters') return isMember && player.posicaoPrincipal === 'levantador';
        if (filter === 'central') return isMember && player.posicaoPrincipal === 'central';
        if (filter === 'wing') return isMember && (player.posicaoPrincipal === 'ponteiro' || player.posicaoPrincipal === 'oposto');
        if (filter === 'libero') return isMember && player.posicaoPrincipal === 'libero';
        if (filter === 'limited') return isMember && Boolean(player.status.limitacaoFisica || player.status.lesionado);
        return filter === 'all' ? isMember : isMember;
      })
      .sort((a, b) => getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b)));
  }, [players, selectedIds, search, filter, communitySessions]);

  const togglePlayer = (playerId: string) => {
    const currentIds: string[] = Array.from(selectedIds);
    const next: string[] = selectedIds.has(playerId)
      ? currentIds.filter(id => id !== playerId)
      : [...currentIds, playerId];
    onUpdatePlayerCommunities(community.id, next);
  };

  const sharePlayers = filteredPlayers.length > 0 ? filteredPlayers : getCommunityPlayers(community.id, players);

  return (
    <div className="space-y-4">
      <div className="card card-border bg-base-200">
        <div className="card-body gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="input input-bordered flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 opacity-60" />
              <input type="text" className="grow" placeholder="Buscar atleta" value={search} onChange={event => setSearch(event.target.value)} />
            </label>
            <select className="select select-bordered" value={filter} onChange={event => setFilter(event.target.value as PlayerFilter)}>
              <option value="all">Todos vinculados</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="frequent">Mais frequentes</option>
              <option value="absent">Ausentes recentes</option>
              <option value="setters">Levantadores</option>
              <option value="central">Centrais</option>
              <option value="wing">Pontas/Opostos</option>
              <option value="libero">Liberos</option>
              <option value="limited">Com limitacao</option>
            </select>
          </div>

          <div className="join w-full">
            <input className="input input-bordered join-item flex-1" placeholder="Novo atleta" value={newPlayerName} onChange={event => setNewPlayerName(event.target.value)} />
            <button
              type="button"
              className="btn btn-primary join-item"
              onClick={() => {
                onCreatePlayer(newPlayerName, community.id);
                setNewPlayerName('');
              }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <ShareActions
            title={`Atletas - ${community.name}`}
            text={formatCommunityPlayersText(community, sharePlayers)}
            variant="menu"
            blocks={[
              { id: 'all', label: 'Lista completa', text: formatCommunityPlayersText(community, getCommunityPlayers(community.id, players)) },
              { id: 'active', label: 'Ativos', text: formatCommunityPlayersText(community, getCommunityPlayers(community.id, players).filter(player => player.ativo)) },
              { id: 'setters', label: 'Levantadores', text: formatCommunityPlayersText(community, getCommunityPlayers(community.id, players).filter(player => player.posicaoPrincipal === 'levantador')) },
              { id: 'limited', label: 'Com limitacao', text: formatCommunityPlayersText(community, getCommunityPlayers(community.id, players).filter(player => player.status.lesionado || player.status.limitacaoFisica)) },
            ]}
          />
        </div>
      </div>

      <div className="list bg-base-200 rounded-box border border-base-300">
        {filteredPlayers.map(player => (
          <div key={player.id} className="list-row">
            <div className="avatar avatar-placeholder">
              <div className="bg-primary text-primary-content w-10 rounded-full">
                <span>{getPlayerDisplayName(player).slice(0, 2).toUpperCase()}</span>
              </div>
            </div>
            <div>
              <div className="font-bold uppercase">{getPlayerDisplayName(player)}</div>
              <div className="text-xs opacity-60">{player.nome} - {POSITION_LABELS[player.posicaoPrincipal]}</div>
              <progress className="progress progress-primary w-32 h-1 mt-2" value={player.formaAtual.valor + 5} max={10} />
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="badge badge-accent badge-soft">Indice {calculateGeneralOverall(player)}</span>
              <span className="badge badge-outline">Freq. {getCommunityFrequency(player.id, communitySessions)}%</span>
              {(player.status.lesionado || player.status.limitacaoFisica) && <span className="badge badge-warning">Restricao</span>}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => togglePlayer(player.id)}>Remover</button>
          </div>
        ))}
      </div>

      <div className="collapse collapse-arrow bg-base-200 border border-base-300">
        <input type="checkbox" />
        <div className="collapse-title font-bold">Vincular atleta existente</div>
        <div className="collapse-content">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {players.filter(player => !selectedIds.has(player.id)).map(player => (
              <button key={player.id} type="button" className="btn btn-outline justify-between" onClick={() => togglePlayer(player.id)}>
                {getPlayerDisplayName(player)}
                <span className="badge">{POSITION_LABELS[player.posicaoPrincipal]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommunityPresenceTab({
  community,
  players,
  presenceApi,
  onCreateSession,
}: {
  community: Community;
  players: Player[];
  presenceApi: CommunityPresenceApi;
  onCreateSession: () => void;
}) {
  const [guestName, setGuestName] = useState('');
  const presence = presenceApi.getPresence(community.id);
  const summary = getPresenceSummary(presence, players);
  const groups = getPresenceGroups(presence, players);
  const alerts = getPresenceAlerts(presence, players);
  const text = formatPresenceText(community.name, presence, players);

  return (
    <div className="space-y-4">
      <div className="stats stats-vertical sm:stats-horizontal w-full bg-base-200">
        <div className="stat"><div className="stat-title">Presentes</div><div className="stat-value">{summary.presentCount}</div><div className="stat-desc">media {summary.averageOverall || 0}</div></div>
        <div className="stat"><div className="stat-title">Talvez</div><div className="stat-value">{summary.maybeCount}</div></div>
        <div className="stat"><div className="stat-title">Ausentes</div><div className="stat-value">{summary.absentCount}</div></div>
        <div className="stat"><div className="stat-title">Restricoes</div><div className="stat-value">{summary.restrictedCount}</div><div className="stat-desc">{summary.averageHeight ? `${summary.averageHeight}cm media` : 'altura sem dados'}</div></div>
      </div>

      {alerts.map(alert => (
        <div key={alert} role="alert" className="alert alert-warning alert-soft">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{alert}</span>
        </div>
      ))}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => presenceApi.selectFrequentPlayers(community.id, players)}>Frequentes</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => presenceApi.useLastPresence(community.id)}>Ultima presenca</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => presenceApi.clearPresence(community.id)}>Limpar</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onCreateSession}>Criar sessao</button>
      </div>

      <div className="join w-full">
        <input className="input input-bordered join-item flex-1" placeholder="Convidado temporario" value={guestName} onChange={event => setGuestName(event.target.value)} />
        <button type="button" className="btn btn-primary join-item" onClick={() => { presenceApi.addGuest(community.id, guestName); setGuestName(''); }}>Adicionar</button>
      </div>

      <ShareActions
        title={`Presenca - ${community.name}`}
        text={text}
        variant="menu"
        blocks={[
          { id: 'complete', label: 'Chamada completa', text },
          { id: 'present', label: 'Presentes', text: formatPresenceText(community.name, { communityId: community.id, date: '', updatedAt: '', items: groups.present.map(player => ({ playerId: player.id, status: 'present' })) }, players) },
          { id: 'alerts', label: 'Alertas', text: alerts.join('\n') || 'Sem alertas.' },
        ]}
      />

      <div className="list bg-base-200 rounded-box border border-base-300">
        {players.map(player => (
          <div key={player.id} className="list-row">
            <div>
              <div className="font-bold uppercase">{getPlayerDisplayName(player)}</div>
              <div className="text-xs opacity-60">{POSITION_LABELS[player.posicaoPrincipal]}</div>
            </div>
            <PresenceStatusControl
              status={getPresenceStatus(presence, player.id)}
              onChange={(status) => presenceApi.setPresenceStatus(community.id, player.id, status)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PresenceStatusControl({ status, onChange }: { status: CommunityPresenceStatus; onChange: (status: CommunityPresenceStatus) => void }) {
  const items: Array<{ value: CommunityPresenceStatus; label: string }> = [
    { value: 'present', label: 'Presente' },
    { value: 'maybe', label: 'Talvez' },
    { value: 'absent', label: 'Ausente' },
    { value: 'unmarked', label: 'Limpar' },
  ];

  return (
    <div className="join">
      {items.map(item => (
        <button
          key={item.value}
          type="button"
          className={`btn btn-xs join-item ${status === item.value ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function CommunityWhatsAppListTab({ community, players, whatsAppApi }: { community: Community; players: Player[]; whatsAppApi: WhatsAppApi }) {
  const templates = whatsAppApi.getCommunityTemplates(community.id);
  const initialTemplate = templates[0] || createDefaultTemplate(community.id, community.name);
  const [template, setTemplate] = useState<WhatsAppListTemplate>(initialTemplate);
  const [draft, setDraft] = useState<WhatsAppListDraft>(() => (
    whatsAppApi.getLatestDraft(community.id) || createDraftFromTemplate(initialTemplate, new Date().toISOString().split('T')[0])
  ));
  const text = formatWhatsAppList(draft);

  const updateDraft = (patch: Partial<WhatsAppListDraft>) => setDraft(prev => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }));

  const recreateFromTemplate = () => {
    const next = createDraftFromTemplate(template, draft.date);
    setDraft(next);
    whatsAppApi.saveTemplate(template);
    whatsAppApi.saveDraft(next);
  };

  const prefillNames = () => {
    const setters = players.filter(player => player.posicaoPrincipal === 'levantador').slice(0, draft.setters.length);
    const others = players.filter(player => player.posicaoPrincipal !== 'levantador').slice(0, draft.mainSlots.length);
    updateDraft({
      setters: draft.setters.map((slot, index) => ({ ...slot, displayName: setters[index] ? getPlayerDisplayName(setters[index]) : slot.displayName })),
      mainSlots: draft.mainSlots.map((slot, index) => ({ ...slot, displayName: others[index] ? getPlayerDisplayName(others[index]) : slot.displayName })),
    });
  };

  const blocks: ShareBlock[] = [
    { id: 'complete', label: 'Lista completa', text },
    { id: 'header', label: 'Cabecalho', text: formatWhatsAppHeader(draft) },
    { id: 'payment', label: 'Pagamento', text: formatPaymentInfo(draft) },
    { id: 'setters', label: 'Levantadores', text: formatSettersSection(draft) },
    { id: 'main', label: 'Lista principal', text: formatMainListSection(draft) },
    { id: 'reserve', label: 'Reservas', text: formatReserveSection(draft) },
    { id: 'short', label: 'Chamada curta', text: formatShortCallMessage(draft) },
    { id: 'payment-reminder', label: 'Lembrete pagamento', text: formatPaymentReminder(draft) },
    { id: 'open-slots', label: 'Vagas abertas', text: formatOpenSlotsMessage(draft) },
  ];

  return (
    <div className="space-y-4">
      <div className="card card-border bg-base-200">
        <div className="card-body gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="form-control">
              <span className="label-text">Nome do modelo</span>
              <input className="input input-bordered" value={template.name} onChange={event => setTemplate({ ...template, name: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text">Titulo</span>
              <input className="input input-bordered" value={draft.title} onChange={event => updateDraft({ title: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text">Data</span>
              <input type="date" className="input input-bordered" value={draft.date} onChange={event => updateDraft({ date: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text">Local</span>
              <input className="input input-bordered" value={draft.location || ''} onChange={event => updateDraft({ location: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text">Inicio</span>
              <input type="time" className="input input-bordered" value={draft.startTime || ''} onChange={event => updateDraft({ startTime: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text">Fim</span>
              <input type="time" className="input input-bordered" value={draft.endTime || ''} onChange={event => updateDraft({ endTime: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text">Valor</span>
              <input type="number" className="input input-bordered" value={draft.value || 0} onChange={event => updateDraft({ value: Number(event.target.value) })} />
            </label>
            <label className="form-control">
              <span className="label-text">Chave Pix</span>
              <input className="input input-bordered" value={draft.pixKey || ''} onChange={event => updateDraft({ pixKey: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text">Responsavel Pix</span>
              <input className="input input-bordered" value={draft.pixHolder || ''} onChange={event => updateDraft({ pixHolder: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text">Banco</span>
              <input className="input input-bordered" value={draft.pixBank || ''} onChange={event => updateDraft({ pixBank: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text">Prazo pagamento</span>
              <input className="input input-bordered" value={draft.paymentDeadline || ''} onChange={event => updateDraft({ paymentDeadline: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text">Observacao pagamento</span>
              <input className="input input-bordered" value={draft.paymentNote || ''} onChange={event => updateDraft({ paymentNote: event.target.value })} />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CountInput label="Levantadores" value={draft.setters.length} onChange={(count) => updateDraft({ setters: createSlotsWithCurrent(draft.setters, count) })} />
            <CountInput label="Lista principal" value={draft.mainSlots.length} onChange={(count) => updateDraft({ mainSlots: createSlotsWithCurrent(draft.mainSlots, count) })} />
            <CountInput label="Reservas" value={draft.reserveSlots.length} onChange={(count) => updateDraft({ reserveSlots: createSlotsWithCurrent(draft.reserveSlots, count) })} />
          </div>

          <label className="label cursor-pointer justify-start gap-3">
            <input type="checkbox" className="toggle toggle-primary" checked={draft.showLockIcon} onChange={event => updateDraft({ showLockIcon: event.target.checked })} />
            <span className="label-text">Exibir cadeado entre levantadores e lista principal</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <button type="button" className="btn btn-outline" onClick={prefillNames}>Preencher nomes</button>
            <button type="button" className="btn btn-outline" onClick={recreateFromTemplate}><RefreshCw className="w-4 h-4" /> Gerar</button>
            <button type="button" className="btn btn-primary" onClick={() => whatsAppApi.saveDraft(draft)}><Save className="w-4 h-4" /> Salvar lista</button>
            <button type="button" className="btn btn-secondary" onClick={() => whatsAppApi.saveTemplate({ ...template, ...templateFromDraft(template, draft) })}>Salvar modelo</button>
          </div>
        </div>
      </div>

      <textarea className="textarea textarea-bordered w-full min-h-96 font-mono text-xs" readOnly value={text} />
      <ShareActions title={`Lista - ${community.name}`} text={text} blocks={blocks} variant="menu" />
    </div>
  );
}

function CountInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="form-control">
      <span className="label-text">{label}</span>
      <input type="number" min={0} className="input input-bordered" value={value} onChange={event => onChange(Number(event.target.value))} />
    </label>
  );
}

function createSlotsWithCurrent(current: Array<{ index: number; displayName?: string; note?: string; paid?: boolean }>, count: number) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    index: index + 1,
    displayName: current[index]?.displayName,
    note: current[index]?.note,
    paid: current[index]?.paid,
  }));
}

function templateFromDraft(template: WhatsAppListTemplate, draft: WhatsAppListDraft): WhatsAppListTemplate {
  return {
    ...template,
    title: draft.title,
    defaultLocation: draft.location,
    defaultStartTime: draft.startTime,
    defaultEndTime: draft.endTime,
    defaultValue: draft.value,
    pixKey: draft.pixKey,
    pixHolder: draft.pixHolder,
    pixBank: draft.pixBank,
    paymentDeadline: draft.paymentDeadline,
    paymentNote: draft.paymentNote,
    settersCount: draft.setters.length,
    mainSlotsCount: draft.mainSlots.length,
    reserveSlotsCount: draft.reserveSlots.length,
    settersSectionTitle: draft.settersSectionTitle,
    reserveSectionTitle: draft.reserveSectionTitle,
    showLockIcon: draft.showLockIcon,
    paymentSymbol: draft.paymentSymbol,
    extraText: draft.extraText,
  };
}

function CommunitySessionsTab({
  community,
  sessions,
  games,
  pointEvents,
  sessionReports,
  onViewSession,
  onRepeatSession,
}: {
  community: Community;
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  sessionReports: SessionReport[];
  onViewSession: (sessionId: string) => void;
  onRepeatSession: (session: Session) => void;
}) {
  const communitySessions = getCommunitySessions(community.id, sessions);
  const text = formatCommunitySessionsText(community, communitySessions);

  return (
    <div className="space-y-4">
      <ShareActions title={`Sessoes - ${community.name}`} text={text} variant="buttons" />
      <div className="grid grid-cols-1 gap-4">
        {communitySessions.map(session => {
          const sessionGames = games.filter(game => game.sessionId === session.id && (game.status === 'finished' || game.status === 'walkover'));
          const sessionPoints = pointEvents.filter(point => point.sessionId === session.id);
          const report = sessionReports.find(item => item.sessionId === session.id);
          return (
            <div key={session.id} className="card card-border bg-base-200">
              <div className="card-body gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="badge badge-primary badge-soft">{formatFormat(session.type)}</span>
                    <h3 className="card-title mt-2">{session.name}</h3>
                    <p className="text-xs text-base-content/60">{formatDate(session.date)} - {session.location || community.defaultLocation || 'Local nao informado'}</p>
                  </div>
                  <span className="badge badge-outline">{session.status}</span>
                </div>
                <div className="stats stats-vertical sm:stats-horizontal bg-base-100">
                  <div className="stat"><div className="stat-title">Atletas</div><div className="stat-value text-lg">{session.selectedPlayerIds.length}</div></div>
                  <div className="stat"><div className="stat-title">Partidas</div><div className="stat-value text-lg">{sessionGames.length}</div></div>
                  <div className="stat"><div className="stat-title">Pontos</div><div className="stat-value text-lg">{sessionPoints.length}</div></div>
                  <div className="stat"><div className="stat-title">MVP</div><div className="stat-value text-sm">{report?.playerRanking?.[0]?.playerName || '-'}</div></div>
                </div>
                <div className="card-actions grid grid-cols-2 gap-2">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => onViewSession(session.id)}>Ver relatorio</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onRepeatSession(session)}>Repetir configuracao</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {communitySessions.length === 0 && <div className="alert alert-info">Nenhuma sessao vinculada a esta comunidade.</div>}
    </div>
  );
}

function CommunityRankingTab({
  community,
  players,
  sessions,
  games,
  pointEvents,
  teams,
  sessionReports,
}: {
  community: Community;
  players: Player[];
  sessions: Session[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessionReports: SessionReport[];
}) {
  const [filter, setFilter] = useState<CommunityRankingFilter>('all');
  const ranking = getCommunityRanking({ communityId: community.id, filter, players, sessions, games, pointEvents, teams, sessionReports });
  const text = formatCommunityRankingText(community, ranking, 10);

  return (
    <div className="space-y-4">
      <div className="join overflow-x-auto">
        {([
          ['all', 'Geral'],
          ['month', 'Mes'],
          ['last5', 'Ultimas 5'],
          ['last10', 'Ultimas 10'],
          ['season', 'Temporada'],
        ] as Array<[CommunityRankingFilter, string]>).map(([id, label]) => (
          <button key={id} type="button" className={`btn join-item btn-sm ${filter === id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <ShareActions title={`Ranking - ${community.name}`} text={text} variant="menu" blocks={[
        { id: 'top3', label: 'Top 3', text: formatCommunityRankingText(community, ranking, 3) },
        { id: 'top5', label: 'Top 5', text: formatCommunityRankingText(community, ranking, 5) },
        { id: 'general', label: 'Geral', text },
      ]} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ranking.rows.map((row, index) => (
          <div key={row.playerId} className="card card-border bg-base-200">
            <div className="card-body p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="badge badge-primary">#{index + 1}</span>
                  <h3 className="font-black uppercase mt-2">{row.playerName}</h3>
                  <p className="text-sm text-base-content/60">{row.totalPoints} pts - {row.mvpCount} MVPs</p>
                </div>
                <Trophy className="w-5 h-5 text-accent" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span>Presenca: <b>{row.presenceRate}%</b></span>
                <span>Vitorias: <b>{row.wins}</b></span>
                <span>Aces: <b>{row.aces}</b></span>
                <span>Bloqueios: <b>{row.blocks}</b></span>
                <span>Aproveitamento: <b>{row.winRate}%</b></span>
                <span>Regularidade: <b>{row.regularity}</b></span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {ranking.rows.length === 0 && <div className="alert alert-info">Sem dados para ranking nesta comunidade.</div>}
    </div>
  );
}

function CommunityRulesTab({
  community,
  rules,
  onSave,
  onUpdateCommunity,
}: {
  community: Community;
  rules: CommunityRules;
  onSave: (rules: CommunityRules) => void;
  onUpdateCommunity: (communityId: string, patch: Partial<Community>) => void;
}) {
  const [draft, setDraft] = useState<CommunityRules>(rules);
  const save = () => {
    onSave(draft);
    onUpdateCommunity(community.id, {
      defaultLocation: draft.defaultLocation,
      defaultDay: draft.defaultDay,
      defaultStartTime: draft.defaultStartTime,
      defaultEndTime: draft.defaultEndTime,
      defaultFormat: draft.defaultFormat,
    });
  };

  return (
    <div className="space-y-3">
      <RulesCollapse title="Dados padrao" open>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Local padrao" value={draft.defaultLocation || ''} onChange={value => setDraft({ ...draft, defaultLocation: value })} />
          <Field label="Dia padrao" value={draft.defaultDay || ''} onChange={value => setDraft({ ...draft, defaultDay: value })} />
          <Field label="Inicio" type="time" value={draft.defaultStartTime || ''} onChange={value => setDraft({ ...draft, defaultStartTime: value })} />
          <Field label="Fim" type="time" value={draft.defaultEndTime || ''} onChange={value => setDraft({ ...draft, defaultEndTime: value })} />
          <label className="form-control">
            <span className="label-text">Formato padrao</span>
            <select className="select select-bordered" value={draft.defaultFormat} onChange={event => setDraft({ ...draft, defaultFormat: event.target.value as 'free_play' | 'tournament' })}>
              <option value="free_play">Jogo Livre</option>
              <option value="tournament">Campeonato</option>
            </select>
          </label>
        </div>
      </RulesCollapse>

      <RulesCollapse title="Jogo Livre">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <NumberField label="Times" value={draft.freePlay?.teamCount || 3} onChange={value => setDraft({ ...draft, freePlay: { ...draft.freePlay, teamCount: value } })} />
          <NumberField label="Pontos" value={draft.freePlay?.maxPoints || 15} onChange={value => setDraft({ ...draft, freePlay: { ...draft.freePlay, maxPoints: value } })} />
          <NumberField label="Limite consecutivo" value={draft.freePlay?.maxConsecutiveGames || 3} onChange={value => setDraft({ ...draft, freePlay: { ...draft.freePlay, maxConsecutiveGames: value } })} />
        </div>
      </RulesCollapse>

      <RulesCollapse title="Campeonato">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <NumberField label="Times" value={draft.tournament?.teamCount || 3} onChange={value => setDraft({ ...draft, tournament: { ...draft.tournament, teamCount: value } })} />
          <NumberField label="Pontos por vitoria" value={draft.tournament?.classificationPoints?.win || 3} onChange={value => setDraft({ ...draft, tournament: { ...draft.tournament, classificationPoints: { win: value, loss: draft.tournament?.classificationPoints?.loss || 0 } } })} />
          <NumberField label="Pontos por derrota" value={draft.tournament?.classificationPoints?.loss || 0} onChange={value => setDraft({ ...draft, tournament: { ...draft.tournament, classificationPoints: { win: draft.tournament?.classificationPoints?.win || 3, loss: value } } })} />
        </div>
      </RulesCollapse>

      <RulesCollapse title="Times">
        <textarea className="textarea textarea-bordered w-full" value={(draft.defaultTeamNames || []).join('\n')} onChange={event => setDraft({ ...draft, defaultTeamNames: event.target.value.split('\n').filter(Boolean) })} placeholder="Um nome de time por linha" />
      </RulesCollapse>

      <RulesCollapse title="Algoritmo">
        <div className="alert alert-info alert-soft">
          Pesos especificos podem ser ajustados futuramente; por enquanto esta comunidade usa o algoritmo atual do app com as regras padrao salvas acima.
        </div>
      </RulesCollapse>

      <button type="button" className="btn btn-primary btn-block" onClick={save}><Save className="w-4 h-4" /> Salvar regras</button>
    </div>
  );
}

function RulesCollapse({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <div className="collapse collapse-arrow bg-base-200 border border-base-300">
      <input type="checkbox" defaultChecked={open} />
      <div className="collapse-title font-bold">{title}</div>
      <div className="collapse-content">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="form-control">
      <span className="label-text">{label}</span>
      <input type={type} className="input input-bordered" value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="form-control">
      <span className="label-text">{label}</span>
      <input type="number" className="input input-bordered" value={value} onChange={event => onChange(Number(event.target.value))} />
    </label>
  );
}

function CommunityDataTab({
  community,
  players,
  sessions,
  onUpdateCommunity,
  onDeleteCommunity,
  onDuplicateCommunity,
  onClearCommunityHistory,
}: {
  community: Community;
  players: Player[];
  sessions: Session[];
  onUpdateCommunity: (communityId: string, patch: Partial<Community>) => void;
  onDeleteCommunity: (communityId: string) => void;
  onDuplicateCommunity: (communityId: string, includeAthletes: boolean) => void;
  onClearCommunityHistory: (communityId: string) => void;
}) {
  const [draft, setDraft] = useState<Community>(community);
  const [confirm, setConfirm] = useState<'delete' | 'history' | null>(null);

  const save = () => onUpdateCommunity(community.id, draft);

  return (
    <div className="space-y-4">
      <div className="card card-border bg-base-200">
        <div className="card-body gap-3">
          <Field label="Nome" value={draft.name} onChange={value => setDraft({ ...draft, name: value })} />
          <label className="form-control">
            <span className="label-text">Descricao</span>
            <textarea className="textarea textarea-bordered" value={draft.description || ''} onChange={event => setDraft({ ...draft, description: event.target.value })} />
          </label>
          <Field label="Local padrao" value={draft.defaultLocation || ''} onChange={value => setDraft({ ...draft, defaultLocation: value })} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Dia" value={draft.defaultDay || ''} onChange={value => setDraft({ ...draft, defaultDay: value })} />
            <Field label="Inicio" type="time" value={draft.defaultStartTime || ''} onChange={value => setDraft({ ...draft, defaultStartTime: value })} />
            <Field label="Fim" type="time" value={draft.defaultEndTime || ''} onChange={value => setDraft({ ...draft, defaultEndTime: value })} />
          </div>
          <label className="label cursor-pointer justify-start gap-3">
            <input type="checkbox" className="toggle" checked={Boolean(draft.archived)} onChange={event => setDraft({ ...draft, archived: event.target.checked })} />
            <span className="label-text">Arquivar comunidade</span>
          </label>
          <button type="button" className="btn btn-primary" onClick={save}><Save className="w-4 h-4" /> Salvar dados</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button type="button" className="btn btn-outline" onClick={() => onDuplicateCommunity(community.id, true)}><Copy className="w-4 h-4" /> Duplicar com atletas</button>
        <button type="button" className="btn btn-outline" onClick={() => exportCommunity(community, players, sessions)}>Exportar comunidade</button>
        <button type="button" className="btn btn-warning" onClick={() => setConfirm('history')}><ShieldAlert className="w-4 h-4" /> Limpar historico</button>
        <button type="button" className="btn btn-error" onClick={() => setConfirm('delete')}><Trash2 className="w-4 h-4" /> Excluir comunidade</button>
      </div>

      {confirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Confirmar acao</h3>
            <p className="py-4">
              {confirm === 'delete'
                ? 'Essa acao excluira a comunidade deste dispositivo. Os atletas podem ser mantidos no elenco geral.'
                : 'Essa acao removera o vinculo de historico das sessoes desta comunidade.'}
            </p>
            <div className="modal-action">
              <button type="button" className="btn" onClick={() => setConfirm(null)}>Cancelar</button>
              <button
                type="button"
                className="btn btn-error"
                onClick={() => {
                  if (confirm === 'delete') onDeleteCommunity(community.id);
                  if (confirm === 'history') onClearCommunityHistory(community.id);
                  setConfirm(null);
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function exportCommunity(community: Community, players: Player[], sessions: Session[]) {
  const payload = {
    community,
    players: getCommunityPlayers(community.id, players),
    sessions: getCommunitySessions(community.id, sessions),
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${community.name.toLowerCase().replace(/\s+/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
