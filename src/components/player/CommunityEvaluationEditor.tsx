import { useEffect, useRef, useState, type FC } from 'react';
import { Eraser } from 'lucide-react';
import type { CommunityEvaluationCommand, CommunityEvaluationEditorContext } from '@shared/types';
import {
  loadCommunityEvaluationEditor,
  parseScores,
  submitCommunityEvaluation,
} from '@app/communityEvaluationUseCases';
import { generateUUID } from '@logic/uuid';
import type { AppError } from '@app/appResult';

const GROUPS = [
  {
    title: 'Técnica',
    fields: [
      ['saque', 'Saque'],
      ['recepcao', 'Recepção'],
      ['levantamento', 'Levantamento'],
      ['ataque', 'Ataque'],
      ['bloqueio', 'Bloqueio'],
      ['defesa', 'Defesa'],
    ],
  },
  {
    title: 'Físico',
    fields: [
      ['velocidade', 'Velocidade'],
      ['resistencia', 'Resistência'],
    ],
  },
  {
    title: 'Mental',
    fields: [
      ['leituraDeJogo', 'Leitura de jogo'],
      ['regularidade', 'Regularidade'],
      ['controleEmocional', 'Controle emocional'],
    ],
  },
] as const;

const TOTAL_FIELDS = GROUPS.reduce((total, group) => total + group.fields.length, 0);

const formatScore = (raw: string) => raw.replace('.', ',');

const Nota: FC<{
  field: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}> = ({ field, label, value, disabled, onChange }) => {
  const blank = value === '';
  const commitIfBlank = (event: { currentTarget: HTMLInputElement }) => {
    if (blank) onChange(event.currentTarget.value);
  };
  return (
    <div className="space-y-2 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`nota-${field}`} className="text-sm font-semibold text-base-content">
          {label}
        </label>
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={
              blank
                ? 'text-xs font-semibold uppercase tracking-wider text-base-content/45'
                : 'font-mono text-2xl font-bold tabular-nums leading-none text-base-content'
            }
          >
            {blank ? 'sem nota' : formatScore(value)}
          </span>
          {!blank && (
            <button
              type="button"
              aria-label={`Limpar ${label}`}
              className="btn btn-ghost btn-square btn-sm min-h-[44px] min-w-[44px] text-base-content/50"
              disabled={disabled}
              onClick={() => onChange('')}
            >
              <Eraser className="h-4 w-4" aria-hidden />
            </button>
          )}
        </span>
      </div>
      <input
        id={`nota-${field}`}
        aria-label={label}
        aria-valuetext={blank ? 'sem nota' : formatScore(value)}
        type="range"
        min="0"
        max="10"
        step="0.5"
        value={blank ? '5' : value}
        disabled={disabled}
        className={`range range-primary range-lg w-full ${blank ? 'opacity-35 [&::-moz-range-thumb]:opacity-0 [&::-webkit-slider-thumb]:opacity-0' : ''}`}
        onChange={(event) => onChange(event.target.value)}
        onPointerUp={commitIfBlank}
        onKeyUp={commitIfBlank}
      />
    </div>
  );
};

