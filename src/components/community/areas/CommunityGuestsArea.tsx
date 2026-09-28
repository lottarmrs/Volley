import type { FC, ReactNode } from 'react';
import { useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import type { Player, Position } from '@shared/types';
import type { AppResult } from '@app/appResult';
import {
  draftFromPlayer,
  levelFromAttributes,
  validateAthleteProfile,
  type AthleteProfileDraft,
} from '@domain/athleteProfile';
import { AthleteProfileForm } from '../../player/AthleteProfileForm';

const EMPTY_DRAFT: AthleteProfileDraft = {
  genero: null,
  posicaoPrincipal: null,
  alturaCm: null,
  maoDominante: null,
  apelido: '',
  posicoesSecundarias: [],
  lesionado: false,
  limitacaoFisica: null,
};

const POSITION_LABELS: Record<Position, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
  'all-rounder': 'Versátil',
};

const labelClasses = 'text-[11px] font-bold uppercase tracking-wider text-base-content/70';

export interface CommunityGuestsAreaProps {
  guests: Player[];
  noCloud: boolean;
  onSave: (input: {
    playerId: string | null;
    nome: string;
    draft: AthleteProfileDraft;
    level: 1 | 2 | 3 | 4 | 5 | null;
  }) => AppResult<Player>;
  onRemove: (playerId: string) => AppResult<'removed' | 'deactivated'>;
  hasHistory: (playerId: string) => boolean;
  searchSlot?: ReactNode;
  initialEditingId?: string | null;
}

const GuestEditor: FC<{
  guest: Player | null;
  noCloud: boolean;
  hasHistory: boolean;
  onBack: () => void;
  onSave: CommunityGuestsAreaProps['onSave'];
  onRemove: CommunityGuestsAreaProps['onRemove'];
}> = ({ guest, noCloud, hasHistory, onBack, onSave, onRemove }) => {
  const [nome, setNome] = useState(guest?.nome ?? '');
  const [draft, setDraft] = useState<AthleteProfileDraft>(
    guest ? draftFromPlayer(guest) : EMPTY_DRAFT,
  );
  const [level, setLevel] = useState<1 | 2 | 3 | 4 | 5>(
    guest ? levelFromAttributes(guest.atributos) : 1,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);

  const salvar = () => {
    const result = onSave({
      playerId: guest?.id ?? null,
      nome,
      draft,
      level: noCloud ? level : null,
    });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onBack();
  };

  const remover = () => {
    if (!guest) return;
    if (!confirmandoRemocao) {
      setConfirmandoRemocao(true);
      return;
    }
    const result = onRemove(guest.id);
    if (!result.ok) {
      setError(result.error.message);
      setConfirmandoRemocao(false);
      return;
    }
    onBack();
  };

  return (
    <div className="space-y-5">
      <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      {error && (
        <div role="alert" className="alert alert-error alert-soft text-xs rounded-xl">
          <span>{error}</span>
        </div>
      )}

      <div className="form-control">
        <label className={`${labelClasses} pb-1`} htmlFor="convidado-nome">
          Nome
        </label>
        <input
          id="convidado-nome"
          type="text"
          className="input input-bordered w-full rounded-xl bg-base-100/60 min-h-11"
          value={nome}
          onChange={(event) => setNome(event.target.value)}
        />
      </div>

      <AthleteProfileForm
        value={draft}
        onChange={setDraft}
        showCondition
        level={noCloud ? { value: level, onChange: setLevel } : null}
      />

      <div className="flex flex-col gap-2 border-t border-base-300 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="btn btn-primary btn-block sm:w-auto min-h-11"
          onClick={salvar}
        >
          Salvar
        </button>
        {guest && (
          <button type="button" className="btn btn-ghost text-error min-h-11" onClick={remover}>
            <Trash2 className="w-4 h-4" />
            {confirmandoRemocao ? 'Confirmar exclusão' : hasHistory ? 'Desativar' : 'Excluir'}
          </button>
        )}
      </div>
    </div>
  );
};

export const CommunityGuestsArea: FC<CommunityGuestsAreaProps> = ({
  guests,
  noCloud,
  onSave,
  onRemove,
  hasHistory,
  searchSlot,
  initialEditingId,
}) => {
  const [mode, setMode] = useState<'list' | 'new' | string>(() => initialEditingId ?? 'list');

  if (mode !== 'list') {
    const guest = mode === 'new' ? null : (guests.find((item) => item.id === mode) ?? null);
    return (
      <GuestEditor
        key={mode}
        guest={guest}
        noCloud={noCloud}
        hasHistory={guest ? hasHistory(guest.id) : false}
        onBack={() => setMode('list')}
        onSave={onSave}
        onRemove={onRemove}
      />
    );
  }

  return (
    <div className="space-y-5">
      <button type="button" className="btn btn-primary min-h-11" onClick={() => setMode('new')}>
        <Plus className="w-4 h-4" /> Cadastrar convidado
      </button>

      {guests.length === 0 ? (
        <p className="text-sm text-base-content/70">Nenhum convidado ainda.</p>
      ) : (
        <ul className="divide-y divide-base-300 overflow-hidden rounded-box border border-base-300 bg-base-200">
          {guests.map((guest) => {
            const incompleta =
              Object.keys(validateAthleteProfile(draftFromPlayer(guest))).length > 0;
            return (
              <li key={guest.id}>
                <button
                  type="button"
                  className="flex w-full min-h-11 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-base-300/50 focus-visible:bg-base-300/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                  onClick={() => setMode(guest.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-snug text-base-content">
                      {guest.nome}
                    </span>
                    {guest.apelido && guest.apelido !== guest.nome && (
                      <span className="block text-xs text-base-content/60">{guest.apelido}</span>
                    )}
                  </span>
                  {guest.posicaoPrincipal && (
                    <span className="shrink-0 text-xs text-base-content/60">
                      {POSITION_LABELS[guest.posicaoPrincipal]}
                    </span>
                  )}
                  {incompleta && (
                    <span className="badge badge-warning badge-soft shrink-0 text-[10px]">
                      sem ficha completa
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {searchSlot && (
        <section className="space-y-2">
          <p className={labelClasses}>Trazer atleta com conta pelo @</p>
          <p className="text-sm text-base-content/70">
            Atleta com conta preenche a própria ficha — use isso só para quem já tem um @username no
            app.
          </p>
          {searchSlot}
        </section>
      )}
    </div>
  );
};
