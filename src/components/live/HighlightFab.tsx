import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Player, Team, Skill } from '../../types';

interface HighlightFabProps {
  teams: Team[];
  players: Player[];
  onRegister: (playerId: string, skill: Skill) => void;
}

const positionLabels: Record<string, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
  'all-rounder': 'Coringa',
};

// Lances de destaque mais comuns (defensivos / de construção).
const HIGHLIGHT_SKILLS: { skill: Skill; label: string }[] = [
  { skill: 'defesa', label: 'Defesa' },
  { skill: 'recepcao', label: 'Recepção' },
  { skill: 'levantamento', label: 'Levantamento' },
];

// Fundamento inferido pela posição quando o marcador não troca manualmente.
const inferSkill = (position: string): Skill =>
  position === 'levantador' ? 'levantamento' : position === 'libero' ? 'defesa' : 'defesa';

export const HighlightFab = ({ teams, players, onRegister }: HighlightFabProps) => {
  const [open, setOpen] = useState(false);
  const [skillOverride, setSkillOverride] = useState<Skill | null>(null);

  const close = () => {
    setOpen(false);
    setSkillOverride(null);
  };

  const handlePick = (player: Player) => {
    onRegister(player.id, skillOverride ?? inferSkill(player.posicaoPrincipal));
    close();
  };

  return (
    <>
      {/* FAB — cor âmbar/warning, distinta de ponto (accent) e erro (error). */}
      <button
        onClick={() => setOpen(true)}
        title="Registrar lance de destaque"
        className="btn btn-warning btn-circle shadow-xl shadow-warning/30 fixed right-5 bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:right-6 sm:bottom-6 z-30 w-14 h-14"
      >
        <Sparkles className="w-6 h-6" />
      </button>

      {open && (
        <dialog className="modal modal-open modal-bottom sm:modal-middle">
          <div className="modal-box border border-warning/30 bg-base-200 p-0 overflow-hidden sm:max-w-md">
            <div className="p-5 border-b border-base-300 flex justify-between items-center">
              <h3 className="font-bold uppercase tracking-tight text-warning text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Lance de Destaque
              </h3>
              <button onClick={close} className="btn btn-ghost btn-circle btn-sm">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-5">
              <div>
                <label className="text-[10px] font-bold uppercase text-base-content/60 mb-2 block tracking-widest">
                  Fundamento{' '}
                  <span className="text-base-content/40">(opcional — senão pela posição)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {HIGHLIGHT_SKILLS.map(({ skill, label }) => (
                    <button
                      key={skill}
                      onClick={() => setSkillOverride((cur) => (cur === skill ? null : skill))}
                      className={`py-2 px-1 border rounded-lg text-[9px] font-bold uppercase tracking-tight transition-all cursor-pointer ${skillOverride === skill ? 'bg-warning text-black border-warning' : 'bg-base-300 border-base-300 hover:border-warning/50'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {teams.map((team) => (
                <div key={team.id}>
                  <label className="text-[10px] font-bold uppercase text-base-content/60 mb-2 block tracking-widest truncate">
                    {team.name || 'Time'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {team.playerIds
                      .map((pid) => players.find((p) => p.id === pid))
                      .filter((p): p is Player => !!p)
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handlePick(p)}
                          className="p-3 border border-base-300 bg-base-300 rounded-xl text-left hover:border-warning/60 transition-all cursor-pointer"
                        >
                          <p className="text-xs font-bold">{p.apelido || p.nome}</p>
                          <p className="text-[9px] uppercase text-base-content/60">
                            {positionLabels[p.posicaoPrincipal] || 'Jogador'}
                          </p>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <form method="dialog" className="modal-backdrop bg-black/85" onClick={close}>
            <button type="button" onClick={close}>
              Fechar
            </button>
          </form>
        </dialog>
      )}
    </>
  );
};
