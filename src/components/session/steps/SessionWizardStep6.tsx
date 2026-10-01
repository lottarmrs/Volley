import { Trophy, Share2, Copy } from 'lucide-react';
import { Game } from '../../../types';
import { TournamentBracket } from '../../tournament/TournamentBracket';
import { generateTournamentSchedule, getTeamDisplayName } from '../../../logic/tournament';
import type { SessionWizardScreen } from '../useSessionWizardScreen';

export function SessionWizardStep6({ screen }: { screen: SessionWizardScreen }) {
  const {
    dispatch,
    handleShareSchedule,
    handleCopySchedule,
    activeSession,
    bestDivisions,
    selectedDivisionIndex,
  } = screen;
  if (!activeSession) return null;
  // Generated schedule
  if (bestDivisions.length === 0) return null;
  const selectedDivision = bestDivisions[selectedDivisionIndex];
  const schedule = generateTournamentSchedule(
    selectedDivision.teams.map((t) => t.id),
    activeSession.config?.type === 'tournament' ? activeSession.config.format : 'round_robin',
    activeSession.config?.type === 'tournament' ? activeSession.config : undefined,
  );
  const teamName = (teamId: string) => getTeamDisplayName(teamId, selectedDivision.teams);
  const rounds = schedule.reduce<Record<number, typeof schedule>>((acc, match) => {
    acc[match.round] = acc[match.round] || [];
    acc[match.round].push(match);
    return acc;
  }, {});

  const format =
    activeSession.config?.type === 'tournament' ? activeSession.config.format : 'round_robin';
  const dummyGames: Game[] = schedule.map((match, idx) => ({
    id: `dummy-${idx}`,
    sessionId: activeSession.id,
    type: 'tournament',
    sequenceNumber: idx + 1,
    round: match.round,
    stage: match.stage || 'group',
    groupId: match.groupId || null,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    scoreA: 0,
    scoreB: 0,
    status: 'scheduled',
    pointIds: [],
    startedAt: null,
  }));

  return (
    <div className="space-y-6">
      <div className="card card-border bg-base-200">
        <div className="card-body p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-base-300 pb-4">
            <div>
              <h3 className="card-title text-sm font-bold uppercase tracking-widest text-base-content">
                Tabela gerada
              </h3>
              <p className="text-[10px] text-text-muted uppercase mt-1">
                {schedule.length} jogos | {Object.keys(rounds).length} rodadas |{' '}
                {format === 'round_robin'
                  ? 'Todos contra todos'
                  : format === 'double_round_robin'
                    ? 'Turno e returno'
                    : format === 'knockout'
                      ? 'Mata-mata'
                      : format === 'group_stage'
                        ? 'Fase de grupos'
                        : 'Grupos + mata-mata'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleShareSchedule}
                className="btn btn-sm btn-success btn-soft text-success min-h-[44px] px-3 font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                <Share2 className="w-4 h-4" />{' '}
                <span className="hidden sm:inline">Compartilhar Tabela</span>
              </button>
              <button
                type="button"
                onClick={handleCopySchedule}
                className="btn btn-sm btn-outline min-h-[44px] px-3 font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                <Copy className="w-4 h-4" /> <span className="hidden sm:inline">Copiar Tabela</span>
              </button>
              <Trophy className="w-5 h-5 text-accent shrink-0 ml-1" />
            </div>
          </div>

          {format === 'knockout' || format === 'groups_knockout' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <TournamentBracket games={dummyGames} teams={selectedDivision.teams} />
              </div>
              <div className="lg:col-span-1 space-y-4 lg:max-h-[440px] lg:overflow-y-auto pr-2">
                {Object.entries(rounds).map(([round, matches]) => (
                  <div key={round} className="space-y-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-accent">
                      Rodada {round}
                    </p>
                    {matches.map((match, index) => (
                      <div
                        key={`${match.teamAId}-${match.teamBId}`}
                        className="flex items-center justify-between p-3 bg-base-100 border border-base-300 rounded-xl"
                      >
                        <span className="text-[9px] font-mono text-text-muted">
                          Jogo {index + 1}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-base-content">
                          <span className="truncate max-w-[70px]">{teamName(match.teamAId)}</span>
                          <span className="text-accent">x</span>
                          <span className="truncate max-w-[70px]">{teamName(match.teamBId)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 lg:max-h-[440px] lg:overflow-y-auto pr-2">
              {Object.entries(rounds).map(([round, matches]) => (
                <div key={round} className="space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-accent">
                    Rodada {round}
                  </p>
                  {matches.map((match, index) => (
                    <div
                      key={`${match.teamAId}-${match.teamBId}`}
                      className="flex items-center justify-between p-3 bg-base-100 border border-base-300 rounded-xl"
                    >
                      <span className="text-[9px] font-mono text-text-muted">Jogo {index + 1}</span>
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-base-content">
                        <span>{teamName(match.teamAId)}</span>
                        <span className="text-accent">x</span>
                        <span>{teamName(match.teamBId)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => dispatch({ kind: 'prev' })}
          className="btn btn-ghost flex-1 text-xs font-bold uppercase tracking-wider min-h-[44px]"
        >
          Voltar aos times
        </button>
        <button
          type="button"
          onClick={() => dispatch({ kind: 'startGeneratedTournament' })}
          className="btn btn-primary flex-[2] font-bold uppercase tracking-wider min-h-[44px] shadow-lg shadow-primary/20"
        >
          Começar o torneio
        </button>
      </div>
    </div>
  );
}
