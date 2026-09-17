import { Sparkles, X } from 'lucide-react';
import type { AuthorizedFormationStage } from '../../types';

const STAGE_TEXT: Record<AuthorizedFormationStage, string> = {
  session: 'Preparando a sessão na nuvem…',
  roster: 'Confirmando o elenco…',
  snapshot: 'Congelando as notas dos atletas…',
};

interface SessionGenerationStatusProps {
  stage: AuthorizedFormationStage | null;
  progress: number;
  onCancel: () => void;
}

export function SessionGenerationStatus({
  stage,
  progress,
  onCancel,
}: SessionGenerationStatusProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase text-text-muted tracking-widest flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 animate-pulse text-accent" />
          <span>{stage ? STAGE_TEXT[stage] : 'Equilibrando os times…'}</span>
        </p>
        {!stage && <span className="text-[10px] font-mono font-bold text-accent">{progress}%</span>}
      </div>
      {stage ? (
        <progress className="progress progress-accent w-full" aria-label={STAGE_TEXT[stage]} />
      ) : (
        <progress className="progress progress-accent w-full" value={progress} max={100} />
      )}
      <p className="text-[9px] text-text-muted/80 uppercase font-semibold leading-normal mt-1 p-3 bg-neutral/30 rounded-xl border border-base-300">
        {stage
          ? 'Registrando o elenco e as notas autorizadas da comunidade antes do sorteio.'
          : 'ℹ️ Estamos testando milhares de combinações para achar o time mais equilibrado. Isso pode levar alguns segundos — quanto maior o grupo, um pouquinho mais.'}
      </p>
      <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm w-full text-xs">
        <X className="w-3.5 h-3.5" /> Cancelar
      </button>
    </div>
  );
}
