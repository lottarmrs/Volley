import { CheckCircle2, Send } from 'lucide-react';
import type { CandidateSetPublicationState } from '../../types';

interface CandidateSetPublicationProps {
  state: CandidateSetPublicationState;
  error: string | null;
  onPublish: () => void;
}

export function CandidateSetPublication({ state, error, onPublish }: CandidateSetPublicationProps) {
  if (state === 'published') {
    return (
      <p role="status" className="flex items-center gap-2 text-xs font-semibold text-success">
        <CheckCircle2 className="w-4 h-4" /> Publicado
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onPublish}
        disabled={state === 'publishing'}
        className="btn btn-accent btn-sm w-full text-xs"
      >
        <Send className="w-3.5 h-3.5" />
        {state === 'publishing' ? 'Publicando…' : 'Publicar'}
      </button>
      {state === 'error' && error && (
        <div role="alert" className="alert alert-error alert-soft text-xs font-semibold">
          {error}
        </div>
      )}
    </div>
  );
}