const Editor: FC<{
  communityId: string;
  playerId: string;
  saveLabel?: string;
  onSaved: () => void;
}> = ({ communityId, playerId, saveLabel = 'Salvar', onSaved }) => {
  const [context, setContext] = useState<CommunityEvaluationEditorContext | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<CommunityEvaluationCommand | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<AppError>();
  const [reload, setReload] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const mounted = useRef(true);
  const busy = useRef(false);
  const requestKey = `${communityId}:${playerId}:${reload}`;

  useEffect(() => {
    let current = true;
    mounted.current = true;
    void loadCommunityEvaluationEditor(communityId, playerId).then((result) => {
      if (!current) return;
      setPending(null);
      setError(undefined);
      setMessage('');
      if (result.ok) {
        setContext(result.value);
        setLoadedKey(requestKey);
        const own = result.value.own_evaluation;
        setValues(
          own && own.rubric_version === result.value.rubric_version
            ? Object.fromEntries(
                Object.entries(own.dimensions).map(([key, value]) => [key, String(value)]),
              )
            : {},
        );
      } else {
        setContext(null);
        setLoadedKey(requestKey);
        setError(result.error);
      }
    });
    return () => {
      current = false;
      mounted.current = false;
    };
  }, [communityId, playerId, reload, requestKey]);

  async function save(command: CommunityEvaluationCommand) {
    if (busy.current) return;
    busy.current = true;
    setPending(command);
    setError(undefined);
    setMessage('');
    const result = await submitCommunityEvaluation(command);
    if (!mounted.current) return;
    busy.current = false;
    if (result.ok) {
      setContext((current) =>
        current
          ? {
              ...current,
              own_evaluation: {
                contribution_id: command.contributionId,
                rubric_version: command.rubricVersion,
                dimensions: command.dimensions,
              },
            }
          : current,
      );
      setPending(null);
      setMessage('Avaliação salva.');
      onSaved();
      return;
    }
    if (result.error.recoverable) {
      setError(result.error);
      return;
    }
    setPending(null);
    setError(result.error);
  }

  if (!context || loadedKey !== requestKey) {
    if (error && loadedKey === requestKey)
      return (
        <p role="alert" className="text-sm text-error">
          {error.message}
        </p>
      );
    return (
      <p role="status" className="py-10 text-center text-sm text-base-content/60">
        Carregando avaliação…
      </p>
    );
  }

  const mismatch =
    context.own_evaluation && context.own_evaluation.rubric_version !== context.rubric_version;
  if (context.authority_model === 'legacy' || !context.can_evaluate || mismatch)
    return (
      <section className="space-y-3 rounded-box border border-base-300 bg-base-200 p-4">
        <p>
          {context.authority_model === 'legacy'
            ? 'Este modelo ainda não foi ativado nesta comunidade.'
            : mismatch
              ? 'Sua avaliação usa outra versão de critérios e não pode ser editada neste modelo.'
              : 'Você não avalia nesta comunidade. Quem administra pode deixar você avaliar em Gestão → Membros.'}
        </p>
        {error && <p role="alert">{error.message}</p>}
      </section>
    );

  const locked = !!pending || error?.code === 'conflict';
  const filled = Object.values(values).filter((value) => value !== '').length;

  return (
    <section className="space-y-2">
      <p className="text-sm text-base-content/70">
        <span className="font-mono font-semibold tabular-nums text-base-content">
          {filled} de {TOTAL_FIELDS}
        </span>{' '}
        fundamentos com nota. Deixe sem nota o que você não viu.
      </p>

      {GROUPS.map((group) => (
        <fieldset key={group.title} className="border-t border-base-300 pt-4">
          <legend className="pr-2 text-xs font-bold uppercase tracking-wider text-base-content/60">
            {group.title}
          </legend>
          <div className="divide-y divide-base-300/60">
            {group.fields.map(([key, label]) => (
              <Nota
                key={key}
                field={key}
                label={label}
                value={values[key] ?? ''}
                disabled={locked}
                onChange={(value) => setValues((current) => ({ ...current, [key]: value }))}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-base-300 bg-base-100/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {error && (
          <p role="alert" className="text-sm text-error">
            {error.message}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-success">
            {message}
          </p>
        )}
        <div className="flex gap-2">
          {error?.code === 'conflict' && (
            <button
              type="button"
              className="btn btn-outline min-h-[48px]"
              onClick={() => setReload((value) => value + 1)}
            >
              Recarregar avaliação
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary min-h-[48px] flex-1"
            disabled={error?.code === 'conflict' || (!!pending && !error?.recoverable)}
            onClick={() => {
              const parsed = pending ?? parseScores(values);
              if (!('commandId' in parsed)) {
                if (!parsed.ok) {
                  setError(parsed.error);
                  return;
                }
                void save({
                  commandId: generateUUID(),
                  contributionId: generateUUID(),
                  communityId,
                  playerId,
                  rubricVersion: context.rubric_version,
                  dimensions: parsed.value,
                  expectedContributionId: context.own_evaluation?.contribution_id ?? null,
                });
              } else void save(parsed);
            }}
          >
            {pending && error?.recoverable ? 'Tentar novamente' : saveLabel}
          </button>
        </div>
        {pending && error?.recoverable && (
          <p className="text-xs text-base-content/60">
            A mesma operação será repetida com o mesmo identificador.
          </p>
        )}
      </div>
    </section>
  );
};

export function CommunityEvaluationEditor(props: {
  communityId: string;
  playerId: string;
  currentUserId?: string | null;
  saveLabel?: string;
  onSaved: () => void;
}) {
  return (
    <Editor
      key={`${props.currentUserId ?? ''}:${props.communityId}:${props.playerId}`}
      {...props}
    />
  );
}
