import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Team, Player, PointReason, PointType, Skill, Fault } from '../../types';
import { SKILL_LABELS, FAULT_LABELS, skillToReason } from '../../logic/match';

export interface PointDetails {
  playerId?: string;
  pointType?: PointType;
  skill?: Skill;
  fault?: Fault;
  reason: PointReason;
}

interface PointModalProps {
  team: Team;
  opposingTeam?: Team;
  players: Player[];
  onClose: () => void;
  onConfirm: (details: PointDetails) => void;
}

const positionLabels: Record<string, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
  'all-rounder': 'Coringa',
};

const SKILL_ORDER: Skill[] = [
  'ataque',
  'bloqueio',
  'saque',
  'defesa',
  'recepcao',
  'levantamento',
  'largada',
];

const FAULT_ORDER: Fault[] = Object.keys(FAULT_LABELS) as Fault[];

type Tab = 'winner' | 'error';

export const PointModal = ({ team, opposingTeam, players, onClose, onConfirm }: PointModalProps) => {
  const [tab, setTab] = useState<Tab>('winner');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>();
  const [selectedSkill, setSelectedSkill] = useState<Skill | undefined>();
  const [selectedFault, setSelectedFault] = useState<Fault | undefined>();

  const teamPlayers = team.playerIds
    .map((pid) => players.find((p) => p.id === pid))
    .filter((p): p is Player => !!p);

  const opposingPlayers = opposingTeam
    ? opposingTeam.playerIds
        .map((pid) => players.find((p) => p.id === pid))
        .filter((p): p is Player => !!p)
    : [];

  const confirm = () => {
    if (tab === 'winner') {
      onConfirm({
        playerId: selectedPlayerId,
        pointType: 'winner',
        skill: selectedSkill,
        reason: selectedSkill ? skillToReason(selectedSkill) : 'unknown',
      });
    } else {
      onConfirm({
        playerId: selectedPlayerId,
        pointType: 'error',
        fault: selectedFault,
        reason: 'opponent_error',
      });
    }
  };

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

        {/* Abas: Ponto nosso / Erro adversário */}
        <div className="grid grid-cols-2 border-b border-base-300">
          <button
            onClick={() => {
              setTab('winner');
              setSelectedPlayerId(undefined);
            }}
            className={`py-3 text-[11px] font-bold uppercase tracking-widest transition-all ${
              tab === 'winner'
                ? 'bg-accent/15 text-accent border-b-2 border-accent'
                : 'text-base-content/60 hover:bg-base-300/50'
            }`}
          >
            Ponto Nosso
          </button>
          <button
            onClick={() => {
              setTab('error');
              setSelectedPlayerId(undefined);
            }}
            className={`py-3 text-[11px] font-bold uppercase tracking-widest transition-all ${
              tab === 'error'
                ? 'bg-error/15 text-error border-b-2 border-error'
                : 'text-base-content/60 hover:bg-base-300/50'
            }`}
          >
            Erro Adversário
          </button>
        </div>

        <div className="p-6 space-y-6">
          {tab === 'winner' ? (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase text-base-content/60 mb-3 block tracking-widest">
                  Responsável pelo Ponto
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {teamPlayers.map((p) => (
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
                    Ponto do Time (sem autor)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-base-content/60 mb-3 block tracking-widest">
                  Fundamento
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {SKILL_ORDER.map((skill) => (
                    <button
                      key={skill}
                      onClick={() =>
                        setSelectedSkill((cur) => (cur === skill ? undefined : skill))
                      }
                      className={`py-3 px-1 border rounded-lg text-[9px] font-bold uppercase tracking-tighter text-center transition-all cursor-pointer ${selectedSkill === skill ? 'bg-accent text-white border-accent' : 'bg-base-300 border-base-300 hover:border-base-content/50'}`}
                    >
                      {SKILL_LABELS[skill]}
                    </button>
                  ))}
                </div>
                <p className="text-[8px] uppercase text-base-content/40 mt-2 italic tracking-widest">
                  Opcional — confirme direto para registrar como não informado.
                </p>
              </div>
            </>
          ) : (
            <>
              {opposingPlayers.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold uppercase text-base-content/60 mb-3 block tracking-widest">
                    Autor do Erro (Oponente)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {opposingPlayers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPlayerId(p.id)}
                        className={`p-3 border rounded-xl transition-all text-left group cursor-pointer ${selectedPlayerId === p.id ? 'bg-error/15 border-error' : 'bg-base-300 border-base-300 hover:border-error/50'}`}
                      >
                        <p
                          className={`text-xs font-bold ${selectedPlayerId === p.id ? 'text-error' : 'group-hover:text-error'}`}
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
                      className={`col-span-2 p-3 border rounded-xl transition-all text-xs font-bold uppercase tracking-widest text-center italic cursor-pointer ${selectedPlayerId === undefined ? 'bg-error/15 border-error text-error' : 'bg-base-300 border-base-300 hover:bg-base-300/80'}`}
                    >
                      Erro do Time (sem autor)
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold uppercase text-base-content/60 mb-3 block tracking-widest">
                  Tipo de Erro do Adversário
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {FAULT_ORDER.map((fault) => (
                    <button
                      key={fault}
                      onClick={() => setSelectedFault((cur) => (cur === fault ? undefined : fault))}
                      className={`py-2.5 px-2 border rounded-lg text-[9px] font-bold uppercase tracking-tighter text-left transition-all cursor-pointer ${selectedFault === fault ? 'bg-error text-white border-error' : 'bg-base-300 border-base-300 hover:border-base-content/50'}`}
                    >
                      {FAULT_LABELS[fault]}
                    </button>
                  ))}
                </div>
                <p className="text-[8px] uppercase text-base-content/40 mt-2 italic tracking-widest">
                  Opcional — confirme direto para registrar erro genérico.
                </p>
              </div>
            </>
          )}

          <button
            onClick={confirm}
            className={`btn w-full font-bold uppercase tracking-widest shadow-xl ${tab === 'winner' ? 'btn-accent shadow-accent/20' : 'btn-error shadow-error/20'}`}
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
