import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  ChevronLeft,
  Clock,
  Copy,
  FileText,
  MapPin,
  KeyRound,
  MoreVertical,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  Trophy,
  CheckCircle2,
  ClipboardCheck,
  MessageCircle,
  Circle,
  Lock,
  Users,
  Volleyball,
} from 'lucide-react';
import { paths } from '@app/appRoutes';
import { matchesSearch } from '../../logic/textNormalization';
import {
  AuthRole,
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
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
import type { AppResult } from '../../application/appResult';
import type { CreateChampionshipInput } from '../../application/championshipUseCases';
import { getSeasonAwards, getSeasonStandings } from '../../application/championshipUseCases';
import { generateUUID } from '../../logic/uuid';
import type { AwardWinner } from '../../logic/tournament';
import { calculateGeneralOverall } from '../../logic/calculations';
import {
  getCommunityFrequency,
  getCommunityPlayers,
  getCommunityRanking,
  getCommunitySessions,
  getCommunitySummary,
  getPlayerDisplayName,
} from '../../logic/community';
import { useCommunityPermissions } from '../../hooks/useCommunityPermissions';
import {
  formatPresenceText,
  getPresenceAlerts,
  getPresenceGroups,
  getPresenceStatus,
  getPresenceSummary,
} from '../../logic/communityPresence';
import { formatLocalDateInput } from '../../logic/date';
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
import { ShareActions } from '../share/ShareActions';
import { CommunityMembersPanel } from './CommunityMembersPanel';
import { JoinCommunityByCode } from './JoinCommunityByCode';
import { CommunityDiscovery } from './CommunityDiscovery';
import { CreateCommunityModal } from './CreateCommunityModal';
import { exportCommunity } from './areas/exportCommunity';
import { Field } from './areas/Field';
import { UnsavedGuardProvider, useUnsavedGuard, type UnsavedGuard } from './unsavedGuard';
import { EmptyState } from '../../ui/EmptyState';
import { AthleteUsernameSearch } from './AthleteUsernameSearch';
import type { ScreenContract } from '@app/screens/screenContract';
import type {
  CommunitiesViewModel,
  CommunityTab,
} from '@app/screens/communitiesView/communitiesViewModel';
import type { CommunitiesViewIntent } from '@app/screens/communitiesView/communitiesViewIntents';

type PlayerFilter =
  | 'all'
  | 'active'
  | 'inactive'
  | 'frequent'
  | 'absent'
  | 'setters'
  | 'central'
  | 'wing'
  | 'libero'
  | 'limited';

interface CommunityPresenceApi {
  getPresence: (communityId: string) => import('../../types').CommunityPresence | null;
  setPresenceStatus: (
    communityId: string,
    playerId: string,
    status: CommunityPresenceStatus,
  ) => void;
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
  saveRules: (rules: CommunityRules, allowed?: boolean) => void;
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
  championships: Championship[];
  championshipTeams: ChampionshipTeam[];
  championshipRounds: ChampionshipRound[];
  presenceApi: CommunityPresenceApi;
  whatsAppApi: WhatsAppApi;
  rulesApi: RulesApi;
  onBack: () => void;
  onAddCommunity: (input: Partial<Community>) => Community;
  onUpdateCommunity: (communityId: string, patch: Partial<Community>, allowed?: boolean) => boolean;
  onDeleteCommunity: (communityId: string) => void;
  onDuplicateCommunity: (communityId: string, includeAthletes: boolean) => void;
  onUpdatePlayerCommunities: (communityId: string, playerIds: string[]) => void;
  onCreatePlayer: (name: string, communityId: string) => void;
  onCreateSession: (community: Community, playerIds: string[], rules: CommunityRules) => void;
  onViewSession: (sessionId: string) => void;
  onClearCommunityHistory: (communityId: string) => void;
  onCreateChampionship: (input: CreateChampionshipInput) => AppResult<unknown>;
  onMaterializeRound: (roundId: string) => AppResult<{ sessionId: string }>;
  onDeleteChampionship: (championshipId: string) => void;
  onRescheduleRound: (roundId: string, scheduledDate: string) => AppResult<unknown>;
  onSetRoundSkipped: (roundId: string, skipped: boolean) => AppResult<unknown>;
  onUpdateChampionshipRecurrence: (
    championshipId: string,
    recurrenceRule: Championship['recurrenceRule'],
  ) => AppResult<unknown>;
  currentUserId: string | null;
  isSupabaseConfigured: boolean;
  globalRole: AuthRole | null;
  onLinkedCloudPlayer?: (player: Player, communityId: string) => void;
}

const TAB_ITEMS: Array<{ id: CommunityTab; label: string }> = [{ id: 'summary', label: 'Resumo' }];

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
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatFormat(type?: string) {
  return type === 'tournament' ? 'Campeonato' : 'Jogo Livre';
}

export function CommunitiesView({
  contract,
}: {
  contract: ScreenContract<CommunitiesViewModel, CommunitiesViewIntent>;
}) {
  const { model, dispatch } = contract;
  const {
    communities,
    players,
    sessions,
    games,
    pointEvents,
    teams,
    sessionReports,
    championships,
    championshipTeams,
    championshipRounds,
    presenceApi,
    whatsAppApi,
    rulesApi,
    currentUserId,
    isSupabaseConfigured,
    globalRole,
    selectedCommunityId,
    initialCommunityTab,
    addCommunity,
    updateCommunity,
    createChampionship,
    materializeRound,
    rescheduleRound,
    setRoundSkipped,
    updateChampionshipRecurrence,
  } = model;
  const setSelectedCommunityId = (communityId: string | null) => {
    void dispatch({ kind: 'selectCommunity', communityId });
  };

  const [showArchived, setShowArchived] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const selectedCommunity =
    communities.find((community) => community.id === selectedCommunityId) || null;

  const visibleCommunities = useMemo(
    () => communities.filter((community) => showArchived || !community.archived),
    [communities, showArchived],
  );

  const handleAdd = () => setShowCreateModal(true);

  const handleCreate = (input: Partial<Community>) => {
    const community = addCommunity(input);
    setShowCreateModal(false);
    setSelectedCommunityId(community.id);
  };

  return (
    <div className="space-y-5 pb-24">
      {/* Quatro controles não cabem em 375px lado a lado: sem wrap a página
          inteira ganhava rolagem horizontal. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => dispatch({ kind: 'back' })}
          className="btn btn-ghost btn-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="label cursor-pointer gap-2 text-xs font-bold uppercase">
            <span>Arquivadas</span>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
          </label>
          {isSupabaseConfigured && currentUserId && (
            <>
              <button
                type="button"
                onClick={() => setShowDiscovery(true)}
                className="btn btn-ghost btn-sm"
              >
                <Search className="w-4 h-4" /> Procurar
              </button>
              <button
                type="button"
                onClick={() => setShowJoinModal(true)}
                className="btn btn-ghost btn-sm"
              >
                <KeyRound className="w-4 h-4" /> Entrar com código
              </button>
            </>
          )}
          <button type="button" onClick={handleAdd} className="btn btn-primary btn-sm">
            <Plus className="w-4 h-4" /> Nova
          </button>
        </div>
      </div>

      {showJoinModal && <JoinCommunityByCode onClose={() => setShowJoinModal(false)} />}
      {showDiscovery && <CommunityDiscovery onClose={() => setShowDiscovery(false)} />}
      {showCreateModal && (
        <CreateCommunityModal onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />
      )}

      <div>
        <h2 className="text-2xl font-black uppercase tracking-tight">Comunidades</h2>
        <p className="text-sm text-base-content/60">
          Central local dos grupos recorrentes de vôlei.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visibleCommunities.map((community) => (
          <React.Fragment key={community.id}>
            <CommunityCard
              community={community}
              players={players}
              sessions={sessions}
              games={games}
              pointEvents={pointEvents}
              sessionReports={sessionReports}
              onOpen={() => setSelectedCommunityId(community.id)}
              onCreateSession={() =>
                void dispatch({
                  kind: 'createSession',
                  community,
                  playerIds: getCommunityPlayers(community.id, players)
                    .filter((player) => player.ativo)
                    .map((player) => player.id),
                  rules: rulesApi.getRules(community),
                })
              }
              onUpdateCommunity={updateCommunity}
              onDuplicateCommunity={(communityId, includeAthletes) =>
                void dispatch({ kind: 'duplicateCommunity', communityId, includeAthletes })
              }
              onDeleteCommunity={(communityId) =>
                void dispatch({ kind: 'deleteCommunity', communityId })
              }
            />
          </React.Fragment>
        ))}
      </div>

      {/* Quem chega aqui vazio pode ser o organizador do grupo ou o atleta que foi
          convidado. Os dois precisam de porta própria, senão um deles fica parado. */}
      {visibleCommunities.length === 0 && (
        <EmptyState
          icon={Volleyball}
          title="A comunidade é a sua pelada por inteiro"
          description="É onde moram o elenco, as presenças, as regras da casa e o histórico de todas as sessões. Quem organiza cria a sua; quem foi chamado entra na do grupo e já aparece na lista da próxima."
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleAdd}
              className="btn btn-primary min-h-[48px] flex-1 gap-2 px-6 font-black uppercase tracking-wider"
            >
              <Plus className="h-5 w-5" /> Criar minha comunidade
            </button>
            {isSupabaseConfigured && currentUserId && (
              <button
                type="button"
                onClick={() => setShowDiscovery(true)}
                className="btn btn-outline min-h-[48px] flex-1 gap-2 px-6 font-bold uppercase tracking-wider"
              >
                <Search className="h-5 w-5" /> Procurar minha turma
              </button>
            )}
          </div>

          {isSupabaseConfigured && currentUserId && (
            <p className="text-xs leading-relaxed text-base-content/60">
              Recebeu um código de convite no grupo?{' '}
              <button
                type="button"
                onClick={() => setShowJoinModal(true)}
                className="link link-primary font-bold"
              >
                Entrar com código
              </button>
              .
            </p>
          )}
        </EmptyState>
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
  onUpdateCommunity: (communityId: string, patch: Partial<Community>) => boolean;
  onDuplicateCommunity: (communityId: string, includeAthletes: boolean) => void;
  onDeleteCommunity: (communityId: string) => void;
}) {
  const permissions = useCommunityPermissions(community);
  const summary = getCommunitySummary({
    community,
    players,
    sessions,
    games,
    pointEvents,
    sessionReports,
  });

  return (
    <div className="card card-border bg-base-200">
      <div className="card-body gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`badge badge-${community.archived ? 'neutral' : 'primary'} badge-soft`}
              >
                {community.archived ? 'Arquivada' : formatFormat(community.defaultFormat)}
              </span>
              <span className="badge badge-outline">{summary.activeAthletes} atletas</span>
            </div>
            <h3 className="card-title mt-2 text-lg uppercase">{community.name}</h3>
            <p className="text-sm text-base-content/60 line-clamp-2">
              {community.description || 'Sem descrição.'}
            </p>
          </div>
          <div className="dropdown dropdown-end">
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              aria-label="Ações da comunidade"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            <ul className="menu dropdown-content bg-base-200 rounded-box z-20 w-52 p-2 shadow-xl border border-base-300">
              <li>
                <button type="button" onClick={onOpen}>
                  Editar / abrir
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onDuplicateCommunity(community.id, true)}>
                  Duplicar com atletas
                </button>
              </li>
              {permissions.canEditRules && (
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateCommunity(community.id, { archived: !community.archived })
                    }
                  >
                    {community.archived ? 'Desarquivar' : 'Arquivar'}
                  </button>
                </li>
              )}
              <li>
                <button type="button" onClick={() => exportCommunity(community, players, sessions)}>
                  Exportar
                </button>
              </li>
              {permissions.canDeleteCommunity && (
                <li>
                  <button
                    type="button"
                    className="text-error"
                    onClick={() => onDeleteCommunity(community.id)}
                  >
                    Excluir
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="text-xs text-base-content/60 flex flex-col gap-1">
          <span className="inline-flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5" /> {community.defaultLocation || 'Local não informado'}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> {community.defaultDay || 'Dia não definido'}{' '}
            {community.defaultStartTime ? `- ${community.defaultStartTime}` : ''}
            {community.defaultEndTime ? ` as ${community.defaultEndTime}` : ''}
          </span>
        </div>

        <div className="stats stats-vertical sm:stats-horizontal bg-base-100">
          <div className="stat">
            <div className="stat-title">Sessões</div>
            <div className="stat-value text-lg">{summary.totalSessions}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Última sessão</div>
            <div className="stat-value text-lg">{formatDate(summary.lastSession?.date)}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Último MVP</div>
            <div className="stat-value text-sm">{summary.lastMvpName || '-'}</div>
          </div>
        </div>

        <div className="card-actions grid grid-cols-2 gap-2">
          <button type="button" onClick={onOpen} className="btn btn-outline btn-sm">
            Abrir
          </button>
          <button
            type="button"
            onClick={onCreateSession}
            disabled={!permissions.canCreateSession}
            className="btn btn-primary btn-sm"
          >
            Criar sessão
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Primeiro uso de uma comunidade. A sequência não é enfeite: sem atletas o
 * sorteio não roda, então marcar pelada fica travado até o elenco existir.
 */
