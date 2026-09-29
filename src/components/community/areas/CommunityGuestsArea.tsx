import type { FC, ReactNode } from 'react';
import { useState } from 'react';
import { ArrowLeft, Plus, RotateCcw, Trash2, UserX } from 'lucide-react';
import type { Player, Position } from '@shared/types';
import type { AppResult } from '@app/appResult';
import {
  draftFromPlayer,
  levelFromAttributes,
  validateAthleteProfile,
  type AthleteProfileDraft,
} from '@domain/athleteProfile';
import { AthleteProfileForm } from '../../player/AthleteProfileForm';
import { AvatarUpload } from '../../player/AvatarUpload';

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

const rowButtonClasses =
  'flex min-h-11 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-base-300/50 focus-visible:bg-base-300/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary';

const listClasses =
  'divide-y divide-base-300 overflow-hidden rounded-box border border-base-300 bg-base-200';

export interface CommunityGuestsAreaProps {
  guests: Player[];
  noCloud: boolean;
  isOwner: boolean;
  onSave: (input: {
    playerId: string | null;
    nome: string;
    draft: AthleteProfileDraft;
    level: 1 | 2 | 3 | 4 | 5 | null;
  }) => AppResult<Player>;
  onDeactivate: (playerId: string) => AppResult<'deactivated'>;
  onReactivate: (playerId: string) => AppResult<'reactivated'>;
  onDelete: (playerId: string) => AppResult<'removed' | 'deactivated'>;
  searchSlot?: ReactNode;
  initialEditingId?: string | null;
  onCloseEditor?: () => void;
  onAvatarApplied?: (playerId: string, url: string) => void;
}

