import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Calendar, Shield, Trophy, Users } from 'lucide-react';
import { useShell } from '../../app/shellContext';
import { paths } from '../../application/appRoutes';
import { createChampionship, generateRoundDates } from '../../logic/championship';
import { createChampionship as createChampionshipUseCase } from '../../application/championshipUseCases';
import { generateTournamentSchedule } from '../../logic/tournament';
import { generateUUID } from '../../logic/uuid';
import type { ChampionshipRecurrenceRule } from '../../types';

interface DraftTeam {
  id: string;
  name: string;
  playerIds: string[];
  captainPlayerId?: string;
}

export function ChampionshipWizardView() {
  const navigate = useNavigate();
  const { comm, play, championships } = useShell();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Info & Recurrence
  const [name, setName] = useState('');
  const [communityId, setCommunityId] = useState(comm.communities[0]?.id || '');
  const [format, setFormat] = useState<'round_robin' | 'double_round_robin'>('round_robin');
  const [dayOfWeek, setDayOfWeek] = useState<number>(2); // Terça-feira
  const [time, setTime] = useState('20:00');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  // Step 2: Scoring
  const [winPoints, setWinPoints] = useState(3);
  const [lossPoints, setLossPoints] = useState(0);

  // Step 3: Teams & Captains
  const [teams, setTeams] = useState<DraftTeam[]>([
    { id: generateUUID(), name: 'Time A', playerIds: [] },
    { id: generateUUID(), name: 'Time B', playerIds: [] },
  ]);
  const [newTeamName, setNewTeamName] = useState('');

  // Available Players
  const availablePlayers = play.players;

  const handleAddTeam = () => {
    if (!newTeamName.trim()) return;
    setTeams([...teams, { id: generateUUID(), name: newTeamName.trim(), playerIds: [] }]);
    setNewTeamName('');
  };

  const handleRemoveTeam = (teamId: string) => {
    if (teams.length <= 2) return;
    setTeams(teams.filter((t) => t.id !== teamId));
  };

  const handleTogglePlayerInTeam = (teamId: string, playerId: string) => {
    setTeams(
      teams.map((t) => {
        if (t.id !== teamId) return t;
        const exists = t.playerIds.includes(playerId);
        const playerIds = exists ? t.playerIds.filter((id) => id !== playerId) : [...t.playerIds, playerId];
        const captainPlayerId = exists && t.captainPlayerId === playerId ? undefined : t.captainPlayerId;
        return { ...t, playerIds, captainPlayerId };
      }),
    );
  };

  const handleSetCaptain = (teamId: string, playerId: string) => {
    setTeams(
      teams.map((t) => (t.id === teamId ? { ...t, captainPlayerId: playerId } : t)),
    );
  };

  // Preview Rounds
  const recurrenceRule: ChampionshipRecurrenceRule = {
    daysOfWeek: [dayOfWeek],
    time,
    startDate,
  };

  const scheduleMatches = generateTournamentSchedule(
    teams.map((t) => t.id),
    format,
  );
  const roundCount = Math.max(...scheduleMatches.map((m) => m.round), 0);
  const dates = generateRoundDates(recurrenceRule, roundCount);

  const previewRounds = scheduleMatches.map((match, idx) => ({
    id: `prev-${idx}`,
    championshipId: 'temp',
    round: match.round,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    scheduledDate: dates[match.round - 1] || startDate,
    skipped: false,
  }));

  const handleFinish = () => {
    const result = createChampionshipUseCase({
      communityId,
      name: name.trim() || 'Liga de Vôlei',
      format,
      classificationPoints: { win: winPoints, loss: lossPoints },
      recurrenceRule,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        playerIds: t.playerIds,
      })),
    });

    if (result.ok) {
      const championshipId = generateUUID();
      const now = new Date().toISOString();

      const newChampionship = {
        id: championshipId,
        communityId: result.value.championship.communityId,
        name: result.value.championship.name,
        format: result.value.championship.format,
        classificationPoints: result.value.championship.classificationPoints,
        recurrenceRule: result.value.championship.recurrenceRule,
        createdAt: now,
        updatedAt: now,
      };

      const newTeams = teams.map((t) => ({
        id: t.id,
        championshipId,
        name: t.name,
        playerIds: t.playerIds,
        captainPlayerId: t.captainPlayerId,
        updatedAt: now,
      }));

      const newRounds = result.value.rounds.map((r) => ({
        id: generateUUID(),
        championshipId,
        round: r.round,
        teamAId: r.teamAId,
        teamBId: r.teamBId,
        scheduledDate: r.scheduledDate,
        skipped: r.skipped,
        updatedAt: now,
      }));

      championships.setChampionships((prev) => [...prev, newChampionship]);
      championships.setChampionshipTeams((prev) => [...prev, ...newTeams]);
      championships.setChampionshipRounds((prev) => [...prev, ...newRounds]);

      navigate(paths.liga(championshipId));
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-base-300 pb-4">
        <button
          type="button"
          onClick={() => navigate(paths.ligas)}
          className="btn btn-ghost btn-sm btn-square"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-xl font-black uppercase flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> Criar Nova Liga
          </h2>
          <p className="text-xs text-base-content/60">Wizard em 4 passos para lançar a temporada da comunidade.</p>
        </div>
      </div>

      {/* Step Progress Bar */}
      <ul className="steps w-full text-xs">
        <li className={`step ${step >= 1 ? 'step-primary' : ''}`}>Informações</li>
        <li className={`step ${step >= 2 ? 'step-primary' : ''}`}>Pontuação</li>
        <li className={`step ${step >= 3 ? 'step-primary' : ''}`}>Times & Capitães</li>
        <li className={`step ${step >= 4 ? 'step-primary' : ''}`}>Revisão & Calendário</li>
      </ul>

      {/* STEP 1: Basic Info & Recurrence */}
      {step === 1 && (
        <div className="card card-border bg-base-200 p-6 space-y-4">
          <h3 className="font-black text-sm uppercase text-primary">Passo 1: Informações e Recorrência</h3>

          <div className="form-control">
            <label className="label text-xs font-bold">Nome da Liga</label>
            <input
              type="text"
              className="input input-bordered input-sm"
              placeholder="Ex: Liga da Primavera 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label text-xs font-bold">Comunidade</label>
              <select
                className="select select-bordered select-sm"
                value={communityId}
                onChange={(e) => setCommunityId(e.target.value)}
              >
                {comm.communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-control">
              <label className="label text-xs font-bold">Formato do Campeonato</label>
              <select
                className="select select-bordered select-sm"
                value={format}
                onChange={(e) => setFormat(e.target.value as ChampionshipFormat)}
              >
                <option value="round_robin">Turno Único (Todos contra Todos)</option>
                <option value="double_round_robin">Turno e Returno (Ida e Volta)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-base-300 pt-4">
            <div className="form-control">
              <label className="label text-xs font-bold">Dia da Semana</label>
              <select
                className="select select-bordered select-sm"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
              >
                <option value={0}>Domingo</option>
                <option value={1}>Segunda-feira</option>
                <option value={2}>Terça-feira</option>
                <option value={3}>Quarta-feira</option>
                <option value={4}>Quinta-feira</option>
                <option value={5}>Sexta-feira</option>
                <option value={6}>Sábado</option>
              </select>
            </div>

            <div className="form-control">
              <label className="label text-xs font-bold">Horário Padrão</label>
              <input
                type="time"
                className="input input-bordered input-sm"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>

            <div className="form-control">
              <label className="label text-xs font-bold">Data da 1ª Rodada</label>
              <input
                type="date"
                className="input input-bordered input-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setStep(2)}
              disabled={!name.trim()}
            >
              Próximo: Pontuação <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Scoring Rules */}
      {step === 2 && (
        <div className="card card-border bg-base-200 p-6 space-y-4">
          <h3 className="font-black text-sm uppercase text-primary">Passo 2: Regras de Pontuação</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label text-xs font-bold">Pontos por Vitória</label>
              <input
                type="number"
                className="input input-bordered input-sm"
                value={winPoints}
                onChange={(e) => setWinPoints(Number(e.target.value))}
              />
            </div>

            <div className="form-control">
              <label className="label text-xs font-bold">Pontos por Derrota</label>
              <input
                type="number"
                className="input input-bordered input-sm"
                value={lossPoints}
                onChange={(e) => setLossPoints(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="card bg-base-100 p-4 border border-base-300 text-xs space-y-2">
            <span className="font-bold uppercase text-primary">Critérios de Desempate (Automáticos):</span>
            <ol className="list-decimal list-inside space-y-1 text-base-content/70">
              <li>Número de Vitórias</li>
              <li>Pontos de Classificação</li>
              <li>Saldo de Pontos (Pontos Pró - Pontos Contra)</li>
              <li>Confronto Direto</li>
            </ol>
          </div>

          <div className="flex justify-between pt-4">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep(3)}>
              Próximo: Times & Capitães <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Teams & Captains */}
      {step === 3 && (
        <div className="card card-border bg-base-200 p-6 space-y-6">
          <h3 className="font-black text-sm uppercase text-primary">Passo 3: Equipes e Capitães</h3>

          {/* Add Team Input */}
          <div className="flex gap-2">
            <input
              type="text"
              className="input input-bordered input-sm grow"
              placeholder="Nome da nova equipe..."
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddTeam}>
              Adicionar Equipe
            </button>
          </div>

          {/* Teams Grid */}
          <div className="space-y-4">
            {teams.map((team, idx) => (
              <div key={team.id} className="card bg-base-100 p-4 border border-base-300 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" /> Equipe {idx + 1}: {team.name}
                  </span>
                  {teams.length > 2 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => handleRemoveTeam(team.id)}
                    >
                      Remover equipe
                    </button>
                  )}
                </div>

                <div className="text-xs font-semibold text-base-content/60">
                  Selecione os atletas da equipe e defina o Capitão (C):
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                  {availablePlayers.map((player) => {
                    const isSelected = team.playerIds.includes(player.id);
                    const isCaptain = team.captainPlayerId === player.id;

                    return (
                      <div
                        key={player.id}
                        className={`p-2 rounded border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/10 border-primary' : 'bg-base-200 border-base-300'
                        }`}
                        onClick={() => handleTogglePlayerInTeam(team.id, player.id)}
                      >
                        <span className="truncate">{player.apelido || player.nome}</span>
                        {isSelected && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetCaptain(team.id, player.id);
                            }}
                            className={`badge badge-xs font-black ${
                              isCaptain ? 'badge-warning' : 'badge-outline'
                            }`}
                          >
                            C
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-4">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(2)}>
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setStep(4)}>
              Próximo: Revisão & Calendário <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Review & Schedule Preview */}
      {step === 4 && (
        <div className="card card-border bg-base-200 p-6 space-y-6">
          <h3 className="font-black text-sm uppercase text-primary">Passo 4: Revisão Geral e Calendário</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="bg-base-100 p-3 rounded border border-base-300 space-y-1">
              <span className="font-bold uppercase text-base-content/60">Liga</span>
              <p className="font-black text-sm">{name}</p>
              <p>Formato: {format === 'double_round_robin' ? 'Turno & Returno' : 'Turno Único'}</p>
            </div>
            <div className="bg-base-100 p-3 rounded border border-base-300 space-y-1">
              <span className="font-bold uppercase text-base-content/60">Recorrência</span>
              <p className="font-black text-sm">Toda semana às {time}</p>
              <p>Início: {startDate}</p>
            </div>
          </div>

          {/* Schedule Rounds Preview */}
          <div className="space-y-3">
            <h4 className="font-bold text-xs uppercase flex items-center gap-1.5 text-base-content/70">
              <Calendar className="w-4 h-4" /> Prévia das Rodadas Geradas ({previewRounds.length} confrontos)
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {previewRounds.map((rd) => {
                const teamA = teams.find((t) => t.id === rd.teamAId);
                const teamB = teams.find((t) => t.id === rd.teamBId);
                const dateStr = new Date(rd.scheduledDate).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={rd.id}
                    className="flex items-center justify-between bg-base-100 p-2.5 rounded border border-base-300 text-xs"
                  >
                    <span className="font-bold text-primary">Rodada {rd.round}</span>
                    <span className="font-black">{teamA?.name} VS {teamB?.name}</span>
                    <span className="text-base-content/60">{dateStr}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-base-300">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(3)}>
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <button type="button" className="btn btn-success btn-sm" onClick={handleFinish}>
              <Check className="w-4 h-4" /> Lançar Liga e Gerar Rodadas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
