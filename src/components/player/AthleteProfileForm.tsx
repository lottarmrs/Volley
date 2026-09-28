import type { FC } from 'react';
import { useState } from 'react';
import type { AthleteProfileDraft } from '@domain/athleteProfile';
import { ATHLETE_POSITIONS, validateAthleteProfile } from '@domain/athleteProfile';
import type { Position } from '../../types';

export interface AthleteProfileFormProps {
  value: AthleteProfileDraft;
  onChange: (next: AthleteProfileDraft) => void;
  showCondition?: boolean;
  level?: { value: 1 | 2 | 3 | 4 | 5; onChange: (n: 1 | 2 | 3 | 4 | 5) => void } | null;
  serverError?: string | null;
  disabled?: boolean;
}

const POSITION_LABELS: Record<Position, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
  'all-rounder': 'Versátil',
};

const LEVEL_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '1 — iniciante',
  2: '2',
  3: '3',
  4: '4',
  5: '5 — forte',
};

type CampoTocavel =
  | 'genero'
  | 'posicaoPrincipal'
  | 'alturaCm'
  | 'maoDominante'
  | 'posicoesSecundarias';

const labelClasses = 'text-[11px] font-bold uppercase tracking-wider text-base-content/70';
const inputClasses =
  'input input-bordered w-full rounded-xl bg-base-100/60 focus:bg-base-100 transition-colors min-h-11';

function pillClasses(selected: boolean, accent: 'accent' | 'primary', disabled: boolean) {
  const tonalidade =
    accent === 'accent'
      ? 'bg-accent/20 border-accent text-accent'
      : 'bg-primary/20 border-primary text-primary';
  return [
    'min-h-11 px-3 rounded-xl border flex items-center justify-center text-center text-sm font-bold select-none transition-colors focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary',
    selected ? tonalidade : 'bg-base-100/60 border-base-300 text-base-content/70',
    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-base-content/30',
  ].join(' ');
}

