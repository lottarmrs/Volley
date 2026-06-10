import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { Team, Player, PointReason } from '../../types';
import { POINT_REASON_LABELS } from '../../logic/match';

interface PointModalProps {
  team: Team;
  players: Player[];
  onClose: () => void;
  onConfirm: (playerId: string | undefined, reason: PointReason) => void;
}

const positionLabels: Record<string, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
  'all-rounder': 'Coringa',
};

export const PointModal = ({ team, players, onClose, onConfirm }: PointModalProps) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>();
  const [selectedReason, setSelectedReason] = useState<PointReason>('unknown');

  return (
    <dialog className="modal modal-open">
      <div className="modal-box border border-base-300 p-0 overflow-hidden bg-base-200 w-[calc(100%-2rem)] max-w-md mx-4 sm:mx-auto">
        <div className="p-6 border-b border-base-300 flex justify-between items-center">
          <h3 className="font-bold uppercase tracking-tight text-accent text-base">
            Registrar Detalhes do Ponto
          </h3>
          <button onClick={onClose} className="btn btn-ghost btn-circle btn-sm">
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="text-[10px] font-bold uppercase text-base-content/60 mb-3 block tracking-widest">
              Responsável pelo Ponto
            </label>
            <div className="grid grid-cols-2 gap-2">
              {team.playerIds
                .map((pid) => players.find((p) => p.id === pid))
                .filter((p): p is Player => !!p)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayerId(p.id)}
                    className={`p-3 border rounded-xl transition-all text-left group cursor-pointer ${selectedPlayerId === p.id ? 'bg-accent/15 border-accent' : 'bg-base-300 border-base-300 hover:border-accent/50'}`}
                  >
                    <p
                      className={`text-xs font-bold ${selectedPlayerId === p.id ? 'text-accent' : 'group-hover:text-accent'}`}
                    >
                      {p.nome}
                    </p>
                    <p className="text-[9px] uppercase text-base-content/60">
                      {positionLabels[p.posicaoPrincipal] || 'Jogador'}
                    </p>
                  </button>
                ))}
              <button
                onClick={() => setSelectedPlayerId(undefined)}
                className={`col-span-2 p-3 border rounded-xl transition-all text-xs font-bold uppercase tracking-widest text-center italic cursor-pointer ${selectedPlayerId === undefined ? 'bg-accent/15 border-accent text-accent' : 'bg-base-300 border-base-300 hover:bg-base-300/80'}`}
              >
                Erro Adversário / Outro (Time)
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-base-content/60 mb-3 block tracking-widest">
              Fundamento Decisivo
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(POINT_REASON_LABELS) as [PointReason, string][]).map(
                ([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedReason(key as PointReason)}
                    className={`py-3 px-1 border rounded-lg text-[9px] font-bold uppercase tracking-tighter text-center transition-all cursor-pointer ${selectedReason === key ? 'bg-accent text-white border-accent' : 'bg-base-300 border-base-300 hover:border-base-content/50'}`}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
          </div>

          <button
            onClick={() => onConfirm(selectedPlayerId, selectedReason)}
            className="btn btn-accent w-full font-bold uppercase tracking-widest shadow-xl shadow-accent/20"
          >
            Confirmar Ponto
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop bg-black/85" onClick={onClose}>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </form>
    </dialog>
  );
};
