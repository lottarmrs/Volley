import { ChevronLeft, Trophy, Clock } from 'lucide-react';
import type { SessionWizardScreen } from '../useSessionWizardScreen';

export function SessionWizardStep2({ screen }: { screen: SessionWizardScreen }) {
  const { dispatch, activeSession } = screen;
  if (!activeSession) return null;
  return (
    <div className="space-y-8 py-4">
      <div className="text-center space-y-2 mb-4">
        <h3 className="text-sm font-bold uppercase text-accent tracking-[0.4em]">
          ESCOLHA O FORMATO DO EVENTO
        </h3>
        <p className="text-[10px] text-text-muted uppercase font-bold italic">
          O formato define como os times serão organizados em quadra
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button
          onClick={() => {
            dispatch({
              kind: 'updateSession',
              patch: {
                type: 'free_play',
                config: {
                  type: 'free_play',
                  teamCount: 3,
                  maxPoints: 15,
                  tieBreakMethod: 'direct_3',
                  rotationSystem: 'winner_stays',
                  maxConsecutiveGames: 3,
                  initialCourtTeams: ['', ''],
                  initialQueue: [],
                  queuePolicy: 'fifo',
                  balanceSpeed: 'advanced',
                },
              },
            });
            dispatch({ kind: 'next' });
          }}
          className={`card card-border cursor-pointer text-left hover:scale-[1.02] transition-all bg-base-200 ${activeSession.type === 'free_play' ? 'border-accent bg-accent/5' : 'hover:border-accent/30'}`}
        >
          <div className="card-body items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
              <Clock className="w-8 h-8 text-accent" />
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <h3 className="card-title font-bold uppercase text-lg text-base-content">
                  Jogo Livre
                </h3>
                <span className="badge badge-accent badge-sm uppercase font-bold">Recomendado</span>
              </div>
              <p className="text-xs text-text-muted uppercase font-bold leading-relaxed max-w-xs mx-auto">
                Ideal para noite dinâmica. Dois times jogam, os demais ficam em fila. O sistema
                controla rotação, vitórias e pontuação.
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => {
            dispatch({
              kind: 'updateSession',
              patch: {
                type: 'tournament',
                config: {
                  type: 'tournament',
                  format: 'round_robin',
                  teamCount: 3,
                  useGroupStage: false,
                  roundTrip: false,
                  maxPoints: 15,
                  tieBreakMethod: 'direct_3',
                  victoryRule: 'direct_3',
                  hasFinal: false,
                  hasThirdPlaceMatch: false,
                  classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
                  standingsRules: [
                    'classificationPoints',
                    'wins',
                    'pointDifference',
                    'pointsFor',
                    'headToHead',
                    'pointsAgainst',
                  ],
                  balanceSpeed: 'advanced',
                },
              },
            });
            dispatch({ kind: 'next' });
          }}
          className={`card card-border cursor-pointer text-left hover:scale-[1.02] transition-all bg-base-200 ${activeSession.type === 'tournament' ? 'border-primary bg-primary/5' : 'hover:border-primary/30'}`}
        >
          <div className="card-body items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-primary" />
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <h3 className="card-title font-bold uppercase text-lg text-base-content">
                  Torneio
                </h3>
                <span className="badge badge-primary badge-sm uppercase font-bold">Novo</span>
              </div>
              <p className="text-xs text-text-muted uppercase font-bold leading-relaxed max-w-xs mx-auto">
                Tabela de classificação, rodadas completas em rodízio e campeão da noite. Todos
                jogam contra todos.
              </p>
            </div>
          </div>
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          dispatch({ kind: 'prev' });
        }}
        className="btn btn-ghost btn-sm w-full"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Voltar para Seleção de Atletas
      </button>
    </div>
  );
}