const GuestEditor: FC<{
  guest: Player | null;
  noCloud: boolean;
  onBack: () => void;
  onSave: CommunityGuestsAreaProps['onSave'];
  onDeactivate: CommunityGuestsAreaProps['onDeactivate'];
  onReactivate: CommunityGuestsAreaProps['onReactivate'];
  onAvatarApplied?: CommunityGuestsAreaProps['onAvatarApplied'];
}> = ({ guest, noCloud, onBack, onSave, onDeactivate, onReactivate, onAvatarApplied }) => {
  const [nome, setNome] = useState(guest?.nome ?? '');
  const [draft, setDraft] = useState<AthleteProfileDraft>(
    guest ? draftFromPlayer(guest) : EMPTY_DRAFT,
  );
  const [level, setLevel] = useState<1 | 2 | 3 | 4 | 5>(
    guest ? levelFromAttributes(guest.atributos) : 1,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmandoDesativacao, setConfirmandoDesativacao] = useState(false);
  const desativado = !!guest && guest.ativo === false;

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

  const desativar = () => {
    if (!guest) return;
    if (!confirmandoDesativacao) {
      setConfirmandoDesativacao(true);
      return;
    }
    const result = onDeactivate(guest.id);
    if (!result.ok) {
      setError(result.error.message);
      setConfirmandoDesativacao(false);
      return;
    }
    onBack();
  };

  const reativar = () => {
    if (!guest) return;
    const result = onReactivate(guest.id);
    if (!result.ok) {
      setError(result.error.message);
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

      {desativado && (
        <p className="text-sm text-base-content/70">
          Convidado desativado: fica fora da presença e do sorteio até ser reativado.
        </p>
      )}

      {guest?.cloudId && (
        <AvatarUpload
          playerCloudId={guest.cloudId}
          currentAvatarUrl={guest.avatarUrl}
          initials={guest.nome.substring(0, 2).toUpperCase()}
          onApplied={(url) => onAvatarApplied?.(guest.id, url)}
        />
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
        {guest && desativado && (
          <button type="button" className="btn btn-ghost min-h-11" onClick={reativar}>
            <RotateCcw className="w-4 h-4" />
            Reativar
          </button>
        )}
        {guest && !desativado && (
          <button type="button" className="btn btn-ghost text-error min-h-11" onClick={desativar}>
            <UserX className="w-4 h-4" />
            {confirmandoDesativacao ? 'Confirmar desativação' : 'Desativar'}
          </button>
        )}
      </div>
    </div>
  );
};

const DeactivatedGuestRow: FC<{
  guest: Player;
  isOwner: boolean;
  onOpen: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}> = ({ guest, isOwner, onOpen, onReactivate, onDelete }) => {
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const excluir = () => {
    if (!confirmandoExclusao) {
      setConfirmandoExclusao(true);
      return;
    }
    setConfirmandoExclusao(false);
    onDelete();
  };

  return (
    <li className="flex flex-col sm:flex-row sm:items-center">
      <button
        type="button"
        className={`${rowButtonClasses} w-full min-w-0 sm:flex-1`}
        onClick={onOpen}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-snug text-base-content/70">{guest.nome}</span>
          {guest.apelido && guest.apelido !== guest.nome && (
            <span className="block text-xs text-base-content/50">{guest.apelido}</span>
          )}
        </span>
      </button>
      <div className="flex shrink-0 justify-end gap-1 px-2 pb-2 sm:pb-0">
        <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={onReactivate}>
          <RotateCcw className="w-4 h-4" />
          Reativar
        </button>
        {isOwner && (
          <button
            type="button"
            className="btn btn-ghost btn-sm text-error min-h-11"
            onClick={excluir}
          >
            <Trash2 className="w-4 h-4" />
            {confirmandoExclusao ? 'Confirmar exclusão' : 'Excluir'}
          </button>
        )}
      </div>
    </li>
  );
};

export const CommunityGuestsArea: FC<CommunityGuestsAreaProps> = ({
  guests,
  noCloud,
  isOwner,
  onSave,
  onDeactivate,
  onReactivate,
  onDelete,
  searchSlot,
  initialEditingId,
  onCloseEditor,
  onAvatarApplied,
}) => {
  const convidadoAusente =
    !!initialEditingId && !guests.some((item) => item.id === initialEditingId);
  const [mode, setMode] = useState<'list' | 'new' | string>(() =>
    initialEditingId && !convidadoAusente ? initialEditingId : 'list',
  );
  const [avisoConvidadoAusente, setAvisoConvidadoAusente] = useState(convidadoAusente);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);
  const [avisoDaLista, setAvisoDaLista] = useState<string | null>(null);

  const ativos = guests.filter((guest) => guest.ativo !== false);
  const desativados = guests.filter((guest) => guest.ativo === false);

  const limparAvisos = () => {
    setAvisoConvidadoAusente(false);
    setErroDaLista(null);
    setAvisoDaLista(null);
  };

  const abrirEditor = (proximo: 'new' | string) => {
    limparAvisos();
    setMode(proximo);
  };

  const fecharEditor = () => {
    setMode('list');
    onCloseEditor?.();
  };

  const reativarDaLista = (playerId: string) => {
    limparAvisos();
    const result = onReactivate(playerId);
    if (!result.ok) setErroDaLista(result.error.message);
  };

  const excluirDaLista = (playerId: string) => {
    limparAvisos();
    const result = onDelete(playerId);
    if (!result.ok) {
      setErroDaLista(result.error.message);
      return;
    }
    if (result.value === 'deactivated') {
      setAvisoDaLista(
        'Esse convidado tem partidas no histórico e ainda não foi para a nuvem: ele continua desativado para os jogos não perderem ninguém.',
      );
    }
  };

  if (mode !== 'list') {
    const guest = mode === 'new' ? null : (guests.find((item) => item.id === mode) ?? null);
    return (
      <GuestEditor
        key={mode}
        guest={guest}
        noCloud={noCloud}
        onBack={fecharEditor}
        onSave={onSave}
        onDeactivate={onDeactivate}
        onReactivate={onReactivate}
        onAvatarApplied={onAvatarApplied}
      />
    );
  }

  return (
    <div className="space-y-5">
      <button type="button" className="btn btn-primary min-h-11" onClick={() => abrirEditor('new')}>
        <Plus className="w-4 h-4" /> Cadastrar convidado
      </button>

      {avisoConvidadoAusente && (
        <p role="status" className="text-sm text-warning">
          Esse convidado não está mais aqui: foi removido ou ganhou conta e agora aparece em
          Pessoas.
        </p>
      )}

      {ativos.length === 0 ? (
        <p className="text-sm text-base-content/70">
          {desativados.length === 0 ? 'Nenhum convidado ainda.' : 'Nenhum convidado ativo.'}
        </p>
      ) : (
        <ul aria-label="Convidados ativos" className={listClasses}>
          {ativos.map((guest) => {
            const incompleta =
              Object.keys(validateAthleteProfile(draftFromPlayer(guest))).length > 0;
            return (
              <li key={guest.id}>
                <button
                  type="button"
                  className={`${rowButtonClasses} w-full`}
                  onClick={() => abrirEditor(guest.id)}
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

      {desativados.length > 0 && (
        <section className="space-y-2">
          <p id="convidados-desativados" className={labelClasses}>
            Desativados
          </p>
          {erroDaLista && (
            <div role="alert" className="alert alert-error alert-soft text-xs rounded-xl">
              <span>{erroDaLista}</span>
            </div>
          )}
          {avisoDaLista && (
            <p role="status" className="text-sm text-base-content/70">
              {avisoDaLista}
            </p>
          )}
          <ul aria-labelledby="convidados-desativados" className={listClasses}>
            {desativados.map((guest) => (
              <DeactivatedGuestRow
                key={guest.id}
                guest={guest}
                isOwner={isOwner}
                onOpen={() => abrirEditor(guest.id)}
                onReactivate={() => reativarDaLista(guest.id)}
                onDelete={() => excluirDaLista(guest.id)}
              />
            ))}
          </ul>
        </section>
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
