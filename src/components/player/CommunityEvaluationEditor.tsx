import { useEffect, useRef, useState, type FC } from 'react';
import type { CommunityEvaluationCommand, CommunityEvaluationEditorContext } from '@shared/types';
import {
  loadCommunityEvaluationEditor,
  parseScores,
  setCommunityEvaluator,
  submitCommunityEvaluation,
} from '@app/communityEvaluationUseCases';
import { generateUUID } from '@logic/uuid';
import type { AppError } from '@app/appResult';

const FIELDS = [
  ['saque', 'Saque'],
  ['recepcao', 'Recepção'],
  ['levantamento', 'Levantamento'],
  ['ataque', 'Ataque'],
  ['bloqueio', 'Bloqueio'],
  ['defesa', 'Defesa'],
  ['velocidade', 'Velocidade'],
  ['resistencia', 'Resistência'],
  ['leituraDeJogo', 'Leitura de jogo'],
  ['regularidade', 'Regularidade'],
  ['controleEmocional', 'Controle emocional'],
] as const;

const Editor: FC<{
  communityId: string;
  playerId: string;
  onSaved: () => void;
}> = ({ communityId, playerId, onSaved }) => {
  const [context, setContext] = useState<CommunityEvaluationEditorContext | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<CommunityEvaluationCommand | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<AppError>();
  const [selectedEvaluator, setSelectedEvaluator] = useState('');
  const [reload, setReload] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const mounted = useRef(true);
  const busy = useRef(false);
  const [managing, setManaging] = useState(false);
  const requestKey = `${communityId}:${playerId}:${reload}`;

  useEffect(() => {
    let current = true;
    mounted.current = true;
    void loadCommunityEvaluationEditor(communityId, playerId).then((result) => {
      if (!current) return;
      setPending(null);
      setError(undefined);
      setMessage('');
      setSelectedEvaluator('');
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
      setMessage('Avaliação salva. Atualizando o perfil.');
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
      <p role="status" className="text-sm">
        Carregando avaliação…
      </p>
    );
  }

  async function manage(action: () => ReturnType<typeof setCommunityEvaluator>) {
    if (busy.current || pending) return;
    busy.current = true;
    setManaging(true);
    setError(undefined);
    const result = await action();
    if (!mounted.current) return;
    busy.current = false;
    setManaging(false);
    if (result.ok) setReload((value) => value + 1);
    else setError(result.error);
  }
  const management = context.can_manage_evaluators && context.authority_model === 'target' && (
    <fieldset disabled={managing || !!pending} className="space-y-3">
      <label className="text-sm">
        Avaliador
        <select
          aria-label="Avaliador"
          className="select select-bordered select-sm w-full"
          value={selectedEvaluator}
          onChange={(event) => setSelectedEvaluator(event.target.value)}
        >
          <option value="">Selecione</option>
          {context.members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn btn-outline btn-sm"
        disabled={!selectedEvaluator || managing}
        onClick={() =>
          void manage(() =>
            setCommunityEvaluator(
              communityId,
              selectedEvaluator,
              !context.members.find((member) => member.user_id === selectedEvaluator)?.is_evaluator,
            ),
          )
        }
      >
        {context.members.find((member) => member.user_id === selectedEvaluator)?.is_evaluator
          ? 'Revogar avaliador'
          : 'Autorizar avaliador'}
      </button>
    </fieldset>
  );
  const mismatch =
    context.own_evaluation && context.own_evaluation.rubric_version !== context.rubric_version;
  if (context.authority_model === 'legacy' || !context.can_evaluate || mismatch)
    return (
      <section className="rounded-xl border border-base-300 bg-base-200 p-4 space-y-3">
        <h3 className="font-semibold">Avaliação comunitária</h3>
        <p>
          {context.authority_model === 'legacy'
            ? 'Este modelo ainda não foi ativado nesta comunidade.'
            : mismatch
              ? 'Sua avaliação usa outra versão de critérios e não pode ser editada neste modelo.'
              : 'Você ainda não está autorizado a avaliar nesta comunidade.'}
        </p>
        {management}
        {error && <p role="alert">{error.message}</p>}
      </section>
    );
  const retry = pending;
  return (
    <section className="rounded-xl border border-base-300 bg-base-200 p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="font-semibold">Avaliar atleta nesta comunidade</h3>
        <p className="text-sm text-base-content/75">
          Informe apenas os fundamentos observados. Campos vazios continuam sem avaliação.
        </p>
      </div>
      {management}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map(([key, label]) => (
          <label key={key} className="text-sm space-y-1">
            <span>{label}</span>
            <input
              aria-label={label}
              type="number"
              min="0"
              max="10"
              step="0.5"
              className="input input-bordered input-sm w-full"
              value={values[key] ?? ''}
              disabled={!!pending || managing || error?.code === 'conflict'}
              onChange={(event) =>
                setValues((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          </label>
        ))}
      </div>
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
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-primary btn-sm"
          disabled={managing || error?.code === 'conflict' || (!!pending && !error?.recoverable)}
          onClick={() => {
            const parsed = pending ?? parseScores(values);
            if (!('commandId' in parsed)) {
              if (!parsed.ok) {
                setError(parsed.error);
                return;
              }
              const command = {
                commandId: generateUUID(),
                contributionId: generateUUID(),
                communityId,
                playerId,
                rubricVersion: context.rubric_version,
                dimensions: parsed.value,
                expectedContributionId: context.own_evaluation?.contribution_id ?? null,
              };
              void save(command);
            } else void save(parsed);
          }}
        >
          {pending && error?.recoverable ? 'Tentar novamente' : 'Enviar avaliação'}
        </button>
        {'code' in (error ?? {}) && error?.code === 'conflict' && (
          <button className="btn btn-ghost btn-sm" onClick={() => setReload((value) => value + 1)}>
            Recarregar avaliação
          </button>
        )}
      </div>
      {retry && error?.recoverable && (
        <p className="text-xs text-base-content/60">
          A mesma operação será repetida com o mesmo identificador.
        </p>
      )}
    </section>
  );
};

export function CommunityEvaluationEditor(props: {
  communityId: string;
  playerId: string;
  currentUserId?: string | null;
  onSaved: () => void;
}) {
  return (
    <Editor
      key={`${props.currentUserId ?? ''}:${props.communityId}:${props.playerId}`}
      {...props}
    />
  );
}