function FieldError({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return <p className="text-xs text-error mt-1">{mensagem}</p>;
}

export const AthleteProfileForm: FC<AthleteProfileFormProps> = ({
  value,
  onChange,
  showCondition,
  level,
  serverError,
  disabled,
}) => {
  const [tocados, setTocados] = useState<Set<CampoTocavel>>(new Set());
  const erros = validateAthleteProfile(value);

  function tocar(campo: CampoTocavel) {
    setTocados((atual) => {
      if (atual.has(campo)) return atual;
      const proximo = new Set(atual);
      proximo.add(campo);
      return proximo;
    });
  }

  function erroDe(campo: CampoTocavel) {
    return tocados.has(campo) ? erros[campo] : undefined;
  }

  return (
    <div className={disabled ? 'space-y-5 opacity-60 pointer-events-none' : 'space-y-5'}>
      {serverError && (
        <div
          className="alert alert-error alert-soft text-xs flex items-center gap-2 rounded-xl"
          role="alert"
        >
          <span>{serverError}</span>
        </div>
      )}

      <fieldset className="space-y-1">
        <legend className={labelClasses}>Gênero</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['M', 'F'] as const).map((genero) => (
            <label
              key={genero}
              className={pillClasses(value.genero === genero, 'accent', !!disabled)}
            >
              <input
                type="radio"
                name="genero"
                className="sr-only"
                checked={value.genero === genero}
                disabled={disabled}
                onChange={() => {
                  tocar('genero');
                  onChange({ ...value, genero });
                }}
                onBlur={() => tocar('genero')}
              />
              {genero === 'M' ? 'Masculino' : 'Feminino'}
            </label>
          ))}
        </div>
        <FieldError mensagem={erroDe('genero')} />
      </fieldset>

      <fieldset className="space-y-1">
        <legend className={labelClasses}>Posição principal</legend>
        <div className="grid grid-cols-3 gap-2">
          {ATHLETE_POSITIONS.map((pos) => (
            <label
              key={pos}
              className={pillClasses(value.posicaoPrincipal === pos, 'accent', !!disabled)}
            >
              <input
                type="radio"
                name="posicaoPrincipal"
                className="sr-only"
                checked={value.posicaoPrincipal === pos}
                disabled={disabled}
                onChange={() => {
                  tocar('posicaoPrincipal');
                  onChange({
                    ...value,
                    posicaoPrincipal: pos,
                    posicoesSecundarias: value.posicoesSecundarias.filter((p) => p !== pos),
                  });
                }}
                onBlur={() => tocar('posicaoPrincipal')}
              />
              {POSITION_LABELS[pos]}
            </label>
          ))}
        </div>
        <FieldError mensagem={erroDe('posicaoPrincipal')} />
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="form-control">
          <label className={`${labelClasses} pb-1`} htmlFor="athlete-altura">
            Altura (cm)
          </label>
          <div className="relative">
            <input
              id="athlete-altura"
              aria-label="Altura (cm)"
              type="number"
              inputMode="numeric"
              min={120}
              max={230}
              disabled={disabled}
              value={value.alturaCm ?? ''}
              onChange={(event) => {
                tocar('alturaCm');
                const bruto = event.target.value;
                onChange({ ...value, alturaCm: bruto === '' ? null : Number(bruto) });
              }}
              onBlur={() => tocar('alturaCm')}
              className={`${inputClasses} pr-10`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-base-content/50">
              cm
            </span>
          </div>
          <FieldError mensagem={erroDe('alturaCm')} />
        </div>

        <fieldset className="space-y-1">
          <legend className={labelClasses}>Mão dominante</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { valor: 'direita', rotulo: 'Destro' },
                { valor: 'esquerda', rotulo: 'Canhoto' },
              ] as const
            ).map(({ valor, rotulo }) => (
              <label
                key={valor}
                className={pillClasses(value.maoDominante === valor, 'accent', !!disabled)}
              >
                <input
                  type="radio"
                  name="maoDominante"
                  className="sr-only"
                  checked={value.maoDominante === valor}
                  disabled={disabled}
                  onChange={() => {
                    tocar('maoDominante');
                    onChange({ ...value, maoDominante: valor });
                  }}
                  onBlur={() => tocar('maoDominante')}
                />
                {rotulo}
              </label>
            ))}
          </div>
          <FieldError mensagem={erroDe('maoDominante')} />
        </fieldset>
      </div>

      <div className="divider text-[11px] uppercase tracking-wider text-base-content/50">
        Opcional
      </div>

      <div className="form-control">
        <label className={`${labelClasses} pb-1`} htmlFor="athlete-apelido">
          Apelido (opcional)
        </label>
        <input
          id="athlete-apelido"
          type="text"
          disabled={disabled}
          value={value.apelido}
          onChange={(event) => onChange({ ...value, apelido: event.target.value })}
          className={inputClasses}
        />
      </div>

      <fieldset className="space-y-1">
        <legend className={labelClasses}>Posições secundárias (opcional)</legend>
        <div className="grid grid-cols-3 gap-2">
          {ATHLETE_POSITIONS.map((pos) => {
            const ehPrincipal = pos === value.posicaoPrincipal;
            const selecionada = value.posicoesSecundarias.includes(pos);
            return (
              <label
                key={pos}
                className={pillClasses(selecionada, 'primary', !!disabled || ehPrincipal)}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selecionada}
                  disabled={disabled || ehPrincipal}
                  onChange={(event) => {
                    tocar('posicoesSecundarias');
                    const proximas = event.target.checked
                      ? [...value.posicoesSecundarias, pos]
                      : value.posicoesSecundarias.filter((p) => p !== pos);
                    onChange({ ...value, posicoesSecundarias: proximas });
                  }}
                  onBlur={() => tocar('posicoesSecundarias')}
                />
                {ehPrincipal ? `${POSITION_LABELS[pos]} (principal)` : POSITION_LABELS[pos]}
              </label>
            );
          })}
        </div>
        <FieldError mensagem={erroDe('posicoesSecundarias')} />
      </fieldset>

      {showCondition && (
        <fieldset className="space-y-3">
          <legend className={labelClasses}>Condição física</legend>
          <label className="flex items-center gap-2 min-h-11 text-sm text-base-content">
            <input
              type="checkbox"
              aria-label="Lesionado"
              className="checkbox checkbox-sm"
              disabled={disabled}
              checked={!!value.lesionado}
              onChange={(event) => onChange({ ...value, lesionado: event.target.checked })}
            />
            Lesionado
          </label>
          <div className="form-control">
            <label className={`${labelClasses} pb-1`} htmlFor="athlete-limitacao">
              Limitação física
            </label>
            <input
              id="athlete-limitacao"
              type="text"
              disabled={disabled}
              value={value.limitacaoFisica ?? ''}
              onChange={(event) =>
                onChange({ ...value, limitacaoFisica: event.target.value || null })
              }
              className={inputClasses}
            />
          </div>
        </fieldset>
      )}

      {level && (
        <fieldset className="space-y-1">
          <legend className={labelClasses}>Nível</legend>
          <div className="grid grid-cols-5 gap-2">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <label key={n} className={pillClasses(level.value === n, 'primary', !!disabled)}>
                <input
                  type="radio"
                  name="nivel"
                  className="sr-only"
                  checked={level.value === n}
                  disabled={disabled}
                  onChange={() => level.onChange(n)}
                />
                {LEVEL_LABELS[n]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
};
