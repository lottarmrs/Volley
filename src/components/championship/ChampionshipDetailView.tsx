import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Gavel,
  Play,
  Shield,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { useShell } from '../../app/shellContext';
import { paths } from '../../application/appRoutes';
import { getSeasonStandings, getSeasonAwards } from '../../application/championshipUseCases';
import {
  acceptChampionshipRequest,
  approveChampionshipRequest,
  calculateRecentForm,
  rejectChampionshipRequest,
} from '../../application/championshipGovernanceUseCases';
import { VolleyballCourtLineup } from './VolleyballCourtLineup';
import type { ChampionshipRequest, ChampionshipRound, ChampionshipTeam } from '../../types';

export function ChampionshipDetailView({ championshipId }: { championshipId?: string }) {
  const navigate = useNavigate();
  const {
    comm,
    play,
    championships,
    sess,
    auth,
    deleteChampionshipAggregate,
    materializeChampionshipRound,
  } = useShell();

  const [activeTab, setActiveTab] = useState<
    'tabela' | 'rodadas' | 'elencos' | 'premios' | 'governanca'
  >('tabela');
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(0);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [pedidoRodadaId, setPedidoRodadaId] = useState('');
  const [pedidoData, setPedidoData] = useState('');
  const [pedidoTimeId, setPedidoTimeId] = useState('');
  const [erroGovernanca, setErroGovernanca] = useState<string | null>(null);

  const championship = championships.championships.find((c) => c.id === championshipId);
  const teams = useMemo(
    () => championships.championshipTeams.filter((t) => t.championshipId === championshipId),
    [championships.championshipTeams, championshipId],
  );
  const rounds = useMemo(
    () =>
      championships.championshipRounds
        .filter((r) => r.championshipId === championshipId)
        .sort((a, b) => a.round - b.round),
    [championships.championshipRounds, championshipId],
  );

  const community = comm.communities.find((c) => c.id === championship?.communityId);

  // Group Rounds
  const roundNumbers = Array.from(new Set(rounds.map((r) => r.round))).sort(
    (a: number, b: number) => a - b,
  );
  const currentRoundNumber = roundNumbers[selectedRoundIndex] || 1;
  const currentRoundMatches = rounds.filter((r) => r.round === currentRoundNumber);

  // Standings
  const standings = useMemo(() => {
    if (!championship) return [];
    return getSeasonStandings({
      championshipTeamIds: teams.map((t) => t.id),
      classificationPoints: championship.classificationPoints,
      sessionTeams: sess?.teams || [],
      games: sess?.games || [],
    });
  }, [championship, teams, sess?.teams, sess?.games]);

  // Awards
  const awards = useMemo(() => {
    if (!championship) return null;
    return getSeasonAwards(
      sess?.pointEvents || [],
      play?.players || [],
      sess?.teams || [],
      teams.map((t) => t.id),
      championship.classificationPoints,
      sess?.games || [],
      teams,
    );
  }, [championship, teams, sess?.pointEvents, sess?.teams, sess?.games, play?.players]);

  if (!championship) {
    return (
      <div className="card card-border bg-base-200 p-8 text-center space-y-4 my-8">
        <Trophy className="w-12 h-12 text-base-content/30 mx-auto" />
        <h3 className="text-lg font-bold">Liga não encontrada</h3>
        <button
          type="button"
          className="btn btn-primary min-h-[44px] px-4"
          onClick={() => navigate(paths.ligas)}
        >
          Voltar para as Ligas
        </button>
      </div>
    );
  }

  const activeTeam = teams.find((t) => t.id === selectedTeamId) || teams[0];

  const handleDelete = () => {
    if (
      window.confirm(
        `Excluir a liga "${championship.name}"? A classificação, as rodadas e os times inscritos vão junto, e não dá para desfazer. As peladas já jogadas continuam no histórico da comunidade.`,
      )
    ) {
      deleteChampionshipAggregate(championship.id);
      navigate(paths.ligas);
    }
  };

  const requests = (championships.championshipRequests || []).filter(
    (r) => r.championshipId === championship.id,
  );
  const rodadasRemarcaveis = rounds.filter((r) => !r.sessionId);
  const atorId = auth?.user?.id || 'organizador-local';

  const handleCriarPedido = () => {
    setErroGovernanca(null);
    if (!pedidoRodadaId || !pedidoTimeId) {
      setErroGovernanca('Escolha a rodada e a equipe que está pedindo a remarcação.');
      return;
    }
    if (!pedidoData || Number.isNaN(new Date(pedidoData).getTime())) {
      setErroGovernanca('Informe a nova data proposta para a rodada.');
      return;
    }
    championships.createRequest({
      championshipId: championship.id,
      kind: 'reschedule_round',
      requestedByPlayerId: atorId,
      requestedByTeamId: pedidoTimeId,
      roundId: pedidoRodadaId,
      proposedDate: pedidoData,
    });
    setPedidoRodadaId('');
    setPedidoData('');
    setPedidoTimeId('');
  };

  const handleResolverPedido = (
    requestId: string,
    transicao: (request: ChampionshipRequest) => ChampionshipRequest,
  ) => {
    setErroGovernanca(null);
    const result = championships.resolveRequest(requestId, transicao);
    if (!result.ok) setErroGovernanca(result.error.message);
  };

  const handleAprovarPedido = (request: ChampionshipRequest) => {
    setErroGovernanca(null);
    // A remarcacao vem ANTES da aprovacao de proposito: `rescheduleRound` recusa
    // rodada ja materializada. Aprovar primeiro deixaria a solicitacao marcada
    // como aprovada com a data velha na tabela.
    if (request.kind === 'reschedule_round' && request.roundId && request.proposedDate) {
      const remarcacao = championships.rescheduleRound(request.roundId, request.proposedDate);
      if (!remarcacao.ok) {
        setErroGovernanca(remarcacao.error.message);
        return;
      }
    }
    handleResolverPedido(request.id, (r) => approveChampionshipRequest(r, atorId));
  };

  const handleMaterializeRound = (round: ChampionshipRound) => {
    if (!community) return;
    const result = materializeChampionshipRound(round.id);
    if (result.ok) {
      navigate(paths.sessao(community.id, result.value.sessionId));
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-base-300 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(paths.ligas)}
            className="btn btn-ghost btn-circle min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Voltar para Ligas"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="badge badge-primary badge-sm font-bold uppercase tracking-wider">
                {community?.name || 'Comunidade'}
              </span>
              <span className="badge badge-outline badge-sm font-bold uppercase tracking-wider">
                {championship.format === 'double_round_robin' ? 'Turno & Returno' : 'Turno Único'}
              </span>
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight mt-1 text-base-content">
              {championship.name}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost min-h-[44px] px-3 text-xs font-bold uppercase tracking-wider text-error hover:bg-error/10 flex items-center gap-1.5"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4" /> Excluir liga
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="tabs tabs-lifted flex-wrap">
        <button
          type="button"
          className={`tab min-h-[44px] px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'tabela' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('tabela')}
        >
          <Trophy className="w-4 h-4 text-warning" /> Tabela de Classificação
        </button>
        <button
          type="button"
          className={`tab min-h-[44px] px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'rodadas' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('rodadas')}
        >
          <Calendar className="w-4 h-4 text-info" /> Calendário de Rodadas
        </button>
        <button
          type="button"
          className={`tab min-h-[44px] px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'elencos' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('elencos')}
        >
          <Users className="w-4 h-4 text-primary" /> Elencos & Quadra
        </button>
        <button
          type="button"
          className={`tab min-h-[44px] px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'premios' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('premios')}
        >
          <Award className="w-4 h-4 text-accent" /> Prêmios da Temporada
        </button>
        <button
          type="button"
          className={`tab min-h-[44px] px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${activeTab === 'governanca' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('governanca')}
        >
          <Gavel className="w-4 h-4 text-secondary" /> Governança & Solicitações
          {requests.filter((r) => r.status === 'pending').length > 0 && (
            <span className="badge badge-warning badge-sm font-black font-mono">
              {requests.filter((r) => r.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: TABELA DE CLASSIFICAÇÃO (Inspired by tabelacampeonato PHP clone) */}
      {activeTab === 'tabela' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100 shadow">
            <table className="table table-zebra table-compact w-full text-xs">
              <thead className="bg-base-200 uppercase font-black">
                <tr>
                  <th className="w-8">#</th>
                  <th>Equipe</th>
                  <th className="text-center font-black text-primary">P</th>
                  <th className="text-center">J</th>
                  <th className="text-center">V</th>
                  <th className="text-center">D</th>
                  <th className="text-center">SP</th>
                  <th className="text-center">PP</th>
                  <th className="text-center">PC</th>
                  <th className="text-center font-bold">Aproveit.</th>
                  <th className="text-center">Ult. Jogos</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((st, idx) => {
                  const team = teams.find((t) => t.id === st.teamId);
                  const played = st.wins + st.losses;
                  const aproveitamento = played > 0 ? ((st.wins / played) * 100).toFixed(0) : '0';
                  const recentForm = calculateRecentForm(st.teamId, sess?.games || []);

                  return (
                    <tr key={st.teamId} className="hover">
                      <td className="text-center font-bold font-mono">{idx + 1}º</td>
                      <td className="font-bold flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-primary" />
                        <span>{team?.name || 'Equipe'}</span>
                      </td>
                      <td className="text-center font-black font-mono text-primary text-sm">
                        {st.classificationPoints}
                      </td>
                      <td className="text-center font-semibold font-mono">{played}</td>
                      <td className="text-center font-mono text-success font-bold">{st.wins}</td>
                      <td className="text-center font-mono text-error font-bold">{st.losses}</td>
                      <td className="text-center font-bold font-mono">
                        {st.pointDifference > 0 ? `+${st.pointDifference}` : st.pointDifference}
                      </td>
                      <td className="text-center font-mono">{st.pointsFor}</td>
                      <td className="text-center font-mono">{st.pointsAgainst}</td>
                      <td className="text-center font-black font-mono">{aproveitamento}%</td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {recentForm.length === 0 && (
                            <span className="text-base-content/40">-</span>
                          )}
                          {recentForm.map((f, i) => (
                            <span
                              key={i}
                              className={`badge badge-xs font-black uppercase ${
                                f === 'v' ? 'badge-success' : 'badge-error'
                              }`}
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: RODADAS & CALENDÁRIO */}
      {activeTab === 'rodadas' && (
        <div className="space-y-4">
          {/* Round Selector Bar */}
          <div className="flex items-center justify-between card card-border bg-base-200 p-3">
            <button
              type="button"
              className="btn btn-ghost min-h-[44px] px-3 text-xs font-bold uppercase tracking-wider flex items-center gap-1"
              disabled={selectedRoundIndex === 0}
              onClick={() => setSelectedRoundIndex((prev) => Math.max(0, prev - 1))}
            >
              <ChevronLeft className="w-4 h-4" /> Rodada Anterior
            </button>
            <span className="font-black text-sm uppercase tracking-wider text-base-content font-mono">
              {currentRoundNumber}ª RODADA DE {roundNumbers.length}
            </span>
            <button
              type="button"
              className="btn btn-ghost min-h-[44px] px-3 text-xs font-bold uppercase tracking-wider flex items-center gap-1"
              disabled={selectedRoundIndex >= roundNumbers.length - 1}
              onClick={() =>
                setSelectedRoundIndex((prev) => Math.min(roundNumbers.length - 1, prev + 1))
              }
            >
              Próxima Rodada <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Matches List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentRoundMatches.map((match) => {
              const teamA = teams.find((t) => t.id === match.teamAId);
              const teamB = teams.find((t) => t.id === match.teamBId);
              let dateStr = 'Data não definida';
              if (match.scheduledDate) {
                try {
                  const d = new Date(match.scheduledDate);
                  if (!isNaN(d.getTime())) {
                    dateStr = d.toLocaleDateString('pt-BR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                  }
                } catch {
                  dateStr = match.scheduledDate;
                }
              }

              return (
                <div key={match.id} className="card card-border bg-base-200 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-base-content/60">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-accent" /> {dateStr}
                    </span>
                    {match.sessionId ? (
                      <span className="badge badge-success badge-sm font-bold uppercase">
                        Realizado
                      </span>
                    ) : (
                      <span className="badge badge-warning badge-sm font-bold uppercase">
                        Agendado
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 border-y border-base-300">
                    <span className="font-black text-sm w-5/12 truncate text-base-content">
                      {teamA?.name}
                    </span>
                    <span className="badge badge-ghost font-black text-xs">VS</span>
                    <span className="font-black text-sm w-5/12 truncate text-right text-base-content">
                      {teamB?.name}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {match.sessionId ? (
                      <button
                        type="button"
                        className="btn btn-primary min-h-[44px] px-4 text-xs font-bold uppercase tracking-wider shadow-md shadow-primary/20"
                        onClick={() =>
                          community && navigate(paths.sessao(community.id, match.sessionId!))
                        }
                      >
                        Ver Sessão
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-success min-h-[44px] px-4 text-xs font-bold uppercase tracking-wider gap-1.5 shadow-md shadow-success/20"
                        onClick={() => handleMaterializeRound(match)}
                      >
                        <Play className="w-4 h-4 fill-current" /> Materializar & Jogar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: ELENCOS & QUADRA VISUAL */}
      {activeTab === 'elencos' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold uppercase">Selecione a Equipe:</label>
            <select
              className="select select-bordered min-h-[44px]"
              value={activeTeam?.id || ''}
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {activeTeam && <VolleyballCourtLineup team={activeTeam} players={play?.players || []} />}
        </div>
      )}

      {/* TAB 4: PRÊMIOS DA TEMPORADA */}
      {activeTab === 'premios' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <AwardCard
            title="MVP da Liga"
            winner={awards?.mvp}
            icon={<Trophy className="w-5 h-5 text-warning" />}
          />
          <AwardCard title="Melhor Levantador" winner={awards?.awardsByPosition?.levantador} />
          <AwardCard title="Melhor Ponteiro" winner={awards?.awardsByPosition?.ponteiro} />
          <AwardCard title="Melhor Central" winner={awards?.awardsByPosition?.central} />
          <AwardCard title="Melhor Oposto" winner={awards?.awardsByPosition?.oposto} />
          <AwardCard title="Melhor Líbero" winner={awards?.awardsByPosition?.libero} />
        </div>
      )}

      {/* TAB 5: GOVERNANÇA & SOLICITAÇÕES */}
      {activeTab === 'governanca' && (
        <div className="space-y-6">
          {erroGovernanca && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-error/40 bg-error/10 p-3 text-xs leading-relaxed text-error"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erroGovernanca}</span>
            </div>
          )}

          <div className="card card-border bg-base-200 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-base-content">
                Pedir remarcação de rodada
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-base-content/60">
                O capitão propõe a nova data. A remarcação só entra na tabela depois que a liga
                aprova.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="form-control">
                <span className="label text-xs font-bold uppercase">Rodada</span>
                <select
                  className="select select-bordered min-h-[44px]"
                  value={pedidoRodadaId}
                  onChange={(e) => setPedidoRodadaId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {rodadasRemarcaveis.map((r) => {
                    const a = teams.find((t) => t.id === r.teamAId)?.name || 'Equipe A';
                    const b = teams.find((t) => t.id === r.teamBId)?.name || 'Equipe B';
                    return (
                      <option key={r.id} value={r.id}>
                        {r.round}ª — {a} vs {b}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="form-control">
                <span className="label text-xs font-bold uppercase">Equipe solicitante</span>
                <select
                  className="select select-bordered min-h-[44px]"
                  value={pedidoTimeId}
                  onChange={(e) => setPedidoTimeId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-control">
                <span className="label text-xs font-bold uppercase">Nova data</span>
                <input
                  type="datetime-local"
                  className="input input-bordered min-h-[44px]"
                  value={pedidoData}
                  onChange={(e) => setPedidoData(e.target.value)}
                />
              </label>
            </div>

            {rodadasRemarcaveis.length === 0 ? (
              <p className="text-xs text-base-content/50">
                Todas as rodadas já foram materializadas — uma rodada que virou sessão mantém a data
                original.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleCriarPedido}
                className="btn btn-primary min-h-[44px] w-fit px-4 text-xs font-black uppercase tracking-wider"
              >
                Registrar solicitação
              </button>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-base-content">
              Solicitações da liga
            </h3>

            {requests.length === 0 && (
              <div className="card card-border border-dashed bg-base-200 py-10 text-center">
                <Gavel className="mx-auto h-8 w-8 text-base-content/30" />
                <p className="mt-2 text-sm font-bold">Nenhuma solicitação até agora</p>
                <p className="mt-1 text-xs text-base-content/60">
                  Pedidos de remarcação feitos pelos capitães aparecem aqui para aprovação.
                </p>
              </div>
            )}

            {requests.map((request) => {
              const round = rounds.find((r) => r.id === request.roundId);
              const solicitante = teams.find((t) => t.id === request.requestedByTeamId);
              const aberta = request.status === 'pending' || request.status === 'accepted';

              return (
                <div key={request.id} className="card card-border bg-base-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-black uppercase text-base-content">
                      {round ? `${round.round}ª rodada` : 'Rodada removida'}
                    </span>
                    <span
                      className={`badge badge-sm font-black uppercase ${
                        request.status === 'approved'
                          ? 'badge-success'
                          : request.status === 'rejected'
                            ? 'badge-error'
                            : request.status === 'accepted'
                              ? 'badge-info'
                              : 'badge-warning'
                      }`}
                    >
                      {STATUS_LABEL[request.status]}
                    </span>
                  </div>

                  <dl className="grid grid-cols-1 gap-1 text-xs text-base-content/70 sm:grid-cols-2">
                    <div>
                      <dt className="inline font-bold uppercase">Pedido por: </dt>
                      <dd className="inline">{solicitante?.name || 'Equipe removida'}</dd>
                    </div>
                    <div>
                      <dt className="inline font-bold uppercase">Nova data: </dt>
                      <dd className="inline font-mono">
                        {request.proposedDate
                          ? new Date(request.proposedDate).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </dd>
                    </div>
                  </dl>

                  {aberta && (
                    <div className="flex flex-wrap gap-2 border-t border-base-300 pt-3">
                      {request.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() =>
                            handleResolverPedido(request.id, (r) =>
                              acceptChampionshipRequest(r, atorId),
                            )
                          }
                          className="btn btn-outline min-h-[44px] px-4 text-xs font-bold uppercase tracking-wider"
                        >
                          Adversário aceita
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAprovarPedido(request)}
                        className="btn btn-success min-h-[44px] px-4 text-xs font-black uppercase tracking-wider"
                      >
                        Aprovar e remarcar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolverPedido(request.id, rejectChampionshipRequest)}
                        className="btn btn-ghost min-h-[44px] px-4 text-xs font-bold uppercase tracking-wider text-error hover:bg-error/10"
                      >
                        Recusar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<ChampionshipRequest['status'], string> = {
  pending: 'Aguardando adversário',
  accepted: 'Aceita — falta aprovar',
  approved: 'Aprovada',
  rejected: 'Recusada',
};

function AwardCard({
  title,
  winner,
  icon,
}: {
  title: string;
  winner?: any;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card card-border bg-base-200 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase text-base-content/60">{title}</span>
        {icon || <Award className="w-4 h-4 text-primary" />}
      </div>
      {winner ? (
        <div>
          <p className="font-black text-lg">{winner.player?.nome}</p>
          <p className="text-xs text-base-content/60">{winner.totalPoints} pontos marcados</p>
        </div>
      ) : (
        <p className="text-xs text-base-content/40 italic">Aguardando mais jogos...</p>
      )}
    </div>
  );
}
