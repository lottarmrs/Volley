import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { updateMyAthleteProfile } from '@app/athleteProfileUseCases';
import { validateAthleteProfile, type AthleteProfileDraft } from '@domain/athleteProfile';
import { AthleteProfileForm } from '../../components/player/AthleteProfileForm';
import { useAuthSession } from './useAuthSession';

const VAZIO: AthleteProfileDraft = {
  genero: null,
  posicaoPrincipal: null,
  alturaCm: null,
  maoDominante: null,
  apelido: '',
  posicoesSecundarias: [],
};

export function CompleteAthleteProfilePage() {
  const { retry } = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const completo = Object.keys(validateAthleteProfile(draft)).length === 0;

  return (
    <div className="min-h-screen bg-base-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="card bg-base-200/95 border border-base-300/80 w-full max-w-md shadow-2xl rounded-3xl backdrop-blur-md overflow-hidden p-6 sm:p-8 space-y-6 z-10">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3 shadow-inner">
            <ClipboardList className="w-6 h-6" />
          </div>
          <h1 className="text-xl uppercase font-black tracking-wider text-base-content">
            Sua ficha de atleta
          </h1>
          <p className="text-xs text-base-content/60 mt-1">
            É com isso que o sorteio monta times equilibrados.
          </p>
        </div>

        <AthleteProfileForm
          value={draft}
          onChange={setDraft}
          serverError={erro}
          disabled={salvando}
        />

        <button
          type="button"
          className="btn btn-primary w-full rounded-2xl font-bold uppercase tracking-wider shadow-lg shadow-primary/20 text-sm h-12"
          disabled={!completo || salvando}
          onClick={async () => {
            setSalvando(true);
            setErro(null);
            const result = await updateMyAthleteProfile(draft);
            if (!result.ok) {
              setErro(result.error.message);
              setSalvando(false);
              return;
            }
            await retry();
            const from = (location.state as { from?: { pathname?: string } } | null)?.from;
            navigate(from ?? '/', { replace: true });
          }}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
