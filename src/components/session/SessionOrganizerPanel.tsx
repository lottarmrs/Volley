import React, { useState } from 'react';
import { ShieldCheck, UserCog } from 'lucide-react';
import type { AppResult } from '@app/appResult';

export interface SessionOrganizerMember {
  userId: string;
  nome: string;
}

interface SessionOrganizerPanelProps {
  membros: SessionOrganizerMember[];
  currentUserId: string | null;
  organizadorAtual: string | null;
  podeTransferir: boolean;
  onTransfer: (organizerUserId: string) => Promise<AppResult<void>>;
  onClose: () => void;
}

export function SessionOrganizerPanel({
  membros,
  currentUserId,
  organizadorAtual,
  podeTransferir,
  onTransfer,
  onClose,
}: SessionOrganizerPanelProps) {
  const [escolhido, setEscolhido] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const transferir = async (userId: string) => {
    setOcupado(true);
    setErro(null);
    const resultado = await onTransfer(userId);
    setOcupado(false);
    if (resultado.ok) {
      onClose();
      return;
    }
    setErro(resultado.error.message);
  };

  const outros = membros.filter((membro) => membro.userId !== currentUserId);

  return (
    <div className="space-y-4 rounded-box border border-base-300 bg-base-200 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3 className="font-bold text-base-content">Quem organiza esta pelada</h3>
          {organizadorAtual && (
            <p className="mt-0.5 text-sm text-base-content/70">{organizadorAtual}</p>
          )}
        </div>
      </div>

      {erro && (
        <div role="alert" className="alert alert-error alert-soft text-sm font-semibold">
          {erro}
        </div>
      )}

      {podeTransferir && (
        <>
          {currentUserId && (
            <button
              type="button"
              className="btn btn-primary w-full min-h-[44px]"
              disabled={ocupado}
              onClick={() => void transferir(currentUserId)}
            >
              <UserCog className="h-4 w-4" /> Assumir esta pelada
            </button>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/50">
                Quem vai organizar
              </span>
              <select
                aria-label="Quem vai organizar"
                className="select select-bordered select-sm w-full"
                value={escolhido}
                disabled={ocupado || outros.length === 0}
                onChange={(event) => setEscolhido(event.target.value)}
              >
                <option value="">
                  {outros.length === 0 ? 'Ninguém mais na comunidade' : 'Escolher pessoa…'}
                </option>
                {outros.map((membro) => (
                  <option key={membro.userId} value={membro.userId}>
                    {membro.nome}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-sm btn-outline shrink-0"
              disabled={ocupado || !escolhido}
              onClick={() => void transferir(escolhido)}
            >
              Passar a organização
            </button>
          </div>

          {/* O que a responsabilidade concede de verdade: escrever numa pelada exige
              atribuicao naquela pelada, entao as outras nao mudam de mao. O que sobra
              e poder criar pelada nova, e isso dura ate alguem tirar. */}
          <p className="text-xs text-base-content/60">
            Além desta pelada, a pessoa passa a poder criar peladas novas na comunidade, e continua
            podendo até alguém tirar. As peladas que já existem seguem com quem organiza cada uma.
            Esta ação pede verificação em duas etapas.
          </p>
        </>
      )}
    </div>
  );
}

export default SessionOrganizerPanel;
