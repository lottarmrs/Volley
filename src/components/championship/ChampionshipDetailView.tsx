import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  Award,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Play,
  Shield,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { useShell } from '../../app/shellContext';
import { paths } from '../../application/appRoutes';
import { getSeasonStandings, getSeasonAwards } from '../../application/championshipUseCases';
import { calculateRecentForm } from '../../application/championshipGovernanceUseCases';
import { VolleyballCourtLineup } from './VolleyballCourtLineup';
import type { ChampionshipRound, ChampionshipTeam } from '../../types';

export function ChampionshipDetailView({ championshipId }: { championshipId?: string }) {
  const navigate = useNavigate();
  const { comm, play, championships, sess } = useShell();

  const [activeTab, setActiveTab] = useState<'tabela' | 'rodadas' | 'elencos' | 'premios'>('tabela');
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(0);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

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
  const roundNumbers = Array.from(new Set(rounds.map((r) => r.round))).sort((a, b) => a - b);
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
        <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(paths.ligas)}>
          Voltar para as Ligas
        </button>
      </div>
    );
  }

  const activeTeam = teams.find((t) => t.id === selectedTeamId) || teams[0];

  const handleDelete = () => {
    if (window.confirm(`Tem certeza que deseja excluir a liga "${championship.name}"?`)) {
      championships.deleteChampionship(championship.id);
      navigate(paths.ligas);
    }
  };

  const handleMaterializeRound = (round: ChampionshipRound) => {
    if (!community) return;
    const result = championships.materializeRound(round.id, community.id);
    if (result.ok) {
      navigate(paths.sessao(community.id, result.value.session.id));
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
            className="btn btn-ghost btn-sm btn-square"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="badge badge-primary badge-sm">{community?.name || 'Comunidade'}</span>
              <span className="badge badge-outline badge-sm">
                {championship.format === 'double_round_robin' ? 'Turno & Returno' : 'Turno Único'}
              </span>
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight mt-1">{championship.name}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost btn-xs text-error" onClick={handleDelete}>
            <Trash2 className="w-3.5 h-3.5" /> Excluir liga
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="tabs tabs-lifted">
        <button
          type="button"
          className={`tab ${activeTab === 'tabela' ? 'tab-active font-bold' : ''}`}
          onClick={() => setActiveTab('tabela')}
        >
          <Trophy className="w-4 h-4 mr-1.5" /> Tabela de Classificação
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'rodadas' ? 'tab-active font-bold' : ''}`}
          onClick={() => setActiveTab('rodadas')}
        >
          <Calendar className="w-4 h-4 mr-1.5" /> Calendário de Rodadas
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'elencos' ? 'tab-active font-bold' : ''}`}
          onClick={() => setActiveTab('elencos')}
        >
          <Users className="w-4 h-4 mr-1.5" /> Elencos & Quadra
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'premios' ? 'tab-active font-bold' : ''}`}
          onClick={() => setActiveTab('premios')}
        >
          <Award className="w-4 h-4 mr-1.5" /> Prêmios da Temporada
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
                      <td className="font-bold text-center">{idx + 1}º</td>
                      <td className="font-bold flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-primary" />
                        <span>{team?.name || 'Equipe'}</span>
                      </td>
                      <td className="text-center font-black text-primary text-sm">{st.classificationPoints}</td>
                      <td className="text-center font-semibold">{played}</td>
                      <td className="text-center text-success font-bold">{st.wins}</td>
                      <td className="text-center text-error font-bold">{st.losses}</td>
                      <td className="text-center font-bold">{st.pointDifference > 0 ? `+${st.pointDifference}` : st.pointDifference}</td>
                      <td className="text-center">{st.pointsFor}</td>
                      <td className="text-center">{st.pointsAgainst}</td>
                      <td className="text-center font-black">{aproveitamento}%</td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {recentForm.length === 0 && <span className="text-base-content/40">-</span>}
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
              className="btn btn-ghost btn-sm"
              disabled={selectedRoundIndex === 0}
              onClick={() => setSelectedRoundIndex((prev) => Math.max(0, prev - 1))}
            >
              <ChevronLeft className="w-4 h-4" /> Rodada Anterior
            </button>
            <span className="font-black text-sm uppercase">
              {currentRoundNumber}ª RODADA DE {roundNumbers.length}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={selectedRoundIndex >= roundNumbers.length - 1}
              onClick={() => setSelectedRoundIndex((prev) => Math.min(roundNumbers.length - 1, prev + 1))}
            >
              Próxima Rodada <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Matches List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentRoundMatches.map((match) => {
              const teamA = teams.find((t) => t.id === match.teamAId);
              const teamB = teams.find((t) => t.id === match.teamBId);
              const dateStr = new Date(match.scheduledDate).toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={match.id} className="card card-border bg-base-200 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-base-content/60">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {dateStr}
                    </span>
                    {match.sessionId ? (
                      <span className="badge badge-success badge-xs">Realizado</span>
                    ) : (
                      <span className="badge badge-warning badge-xs">Agendado</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 border-y border-base-300">
                    <span className="font-black text-sm w-5/12 truncate">{teamA?.name}</span>
                    <span className="badge badge-ghost font-black text-xs">VS</span>
                    <span className="font-black text-sm w-5/12 truncate text-right">{teamB?.name}</span>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {match.sessionId ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={() => community && navigate(paths.sessao(community.id, match.sessionId!))}
                      >
                        Ver Sessão
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-success btn-xs gap-1"
                        onClick={() => handleMaterializeRound(match)}
                      >
                        <Play className="w-3 h-3" /> Materializar & Jogar
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
              className="select select-bordered select-sm"
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
          <AwardCard title="MVP da Liga" winner={awards?.mvp} icon={<Trophy className="w-5 h-5 text-warning" />} />
          <AwardCard title="Melhor Levantador" winner={awards?.awardsByPosition?.levantador} />
          <AwardCard title="Melhor Ponteiro" winner={awards?.awardsByPosition?.ponteiro} />
          <AwardCard title="Melhor Central" winner={awards?.awardsByPosition?.central} />
          <AwardCard title="Melhor Oposto" winner={awards?.awardsByPosition?.oposto} />
          <AwardCard title="Melhor Líbero" winner={awards?.awardsByPosition?.libero} />
        </div>
      )}
    </div>
  );
}

function AwardCard({ title, winner, icon }: { title: string; winner?: any; icon?: React.ReactNode }) {
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
