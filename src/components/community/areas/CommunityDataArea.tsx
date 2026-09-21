import { Copy, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { exportCommunity } from './exportCommunity';
import React, { useState } from 'react';
import type { Community, Player, Session } from '../../../types';
import { useUnsavedGuard } from '../unsavedGuard';
import { Field } from './Field';

export function CommunityDataArea({
  community,
  players,
  sessions,
  onUpdateCommunity,
  onDeleteCommunity,
  onDuplicateCommunity,
  onClearCommunityHistory,
  canEditRules = true,
  canDeleteCommunity = true,
  canClearHistory = true,
}: {
  community: Community;
  players: Player[];
  sessions: Session[];
  onUpdateCommunity: (communityId: string, patch: Partial<Community>) => boolean;
  onDeleteCommunity: (communityId: string) => void;
  onDuplicateCommunity: (communityId: string, includeAthletes: boolean) => void;
  onClearCommunityHistory: (communityId: string) => void;
  canEditRules?: boolean;
  canDeleteCommunity?: boolean;
  canClearHistory?: boolean;
}) {
  const [draft, setDraft] = useState<Community>(community);
  const [confirm, setConfirm] = useState<'delete' | 'history' | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const save = () => {
    const saved = onUpdateCommunity(community.id, draft);
    setNameError(saved ? null : 'Ja existe uma comunidade com esse nome.');
  };

  useUnsavedGuard({
    dirty: JSON.stringify(draft) !== JSON.stringify(community),
    save,
    label: 'Dados',
  });

  return (
    <div className="space-y-4">
      {!canEditRules && (
        <div role="alert" className="alert alert-warning alert-soft">
          <ShieldAlert className="w-4 h-4" />
          <span className="text-sm">
            Modo de Leitura: Voce nao tem permissao para alterar os dados desta comunidade.
          </span>
        </div>
      )}
      <div className="card card-border bg-base-200">
        <div className="card-body gap-3">
          <Field
            label="Nome"
            value={draft.name}
            onChange={(value) => {
              setDraft({ ...draft, name: value });
              setNameError(null);
            }}
            disabled={!canEditRules}
            error={nameError || undefined}
          />
          <label className="form-control">
            <span className="label-text">Descrição</span>
            <textarea
              className="textarea textarea-bordered"
              value={draft.description || ''}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              disabled={!canEditRules}
            />
          </label>
          <Field
            label="Local padrao"
            value={draft.defaultLocation || ''}
            onChange={(value) => setDraft({ ...draft, defaultLocation: value })}
            disabled={!canEditRules}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field
              label="Dia"
              value={draft.defaultDay || ''}
              onChange={(value) => setDraft({ ...draft, defaultDay: value })}
              disabled={!canEditRules}
            />
            <Field
              label="Inicio"
              type="time"
              value={draft.defaultStartTime || ''}
              onChange={(value) => setDraft({ ...draft, defaultStartTime: value })}
              disabled={!canEditRules}
            />
            <Field
              label="Fim"
              type="time"
              value={draft.defaultEndTime || ''}
              onChange={(value) => setDraft({ ...draft, defaultEndTime: value })}
              disabled={!canEditRules}
            />
          </div>
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              className="toggle"
              checked={Boolean(draft.archived)}
              onChange={(event) => setDraft({ ...draft, archived: event.target.checked })}
              disabled={!canEditRules}
            />
            <span className="label-text">Arquivar comunidade</span>
          </label>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!canEditRules}>
            <Save className="w-4 h-4" /> Salvar dados
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => onDuplicateCommunity(community.id, true)}
        >
          <Copy className="w-4 h-4" /> Duplicar com atletas
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => exportCommunity(community, players, sessions)}
        >
          Exportar comunidade
        </button>
        {canClearHistory && (
          <button type="button" className="btn btn-warning" onClick={() => setConfirm('history')}>
            <ShieldAlert className="w-4 h-4" /> Limpar historico
          </button>
        )}
        {canDeleteCommunity && (
          <button type="button" className="btn btn-error" onClick={() => setConfirm('delete')}>
            <Trash2 className="w-4 h-4" /> Excluir comunidade
          </button>
        )}
      </div>

      {confirm && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Confirmar ação</h3>
            <p className="py-4">
              {confirm === 'delete'
                ? 'Essa ação exclui a comunidade deste aparelho. Os atletas podem ser mantidos no elenco geral.'
                : 'Essa ação remove o vínculo de histórico das sessões desta comunidade.'}
            </p>
            <div className="modal-action">
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-error"
                onClick={() => {
                  if (confirm === 'delete') onDeleteCommunity(community.id);
                  if (confirm === 'history') onClearCommunityHistory(community.id);
                  setConfirm(null);
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
