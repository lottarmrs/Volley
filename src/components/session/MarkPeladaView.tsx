import { useState, type FormEvent, type ReactNode } from 'react';
import { CalendarPlus } from 'lucide-react';
import type { MarkPeladaValues } from '@app/markPeladaDefaults';

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wider text-base-content/60">
        {rotulo}
      </span>
      {children}
    </label>
  );
}

export function MarkPeladaView({
  communityName,
  defaults,
  today,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  communityName: string;
  defaults: MarkPeladaValues;
  today: string;
  busy: boolean;
  error: string | null;
  onSubmit: (values: MarkPeladaValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(defaults);
  const [aviso, setAviso] = useState<string | null>(null);
  const muda = <K extends keyof MarkPeladaValues>(campo: K, valor: MarkPeladaValues[K]) =>
    setValues((atual) => ({ ...atual, [campo]: valor }));

  const enviar = (event: FormEvent) => {
    event.preventDefault();
    if (!values.time) return setAviso('Escolha o horário da pelada.');
    if (!values.date || values.date < today) return setAviso('Escolha hoje ou um dia à frente.');
    if (!Number.isInteger(values.capacity) || values.capacity < 2) {
      return setAviso('A lista precisa de pelo menos 2 vagas.');
    }
    setAviso(null);
    onSubmit(values);
  };

  const mensagem = aviso ?? error;

  return (
    <form onSubmit={enviar} className="mx-auto max-w-lg space-y-6" noValidate>
      <header className="space-y-1">
        <h2 className="text-2xl font-extrabold tracking-tight text-base-content">Marcar pelada</h2>
        <p className="text-sm text-base-content/70">{communityName}</p>
      </header>

      <div className="space-y-4 rounded-box border border-base-300 bg-base-200 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data">
            <input
              type="date"
              required
              min={today}
              className="input input-bordered w-full"
              value={values.date}
              onChange={(event) => muda('date', event.target.value)}
            />
          </Campo>
          <Campo rotulo="Horário">
            <input
              type="time"
              required
              className="input input-bordered w-full font-mono"
              value={values.time}
              onChange={(event) => muda('time', event.target.value)}
            />
          </Campo>
        </div>
        <Campo rotulo="Local">
          <input
            type="text"
            className="input input-bordered w-full"
            placeholder="Onde vai ser"
            value={values.location}
            onChange={(event) => muda('location', event.target.value)}
          />
        </Campo>
        <Campo rotulo="Vagas na lista">
          <input
            type="number"
            min={2}
            inputMode="numeric"
            className="input input-bordered w-28 font-mono"
            value={Number.isNaN(values.capacity) ? '' : values.capacity}
            onChange={(event) => muda('capacity', Number.parseInt(event.target.value, 10))}
          />
        </Campo>
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-bold uppercase tracking-wider text-base-content/60">
            Formato
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['free_play', 'Jogo livre'],
                ['tournament', 'Torneio'],
              ] as const
            ).map(([tipo, rotulo]) => (
              <label
                key={tipo}
                className={`btn min-h-11 ${values.type === tipo ? 'btn-primary' : 'btn-ghost border-base-content/20'}`}
              >
                <input
                  type="radio"
                  name="formato"
                  className="sr-only"
                  checked={values.type === tipo}
                  onChange={() => muda('type', tipo)}
                />
                {rotulo}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {mensagem && (
        <p role="alert" className="text-sm font-semibold text-error">
          {mensagem}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-ghost min-h-11" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary min-h-11 sm:min-w-56" disabled={busy}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Marcando…' : 'Marcar e abrir a lista'}
        </button>
      </div>
    </form>
  );
}
