import { useState, type FormEvent } from 'react';
import { X, Volleyball } from 'lucide-react';
import type { Community } from '@shared/types';

const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

interface CreateCommunityModalProps {
  onClose: () => void;
  /** Só é chamado no submit: cancelar não grava nada. */
  onCreate: (input: Partial<Community>) => void;
}

/**
 * Nascimento da comunidade.
 *
 * Antes, "Nova" gravava na hora uma comunidade chamada "Nova comunidade N" e
 * navegava: quem só queria olhar saía com sujeira permanente na lista, sem
 * cancelar e sem ter digitado nada.
 */
export function CreateCommunityModal({ onClose, onCreate }: CreateCommunityModalProps) {
  const [nome, setNome] = useState('');
  const [local, setLocal] = useState('');
  const [dia, setDia] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const submeter = (event: FormEvent) => {
    event.preventDefault();
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setErro('Dê um nome à comunidade — é assim que o grupo vai reconhecê-la.');
      return;
    }
    onCreate({
      name: nomeLimpo,
      description: '',
      defaultLocation: local.trim(),
      defaultDay: dia,
      defaultStartTime: '',
      defaultEndTime: '',
      defaultFormat: 'free_play',
      color: 'primary',
      icon: 'volleyball',
      archived: false,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="modal modal-open" role="dialog" aria-labelledby="criar-comunidade-titulo">
      <form onSubmit={submeter} className="modal-box max-w-lg space-y-5">
        <div className="flex items-start justify-between gap-3">
          <h3
            id="criar-comunidade-titulo"
            className="flex items-center gap-2 text-lg font-black uppercase tracking-tight"
          >
            <Volleyball className="h-5 w-5 text-primary" /> Nova comunidade
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar sem criar a comunidade"
            className="btn btn-ghost btn-sm btn-square"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="form-control">
          <span className="label-text font-bold">Nome da comunidade</span>
          <input
            value={nome}
            onChange={(event) => {
              setNome(event.target.value);
              if (erro) setErro(null);
            }}
            placeholder="Ex.: Pelada de quarta"
            className={`input input-bordered w-full ${erro ? 'input-error' : ''}`}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'criar-comunidade-erro' : undefined}
            autoFocus
          />
        </label>

        {erro && (
          <p id="criar-comunidade-erro" role="alert" className="text-sm text-error">
            {erro}
          </p>
        )}

        <label className="form-control">
          <span className="label-text font-bold">Onde vocês jogam</span>
          <input
            value={local}
            onChange={(event) => setLocal(event.target.value)}
            placeholder="Ex.: Quadra do clube"
            className="input input-bordered w-full"
          />
          <span className="label-text-alt text-base-content/60">
            Opcional. Entra sozinho na convocatória do WhatsApp.
          </span>
        </label>

        <fieldset className="form-control">
          <legend className="label-text font-bold">Dia da semana</legend>
          <div className="flex flex-wrap gap-2 pt-1">
            {WEEKDAY_LABELS.map((label) => {
              const ativo = dia === label;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setDia(ativo ? '' : label)}
                  className={`btn btn-sm min-h-[44px] px-4 font-bold uppercase tracking-wide ${
                    ativo ? 'btn-primary' : 'btn-outline'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <span className="label-text-alt pt-1 text-base-content/60">
            Opcional. Serve de padrão ao marcar a próxima pelada.
          </span>
        </fieldset>

        <div className="flex flex-col gap-3 pt-1 sm:flex-row-reverse">
          <button
            type="submit"
            className="btn btn-primary min-h-[48px] flex-1 px-6 font-black uppercase tracking-wider"
          >
            Criar comunidade
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost min-h-[48px] flex-1 px-6 font-bold uppercase tracking-wider"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
