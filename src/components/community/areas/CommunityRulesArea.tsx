import { Save, ShieldAlert } from 'lucide-react';
import React, { useState } from 'react';
import type { CommunityRules } from '../../../types';
import { useUnsavedGuard } from '../unsavedGuard';

export function CommunityRulesArea({
  rules,
  onSave,
  canEditRules = true,
}: {
  rules: CommunityRules;
  onSave: (rules: CommunityRules) => void;
  canEditRules?: boolean;
}) {
  const [draft, setDraft] = useState<CommunityRules>(rules);
  // Salvar Regras não escreve mais os campos padrão da comunidade: eles são
  // editados só na aba Dados. Enquanto os dois lugares gravavam, salvar Regras
  // reescrevia por cima o que Dados tinha acabado de mudar, com os valores
  // carregados quando esta aba montou.
  const save = () => onSave(draft);

  useUnsavedGuard({
    dirty: JSON.stringify(draft) !== JSON.stringify(rules),
    save,
    label: 'Regras',
  });

  return (
    <div className="space-y-3">
      {!canEditRules && (
        <div role="alert" className="alert alert-warning alert-soft">
          <ShieldAlert className="w-4 h-4" />
          <span className="text-sm">
            Modo de Leitura: Voce nao tem permissao para alterar as regras desta comunidade.
          </span>
        </div>
      )}

      {/* Local, Dia, Inicio, Fim e Formato viviam aqui E na aba Dados, com
          rotulos divergentes e dois botoes de salvar: ninguem sabia qual era a
          verdade. Regras ficou so com regra de jogo. */}
      <div className="rounded-xl border border-base-300 bg-base-200/60 p-4 text-sm leading-relaxed text-base-content/70">
        Local, dia e horário padrão da comunidade ficam na aba <strong>Dados</strong>, junto do
        nome. Aqui moram só as regras de jogo.
      </div>

      <RulesCollapse title="Jogo Livre">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <NumberField
            label="Times"
            value={draft.freePlay?.teamCount || 3}
            onChange={(value) =>
              setDraft({ ...draft, freePlay: { ...draft.freePlay, teamCount: value } })
            }
            disabled={!canEditRules}
          />
          <NumberField
            label="Pontos"
            value={draft.freePlay?.maxPoints || 15}
            onChange={(value) =>
              setDraft({ ...draft, freePlay: { ...draft.freePlay, maxPoints: value } })
            }
            disabled={!canEditRules}
          />
          <NumberField
            label="Limite consecutivo"
            value={draft.freePlay?.maxConsecutiveGames || 3}
            onChange={(value) =>
              setDraft({ ...draft, freePlay: { ...draft.freePlay, maxConsecutiveGames: value } })
            }
            disabled={!canEditRules}
          />
        </div>
      </RulesCollapse>

      <RulesCollapse title="Campeonato">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <NumberField
            label="Times"
            value={draft.tournament?.teamCount || 3}
            onChange={(value) =>
              setDraft({ ...draft, tournament: { ...draft.tournament, teamCount: value } })
            }
            disabled={!canEditRules}
          />
          <NumberField
            label="Pontos por vitoria"
            value={draft.tournament?.classificationPoints?.win || 3}
            onChange={(value) =>
              setDraft({
                ...draft,
                tournament: {
                  ...draft.tournament,
                  classificationPoints: {
                    win: value,
                    loss: draft.tournament?.classificationPoints?.loss || 0,
                  },
                },
              })
            }
            disabled={!canEditRules}
          />
          <NumberField
            label="Pontos por derrota"
            value={draft.tournament?.classificationPoints?.loss || 0}
            onChange={(value) =>
              setDraft({
                ...draft,
                tournament: {
                  ...draft.tournament,
                  classificationPoints: {
                    win: draft.tournament?.classificationPoints?.win || 3,
                    loss: value,
                  },
                },
              })
            }
            disabled={!canEditRules}
          />
        </div>
      </RulesCollapse>

      <RulesCollapse title="Times">
        <textarea
          className="textarea textarea-bordered w-full"
          value={(draft.defaultTeamNames || []).join('\n')}
          onChange={(event) =>
            setDraft({ ...draft, defaultTeamNames: event.target.value.split('\n').filter(Boolean) })
          }
          aria-label="Nomes padrão dos times, um por linha"
          placeholder="Um nome de time por linha"
          disabled={!canEditRules}
        />
      </RulesCollapse>

      <RulesCollapse title="Algoritmo">
        <div className="alert alert-info alert-soft">
          Pesos especificos podem ser ajustados futuramente; por enquanto esta comunidade usa o
          algoritmo atual do app com as regras padrao salvas acima.
        </div>
      </RulesCollapse>

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={save}
        disabled={!canEditRules}
      >
        <Save className="w-4 h-4" /> Salvar regras
      </button>
    </div>
  );
}

function RulesCollapse({
  title,
  open,
  children,
}: {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="collapse collapse-arrow bg-base-200 border border-base-300">
      {/* O checkbox é o único jeito de abrir a seção; sem nome, o leitor de tela
          anunciava só "caixa de seleção" cinco vezes seguidas. */}
      <input type="checkbox" defaultChecked={open} aria-label={`Abrir ou fechar ${title}`} />
      <div className="collapse-title font-bold">{title}</div>
      <div className="collapse-content">{children}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="form-control">
      <span className="label-text">{label}</span>
      <input
        type="number"
        className="input input-bordered"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
      />
    </label>
  );
}
