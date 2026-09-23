import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Save,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Plus,
  Repeat,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import type {
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
  Community,
  Game,
  Player,
  PointEvent,
  Team,
} from '../../../types';
import type { AppResult } from '../../../application/appResult';
import type { CreateChampionshipInput } from '../../../application/championshipUseCases';
import { getSeasonAwards, getSeasonStandings } from '../../../application/championshipUseCases';
import { formatLocalDateInput } from '../../../logic/date';
import { getCommunityPlayers, getPlayerDisplayName } from '../../../logic/community';
import { EmptyState } from '../../../ui/EmptyState';
import { Link } from 'react-router';
import { paths } from '@app/appRoutes';
import { generateUUID } from '../../../logic/uuid';
import type { AwardWinner } from '../../../logic/tournament';
import { Field } from './Field';

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
];

type ChampionshipTeamDraft = { id: string; name: string; playerIds: string[] };

function makeChampionshipTeamDraft(index: number): ChampionshipTeamDraft {
  return { id: generateUUID(), name: `Time ${index}`, playerIds: [] };
}

function formatScheduledDate(value?: string) {
  if (!value) return 'Data não definida';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CommunityLeaguesArea({
  community,
  players,
  games,
  pointEvents,
  sessionTeams,
  championships,
  championshipTeams,
  championshipRounds,
  canManage,
  onCreateChampionship,
  onMaterializeRound,
  onDeleteChampionship,
  onRescheduleRound,
  onSetRoundSkipped,
  onUpdateChampionshipRecurrence,
}: {
  community: Community;
  players: Player[];
  games: Game[];
  pointEvents: PointEvent[];
  sessionTeams: Team[];
  championships: Championship[];
  championshipTeams: ChampionshipTeam[];
  championshipRounds: ChampionshipRound[];
  canManage: boolean;
  onCreateChampionship: (input: CreateChampionshipInput) => AppResult<unknown>;
  onMaterializeRound: (roundId: string) => AppResult<{ sessionId: string }>;
  onDeleteChampionship: (championshipId: string) => void;
  onRescheduleRound: (roundId: string, scheduledDate: string) => AppResult<unknown>;
  onSetRoundSkipped: (roundId: string, skipped: boolean) => AppResult<unknown>;
  onUpdateChampionshipRecurrence: (
    championshipId: string,
    recurrenceRule: Championship['recurrenceRule'],
  ) => AppResult<unknown>;
}) {
  const communityChampionships = useMemo(
    () => championships.filter((item) => item.communityId === community.id && !item.deletedAt),
    [championships, community.id],
  );
  const [selectedChampionshipId, setSelectedChampionshipId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'round_robin' | 'double_round_robin'>('round_robin');
  const [startDate, setStartDate] = useState(formatLocalDateInput());
  const [time, setTime] = useState(community.defaultStartTime || '20:00');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [teamDrafts, setTeamDrafts] = useState<ChampionshipTeamDraft[]>(() => [
    makeChampionshipTeamDraft(1),
    makeChampionshipTeamDraft(2),
  ]);
  const [formMessage, setFormMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [roundMessage, setRoundMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const selectedChampionship =
    communityChampionships.find((item) => item.id === selectedChampionshipId) ||
    communityChampionships[0] ||
    null;
  const selectedTeams = selectedChampionship
    ? championshipTeams.filter((team) => team.championshipId === selectedChampionship.id)
    : [];
  const selectedRounds = selectedChampionship
    ? championshipRounds
        .filter((round) => round.championshipId === selectedChampionship.id)
        .sort((a, b) => a.round - b.round || a.scheduledDate.localeCompare(b.scheduledDate))
    : [];
  const nextRound = selectedRounds.find((round) => !round.sessionId && !round.skipped);
  const seasonSessionIds = new Set(
    selectedRounds.flatMap((round) => (!round.skipped && round.sessionId ? [round.sessionId] : [])),
  );
  const seasonSessionTeams = sessionTeams.filter((team) => seasonSessionIds.has(team.sessionId));
  const seasonGames = games.filter((game) => seasonSessionIds.has(game.sessionId));
  const seasonPointEvents = pointEvents.filter((event) => seasonSessionIds.has(event.sessionId));
  const standings = selectedChampionship
    ? getSeasonStandings({
        championshipTeamIds: selectedTeams.map((team) => team.id),
        classificationPoints: selectedChampionship.classificationPoints,
        sessionTeams: seasonSessionTeams,
        games: seasonGames,
      })
    : [];
  const seasonAwards = selectedChampionship
    ? getSeasonAwards(
        seasonPointEvents,
        players,
        seasonSessionTeams,
        selectedTeams.map((team) => team.id),
        selectedChampionship.classificationPoints,
        seasonGames,
        selectedTeams,
      )
    : null;

  const resetForm = () => {
    setName('');
    setFormat('round_robin');
    setStartDate(formatLocalDateInput());
    setTime(community.defaultStartTime || '20:00');
    setDaysOfWeek([]);
    setTeamDrafts([makeChampionshipTeamDraft(1), makeChampionshipTeamDraft(2)]);
  };

  const togglePlayer = (teamId: string, playerId: string, checked: boolean) => {
    setTeamDrafts((current) =>
      current.map((team) => ({
        ...team,
        playerIds:
          team.id === teamId && checked
            ? [...team.playerIds.filter((id) => id !== playerId), playerId]
            : team.playerIds.filter((id) => id !== playerId),
      })),
    );
  };

  const submitChampionship = (event: React.FormEvent) => {
    event.preventDefault();
    setFormMessage(null);
    if (!name.trim() || !startDate || !time || daysOfWeek.length === 0) {
      setFormMessage({ kind: 'error', text: 'Preencha nome, início, horário e recorrência.' });
      return;
    }
    if (teamDrafts.some((team) => !team.name.trim() || team.playerIds.length === 0)) {
      setFormMessage({ kind: 'error', text: 'Cada time precisa de nome e ao menos um atleta.' });
      return;
    }

    const result = onCreateChampionship({
      communityId: community.id,
      name: name.trim(),
      format,
      classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
      recurrenceRule: {
        daysOfWeek: [...daysOfWeek].sort((a, b) => a - b),
        time,
        startDate,
        endDate: null,
      },
      teams: teamDrafts.map((team) => ({ ...team, name: team.name.trim() })),
    });
    if (result.ok === false) {
      setFormMessage({ kind: 'error', text: result.error.message });
      return;
    }

    setFormMessage({ kind: 'success', text: 'Liga criada e calendário gerado.' });
    setShowCreateForm(false);
    resetForm();
  };

  const awardCards: Array<[string, AwardWinner | undefined]> = seasonAwards
    ? [
        ['Ataque', seasonAwards.awards.attack],
        ['Bloqueio', seasonAwards.awards.block],
        ['Saque', seasonAwards.awards.serve],
        ['Levantamento', seasonAwards.awards.setter],
        ['Defesa', seasonAwards.awards.defense],
        ['Passe', seasonAwards.awards.reception],
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Banner Hub Standalone */}
      <div className="card card-border bg-gradient-to-r from-primary/10 via-base-200 to-base-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-primary/30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-black">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-black uppercase text-sm">Hub Standalone de Ligas de Vôlei</h4>
            <p className="text-xs text-base-content/60">
              Acesse a nova página dedicada com visão de quadra em perspectiva, tabela de
              aproveitamento e gestão de elencos.
            </p>
          </div>
        </div>
        <Link to={paths.ligas} className="btn btn-primary btn-sm shrink-0">
          Abrir Hub de Ligas <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight">Ligas por pontos corridos</h3>
          <p className="text-sm text-base-content/60">
            Calendário recorrente, classificação e premiações da temporada.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!canManage}
          onClick={() => {
            setShowCreateForm((current) => !current);
            setFormMessage(null);
          }}
        >
          <Plus className="w-4 h-4" /> Criar liga
        </button>
      </div>

      {!canManage && (
        <div role="alert" className="alert alert-warning alert-soft">
          <ShieldAlert className="w-4 h-4" />
          <span>Modo de leitura: apenas gestores podem criar ligas e materializar rodadas.</span>
        </div>
      )}

      {showCreateForm && (
        <form className="card card-border bg-base-200" onSubmit={submitChampionship}>
          <div className="card-body gap-5">
            <div>
              <h4 className="card-title text-base uppercase">Nova liga</h4>
              <p className="text-xs text-base-content/60">
                Cada atleta pode pertencer a um único time nesta temporada.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome da liga" value={name} onChange={setName} />
              <label className="form-control">
                <span className="label-text">Formato</span>
                <select
                  className="select select-bordered"
                  value={format}
                  onChange={(event) =>
                    setFormat(event.target.value as 'round_robin' | 'double_round_robin')
                  }
                >
                  <option value="round_robin">Turno único</option>
                  <option value="double_round_robin">Turno e returno</option>
                </select>
              </label>
              <Field label="Data inicial" type="date" value={startDate} onChange={setStartDate} />
              <Field label="Horário" type="time" value={time} onChange={setTime} />
            </div>

            <fieldset>
              <legend className="text-sm font-bold mb-2">Dias das rodadas</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <label
                    key={day.value}
                    className="label cursor-pointer gap-2 rounded-box border border-base-300 px-3"
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary checkbox-sm"
                      checked={daysOfWeek.includes(day.value)}
                      onChange={(event) =>
                        setDaysOfWeek((current) =>
                          event.target.checked
                            ? [...current, day.value]
                            : current.filter((value) => value !== day.value),
                        )
                      }
                    />
                    <span className="label-text">{day.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-bold">Times e elencos</h4>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() =>
                    setTeamDrafts((current) => [
                      ...current,
                      makeChampionshipTeamDraft(current.length + 1),
                    ])
                  }
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar time
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {teamDrafts.map((team, teamIndex) => (
                  <div
                    key={team.id}
                    className="rounded-box border border-base-300 bg-base-100 p-3 space-y-3"
                  >
                    <div className="flex items-end gap-2">
                      <div className="grow">
                        <Field
                          label={`Nome do time ${teamIndex + 1}`}
                          value={team.name}
                          onChange={(value) =>
                            setTeamDrafts((current) =>
                              current.map((item) =>
                                item.id === team.id ? { ...item, name: value } : item,
                              ),
                            )
                          }
                        />
                      </div>
                      {teamDrafts.length > 2 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-square btn-sm text-error"
                          aria-label={`Remover time ${teamIndex + 1}`}
                          onClick={() =>
                            setTeamDrafts((current) =>
                              current.filter((item) => item.id !== team.id),
                            )
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                      {players.map((player) => {
                        const playerName = getPlayerDisplayName(player);
                        return (
                          <label
                            key={player.id}
                            className="label cursor-pointer justify-start gap-2 py-1"
                          >
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm"
                              aria-label={`${playerName} no time ${teamIndex + 1}`}
                              checked={team.playerIds.includes(player.id)}
                              onChange={(event) =>
                                togglePlayer(team.id, player.id, event.target.checked)
                              }
                            />
                            <span className="label-text">{playerName}</span>
                          </label>
                        );
                      })}
                    </div>
                    <span className="text-xs text-base-content/50">
                      {team.playerIds.length} atleta(s)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {formMessage && (
              <div
                role="alert"
                className={`alert ${formMessage.kind === 'error' ? 'alert-error' : 'alert-success'} alert-soft`}
              >
                {formMessage.text}
              </div>
            )}
            <div className="card-actions justify-end">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowCreateForm(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                <Save className="w-4 h-4" /> Salvar liga
              </button>
            </div>
          </div>
        </form>
      )}

      {formMessage?.kind === 'success' && !showCreateForm && (
        <div role="status" className="alert alert-success alert-soft">
          {formMessage.text}
        </div>
      )}

      {communityChampionships.length === 0 ? (
        <div>
          <EmptyState
            icon={Trophy}
            size="compact"
            title="Uma temporada dentro da comunidade"
            description="A liga pega os times que você inscrever e gera os confrontos e as datas sozinha, rodada a rodada. A classificação se atualiza a cada pelada encerrada — você marca ponto como sempre e a tabela anda."
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {communityChampionships.map((item) => {
              const itemRounds = championshipRounds.filter(
                (round) => round.championshipId === item.id,
              );
              const itemNextRound = itemRounds
                .filter((round) => !round.sessionId && !round.skipped)
                .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];
              const isSelected = item.id === selectedChampionship?.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={`card card-border text-left transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'bg-base-200 hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedChampionshipId(item.id)}
                >
                  <div className="card-body p-4 gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="card-title text-base" role="heading">
                        {item.name}
                      </h4>
                      <span className="badge badge-primary badge-soft">Ativa</span>
                    </div>
                    <span className="text-xs uppercase font-bold text-base-content/50">
                      {item.format === 'double_round_robin' ? 'Turno e returno' : 'Turno único'}
                    </span>
                    <span className="text-sm inline-flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      {itemNextRound
                        ? formatScheduledDate(itemNextRound.scheduledDate)
                        : 'Todas as rodadas materializadas'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedChampionship && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="card card-border bg-base-200">
                  <div className="card-body p-4 gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-black uppercase">Rodadas</h4>
                      <span className="badge badge-outline">
                        {selectedRounds.filter((round) => round.sessionId).length}/
                        {selectedRounds.length}
                      </span>
                    </div>
                    {nextRound && (
                      <div className="alert alert-info alert-soft">
                        <Calendar className="w-4 h-4" />
                        <span>
                          Próxima: rodada {nextRound.round} em{' '}
                          {formatScheduledDate(nextRound.scheduledDate)}
                        </span>
                      </div>
                    )}
                    <div key={selectedChampionship.id}>
                      <RecurrenceControls
                        championship={selectedChampionship}
                        canManage={canManage}
                        onUpdate={onUpdateChampionshipRecurrence}
                        onResult={setRoundMessage}
                      />
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {selectedRounds.map((round) => {
                        const teamA = selectedTeams.find((team) => team.id === round.teamAId);
                        const teamB = selectedTeams.find((team) => team.id === round.teamBId);
                        return (
                          <div
                            key={round.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-box border border-base-300 bg-base-100 p-3"
                          >
                            <div className="space-y-1">
                              <p className="font-bold">
                                R{round.round} · {teamA?.name || 'Time A'} ×{' '}
                                {teamB?.name || 'Time B'}
                              </p>
                              {round.sessionId ? (
                                <p className="text-xs text-base-content/60">
                                  {formatScheduledDate(round.scheduledDate)}
                                </p>
                              ) : (
                                <input
                                  type="datetime-local"
                                  className="input input-bordered input-sm"
                                  aria-label={`Data da rodada ${round.round}`}
                                  value={round.scheduledDate.slice(0, 16)}
                                  disabled={!canManage}
                                  onChange={(event) => {
                                    const result = onRescheduleRound(round.id, event.target.value);
                                    if (result.ok === false) {
                                      setRoundMessage({
                                        kind: 'error',
                                        text: result.error.message,
                                      });
                                    }
                                  }}
                                />
                              )}
                            </div>
                            {round.sessionId ? (
                              <span className="badge badge-success badge-soft">Sessão criada</span>
                            ) : (
                              <div className="flex flex-wrap justify-end gap-1">
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs"
                                  disabled={!canManage}
                                  onClick={() => {
                                    const result = onSetRoundSkipped(round.id, !round.skipped);
                                    if (result.ok === false) {
                                      setRoundMessage({
                                        kind: 'error',
                                        text: result.error.message,
                                      });
                                    }
                                  }}
                                >
                                  {round.skipped ? 'Reativar' : 'Pular'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-xs"
                                  disabled={!canManage || round.skipped}
                                  onClick={() => {
                                    const result = onMaterializeRound(round.id);
                                    if (result.ok === false) {
                                      setRoundMessage({
                                        kind: 'error',
                                        text: result.error.message,
                                      });
                                    } else {
                                      setRoundMessage({
                                        kind: 'success',
                                        text: `Rodada ${round.round} materializada como sessão.`,
                                      });
                                    }
                                  }}
                                >
                                  Materializar rodada
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {roundMessage && (
                      <div
                        role="status"
                        className={`alert ${roundMessage.kind === 'error' ? 'alert-error' : 'alert-success'} alert-soft`}
                      >
                        {roundMessage.text}
                      </div>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className="btn btn-error btn-outline btn-xs self-start"
                        onClick={() => {
                          if (
                            window.confirm(
                              'Excluir esta liga e o calendário ainda não materializado?',
                            )
                          ) {
                            onDeleteChampionship(selectedChampionship.id);
                            setSelectedChampionshipId(null);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir liga
                      </button>
                    )}
                  </div>
                </div>

                <div className="card card-border bg-base-200">
                  <div className="card-body p-4 gap-3">
                    <h4 className="font-black uppercase">Premiações</h4>
                    <div className="rounded-box bg-base-100 border border-base-300 p-4">
                      <span className="text-xs uppercase font-bold text-base-content/50">
                        MVP da temporada
                      </span>
                      <p className="text-lg font-black mt-1">
                        {seasonAwards?.mvp?.playerName || 'Aguardando resultados'}
                      </p>
                      {seasonAwards?.mvp && (
                        <p className="text-xs text-base-content/60">
                          {seasonAwards.mvp.teamName} · {seasonAwards.mvp.totalPoints} pontos
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {awardCards.map(([label, winner]) => (
                        <div
                          key={label as string}
                          className="rounded-box bg-base-100 border border-base-300 p-3"
                        >
                          <span className="text-xs text-base-content/50">{label}</span>
                          <p className="font-bold text-sm">{winner?.playerName || '—'}</p>
                          {winner && (
                            <p className="text-xs text-base-content/50">{winner.teamName}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-box border border-base-300 bg-base-200">
                <table
                  className="table table-sm"
                  aria-label={`Classificação da ${selectedChampionship.name}`}
                >
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Time</th>
                      <th>J</th>
                      <th>V</th>
                      <th>D</th>
                      <th>Pts</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((standing) => (
                      <tr key={standing.teamId}>
                        <td className="font-black">{standing.position}</td>
                        <td className="font-bold">
                          {selectedTeams.find((team) => team.id === standing.teamId)?.name ||
                            'Time'}
                        </td>
                        <td>{standing.gamesPlayed}</td>
                        <td>{standing.wins}</td>
                        <td>{standing.losses}</td>
                        <td className="font-black text-primary">{standing.classificationPoints}</td>
                        <td>{standing.pointDifference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RecurrenceControls({
  championship,
  canManage,
  onUpdate,
  onResult,
}: {
  championship: Championship;
  canManage: boolean;
  onUpdate: (
    championshipId: string,
    recurrenceRule: Championship['recurrenceRule'],
  ) => AppResult<unknown>;
  onResult: (message: { kind: 'success' | 'error'; text: string }) => void;
}) {
  const [startDate, setStartDate] = useState(championship.recurrenceRule.startDate);
  const [time, setTime] = useState(championship.recurrenceRule.time);
  const [days, setDays] = useState(championship.recurrenceRule.daysOfWeek);

  return (
    <details className="collapse collapse-arrow border border-base-300 bg-base-100">
      <summary className="collapse-title py-2 min-h-0 text-sm font-bold">
        Ajustar recorrência
      </summary>
      <div className="collapse-content space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Novo início" type="date" value={startDate} onChange={setStartDate} />
          <Field label="Novo horário" type="time" value={time} onChange={setTime} />
        </div>
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((day) => (
            <label key={day.value} className="label cursor-pointer gap-1 px-2 py-1">
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={days.includes(day.value)}
                disabled={!canManage}
                onChange={(event) =>
                  setDays((current) =>
                    event.target.checked
                      ? [...current, day.value]
                      : current.filter((value) => value !== day.value),
                  )
                }
              />
              <span className="label-text text-xs">{day.label.slice(0, 3)}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-outline btn-xs"
          disabled={!canManage || !startDate || !time || days.length === 0}
          onClick={() => {
            const result = onUpdate(championship.id, {
              ...championship.recurrenceRule,
              startDate,
              time,
              daysOfWeek: [...days].sort((a, b) => a - b),
            });
            onResult(
              result.ok === true
                ? {
                    kind: 'success',
                    text: 'Calendário futuro atualizado; rodadas materializadas foram preservadas.',
                  }
                : { kind: 'error', text: result.error.message },
            );
          }}
        >
          Atualizar calendário futuro
        </button>
      </div>
    </details>
  );
}
