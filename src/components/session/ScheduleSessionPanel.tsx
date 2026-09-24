import { Link } from 'react-router';
import { CalendarCheck } from 'lucide-react';
import { paths } from '@app/appRoutes';

interface ScheduleSessionPanelProps {
  communityId: string | null;
  sessionId: string;
  isScheduled: boolean;
  error: string | null;
  onSchedule: () => void;
  /** Ao lado do erro de atletas: a mesma saida, com a frase que explica
   *  por que ela aparece ali. */
  compact?: boolean;
}

export function ScheduleSessionPanel({
  communityId,
  sessionId,
  isScheduled,
  error,
  onSchedule,
  compact = false,
}: ScheduleSessionPanelProps) {
  if (!communityId) return null;

  return (
    <div className="space-y-3 rounded-box border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-base-content">
            {isScheduled ? 'Pelada marcada' : 'Marcar esta pelada'}
          </p>
          <p className="text-xs leading-relaxed text-base-content/70">
            {isScheduled
              ? 'Ela já aparece na agenda do grupo. Abra a lista para o pessoal garantir a vaga antes do sorteio.'
              : compact
                ? 'Você não precisa escolher atleta agora: marque a pelada sem escolher atleta nenhum e deixe o pessoal entrar na lista. O sorteio acontece depois, com quem confirmou.'
                : 'Guarde a data agora e o grupo já vê a pelada na agenda — dá para abrir a lista de presença sem sortear ainda.'}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="alert alert-error alert-soft text-sm">
          {error}
        </div>
      )}

      {isScheduled ? (
        <Link
          to={paths.inscricao(communityId, sessionId)}
          className="btn btn-primary btn-sm w-full sm:w-auto"
        >
          Abrir a lista de presença
        </Link>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm w-full sm:w-auto"
          onClick={onSchedule}
        >
          Marcar pelada
        </button>
      )}
    </div>
  );
}

export default ScheduleSessionPanel;
