import { motion, useReducedMotion } from 'motion/react';
import { Lock, Plus, RotateCw, Trophy as ChampIcon, Zap } from 'lucide-react';
import { Player, Team } from '../../types';
import { DURATION, EASE_ARRIVE } from '../../ui/motion';

interface TeamScoreCardProps {
  team: Team;
  score: number;
  isWinner: boolean;
  onCourtStreak: number;
  color: string;
  isGameActive: boolean;
  scoringRanking: any[];
  players: Player[];
  /** Nota de desempenho ao vivo por jogador (0–10). */
  ratings?: Record<string, number>;
  sets?: { scoreA: number; scoreB: number }[];
  setTargets?: number[];
  isTeamA?: boolean;
  /** Falso quando outra pessoa controla a sessão: o botão fica desabilitado, não mudo. */
  canScore?: boolean;
  blockedReason?: string;
  onRegisterPoint: () => void;
  onOpenDetailModal: (playerId?: string) => void;
}

const ratingColorClass = (r: number) =>
  r >= 8 ? 'text-success' : r >= 6 ? 'text-warning' : 'text-error';

const positionLabels: Record<string, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
  'all-rounder': 'Coringa',
};

export const TeamScoreCard = ({
  team,
  score,
  isWinner,
  onCourtStreak,
  color,
  isGameActive,
  scoringRanking,
  players,
  ratings,
  sets,
  setTargets,
  isTeamA,
  canScore = true,
  blockedReason,
  onRegisterPoint,
  onOpenDetailModal,
}: TeamScoreCardProps) => {
  const reduceMotion = useReducedMotion();
  const setsWon = sets
    ? sets.filter((s) => (isTeamA ? s.scoreA > s.scoreB : s.scoreB > s.scoreA)).length
    : 0;
  const setsLost = sets
    ? sets.filter((s) => (isTeamA ? s.scoreB > s.scoreA : s.scoreA > s.scoreB)).length
    : 0;
  const isMultiSet = !!setTargets && setTargets.length > 1;
  const currentSetIndex = sets?.length || 0;
  const validTargets = (setTargets || []).filter((target) => Number.isFinite(target) && target > 0);
  const currentTarget = validTargets[currentSetIndex] ?? validTargets[validTargets.length - 1];
  const maxTarget = validTargets.length > 0 ? Math.max(...validTargets) : null;
  const isTiebreak = isMultiSet && !!currentTarget && !!maxTarget && currentTarget < maxTarget;

  const handleRegisterPoint = () => {
    // Confirmação tátil: quem arbitra olha a tela por menos de dois segundos e
    // precisa saber que registrou sem reler o número.
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(30);
    }
    onRegisterPoint();
  };

  return (
    <div
      className={`card card-border bg-base-200 p-3 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl flex flex-col items-center gap-3 sm:gap-6 relative overflow-hidden group transition-all ${isWinner ? 'ring-2 ring-accent ring-offset-2 sm:ring-offset-4 ring-offset-black z-10' : ''}`}
    >
      <div
        className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${color} to-transparent opacity-60 group-hover:opacity-100 transition-opacity`}
      />

      {/* Telemetria de força só a partir de sm: num card de ~163px ela roubaria a
          largura do placar, que é a única coisa que precisa ser lida de longe. */}
      <div className="absolute top-4 left-4 hidden sm:flex flex-col gap-1.5">
        {onCourtStreak > 0 && (
          <div className="badge badge-neutral badge-soft badge-xs font-bold uppercase tracking-widest flex items-center gap-1">
            <RotateCw className="w-2.5 h-2.5 text-accent" /> {onCourtStreak}ª Partida
          </div>
        )}

        <div className="flex flex-col gap-0.5 w-16">
          <div className="flex justify-between items-center px-0.5">
            <span className="text-xs font-bold text-base-content/60 uppercase tracking-tighter">
              Força
            </span>
            <span className="text-xs font-bold text-accent leading-none font-mono">
              {Math.round(team.strengthSnapshot?.overall || 0)}
            </span>
          </div>
          <progress
            className="progress progress-accent w-full h-1"
            aria-label={`Força do time ${team.name}`}
            value={team.strengthSnapshot?.overall || 0}
            max={100}
          />
        </div>

        <div className="flex flex-col gap-0.5 w-16">
          <div className="flex justify-between items-center px-0.5">
            <span className="text-xs font-bold text-base-content/60 uppercase tracking-tighter">
              Rede
            </span>
            <span className="text-xs font-bold text-warning leading-none font-mono">
              {(team.strengthSnapshot?.netPresence || 0).toFixed(1)}
            </span>
          </div>
          <progress
            className="progress progress-warning w-full h-1"
            aria-label={`Presença de rede do time ${team.name}`}
            value={(team.strengthSnapshot?.netPresence || 0) * 10}
            max={100}
          />
        </div>
      </div>

      {isWinner && (
        <div className="absolute top-2 right-2 sm:top-4 sm:right-4 badge badge-accent badge-sm font-bold uppercase tracking-widest flex items-center gap-1">
          <ChampIcon className="w-2.5 h-2.5" /> <span className="hidden sm:inline">Vencedor</span>
        </div>
      )}

      <div className="flex flex-col items-center gap-1 w-full">
        <span className="text-xs font-bold tracking-[0.2em] sm:tracking-[0.4em] text-base-content/60 uppercase truncate max-w-full">
          {team.name || 'Time Sem Nome'}
        </span>
        {isMultiSet && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-1">
            <span className="badge badge-accent badge-soft font-mono font-black text-xs uppercase tracking-wider">
              Sets {setsWon} x {setsLost}
            </span>
            {isTiebreak && (
              <span className="badge badge-warning badge-soft font-black text-xs uppercase tracking-wider">
                Tiebreak
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* A `key` remonta o span a cada ponto e replays a animação: é a
            confirmação visual de que o toque entrou. Com movimento reduzido a
            confirmação continua — vira um clarão de opacidade em vez do soco,
            porque sem ela o organizador não sabe se o toque pegou. */}
        <motion.span
          key={score}
          initial={reduceMotion ? { opacity: 0.35 } : { scale: 1.25 }}
          animate={reduceMotion ? { opacity: 1 } : { scale: 1 }}
          transition={{ duration: DURATION.feedback, ease: EASE_ARRIVE }}
          className={`text-6xl sm:text-8xl md:text-9xl font-black font-mono leading-none tracking-tighter drop-shadow-2xl ${isWinner ? 'text-accent' : ''}`}
        >
          {score}
        </motion.span>
        {sets && sets.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 items-center mt-1">
            {sets.map((s, idx) => {
              const teamScore = isTeamA ? s.scoreA : s.scoreB;
              const oppScore = isTeamA ? s.scoreB : s.scoreA;
              const won = teamScore > oppScore;
              return (
                <span
                  key={idx}
                  className={`badge badge-sm font-mono font-bold ${won ? 'badge-accent' : 'badge-neutral badge-soft text-base-content/70'}`}
                  title={`Set ${idx + 1}: ${teamScore} x ${oppScore}`}
                >
                  {teamScore}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {isGameActive ? (
        <div className="w-full flex flex-col gap-2">
          {!canScore && blockedReason && (
            <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-xs leading-snug text-warning">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{blockedReason}</span>
            </p>
          )}
          <div className="w-full flex gap-2">
            <button
              onClick={handleRegisterPoint}
              disabled={!canScore}
              className="btn btn-accent flex-1 font-black uppercase tracking-wider min-h-[52px] text-base sm:text-sm shadow-lg shadow-accent/20 disabled:opacity-40 disabled:shadow-none"
            >
              {/* Logo abaixo do placar, "+1" não é ambíguo, e o rótulo inteiro
                  quebrava em duas linhas num card de ~163px. */}
              <span className="sm:hidden">+1</span>
              <span className="hidden sm:inline">+1 Ponto</span>
            </button>
            <button
              onClick={() => onOpenDetailModal()}
              disabled={!canScore}
              aria-label={`Detalhar lance do time ${team.name}`}
              title="Detalhar lance"
              className="btn btn-outline min-h-[52px] w-[52px] shrink-0 p-0 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full py-4 text-center text-xs font-bold uppercase tracking-widest text-base-content/60 bg-base-300/30 rounded-2xl border border-base-300 border-dashed">
          Jogo Encerrado
        </div>
      )}

      {/* Elenco fora da dobra no celular: o placar tem que caber em duas colunas
          sem rolagem, e o detalhe por atleta é consulta, não operação. */}
      <details className="w-full group/elenco">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-center gap-1 text-xs font-bold uppercase tracking-wider text-base-content/50 hover:text-base-content">
          Elenco
          <span className="transition-transform group-open/elenco:rotate-180">▾</span>
        </summary>
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
          {team.playerIds.map((pid) => {
            const p = players.find((player) => player.id === pid);
            const pRanking = scoringRanking.find((r) => r.playerId === pid);
            const pPoints = pRanking?.points || 0;
            const nome = p?.apelido || p?.nome || 'Atleta';

            return (
              <button
                key={pid}
                type="button"
                disabled={!isGameActive || !canScore}
                onClick={() => onOpenDetailModal(pid)}
                aria-label={`Detalhar lance de ${nome}`}
                className="bg-base-300/50 p-2.5 rounded-xl border border-base-300 flex flex-col justify-center gap-1 min-h-[44px] text-left hover:border-accent/35 transition-colors group/player disabled:cursor-default"
              >
                <span className="flex justify-between items-center min-w-0 gap-1 w-full">
                  <span className="text-xs font-bold text-base-content truncate flex-1 min-w-0 group-hover/player:text-accent transition-colors">
                    {nome}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {ratings?.[pid] !== undefined && (
                      <span
                        className={`text-xs font-bold font-mono ${ratingColorClass(ratings[pid])}`}
                        title="Nota da partida (ao vivo)"
                      >
                        {ratings[pid].toFixed(1)}
                      </span>
                    )}
                    <Zap className="w-2.5 h-2.5 text-accent" />
                    <span className="text-xs font-bold text-accent font-mono">{pPoints}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${p?.genero === 'M' ? 'bg-info' : 'bg-secondary'}`}
                  />
                  <span className="text-xs text-base-content/60 uppercase font-bold truncate">
                    {positionLabels[p?.posicaoPrincipal || ''] || 'Jogador'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
};
