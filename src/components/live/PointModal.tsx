import { useState } from 'react';
import { Plus, ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { Team, Player, PointReason, PointType, Skill, Fault, ErrorCategory } from '../../types';
import { SKILL_LABELS, FAULT_LABELS, skillToReason } from '../../logic/match';

export interface PointDetails {
  playerId?: string;
  pointType?: PointType;
  skill?: Skill;
  fault?: Fault;
  reason: PointReason;
  assistPlayerId?: string;
}

interface PointModalProps {
  team: Team;
  opposingTeam?: Team;
  players: Player[];
  preSelectedPlayerId?: string;
  /** Levantador nominal do time (pré-seleção da assistência). Vazio no 6x0. */
  assistDefaultPlayerId?: string;
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

interface ErrorCategoryItem {
  id: ErrorCategory;
  label: string;
  advanced: boolean;
}

const ERROR_CATEGORIES: ErrorCategoryItem[] = [
  { id: 'serve', label: 'Saque', advanced: false },
  { id: 'reception', label: 'Recepção', advanced: false },
  { id: 'setting', label: 'Levantamento', advanced: false },
  { id: 'attack', label: 'Ataque', advanced: false },
  { id: 'block', label: 'Bloqueio', advanced: false },
  { id: 'defense', label: 'Defesa', advanced: false },
  { id: 'net_invasion', label: 'Rede / Invasão', advanced: false },
  { id: 'libero', label: 'Líbero', advanced: false },
  { id: 'other', label: 'Outro', advanced: false },

  { id: 'ball_handling', label: 'Toque / Controle', advanced: true },
  { id: 'position_rotation', label: 'Posição / Rodízio', advanced: true },
  { id: 'substitution', label: 'Substituição', advanced: true },
  { id: 'delay_admin', label: 'Retardamento / Admin', advanced: true },
  { id: 'conduct', label: 'Conduta', advanced: true },
];

const CATEGORY_SUBTYPES: Record<ErrorCategory, { fault: Fault; label: string }[]> = {
  serve: [
    { fault: 'serve_out', label: 'Saque para fora' },
    { fault: 'serve_net', label: 'Saque na rede' },
    { fault: 'serve_no_cross', label: 'Não cruzou a rede' },
    { fault: 'serve_foot_fault', label: 'Falta de pé no saque' },
    { fault: 'serve_wrong_order', label: 'Saque fora da ordem' },
    { fault: 'serve_screen', label: 'Barreira no saque' },
  ],
  reception: [
    { fault: 'reception_floor', label: 'Direto no chão' },
    { fault: 'reception_out', label: 'Recepção para fora' },
    { fault: 'reception_net', label: 'Recepção na rede' },
    { fault: 'reception_double', label: 'Dois toques na recepção' },
    { fault: 'reception_catch', label: 'Condução na recepção' },
    { fault: 'reception_communication', label: 'Falha de comunicação' },
  ],
  setting: [
    { fault: 'setting_double', label: 'Dois toques no levantamento' },
    { fault: 'setting_catch', label: 'Condução no levantamento' },
    { fault: 'setting_out', label: 'Levantamento para fora' },
    { fault: 'setting_net', label: 'Levantamento na rede' },
    { fault: 'setting_too_low', label: 'Levantamento baixo demais' },
    { fault: 'setting_too_close', label: 'Levantamento colado na rede' },
  ],
  attack: [
    { fault: 'attack_out', label: 'Ataque para fora' },
    { fault: 'attack_net', label: 'Ataque na rede' },
    { fault: 'attack_blocked', label: 'Ataque bloqueado' },
    { fault: 'attack_antenna', label: 'Tocou na antena' },
    { fault: 'attack_back_row_fault', label: 'Ataque irregular do fundo' },
    { fault: 'attack_opponent_serve', label: 'Ataque irregular sobre saque' },
    { fault: 'attack_catch', label: 'Ataque conduzido' },
    { fault: 'tip_catch', label: 'Largada conduzida' },
    { fault: 'tip_out', label: 'Largada para fora' },
  ],
  block: [
    { fault: 'block_out', label: 'Bloqueio para fora' },
    { fault: 'block_net', label: 'Toque na rede' },
    { fault: 'block_invasion', label: 'Invasão no bloqueio' },
    { fault: 'block_before_attack', label: 'Antes do ataque' },
    { fault: 'block_serve', label: 'Bloqueio do saque' },
    { fault: 'block_back_row', label: 'Bloqueio irregular do fundo' },
    { fault: 'block_antenna', label: 'Bloqueio por fora da antena' },
  ],
  defense: [
    { fault: 'defense_floor', label: 'Defesa no chão' },
    { fault: 'defense_out', label: 'Defesa para fora' },
    { fault: 'defense_net', label: 'Defesa na rede' },
    { fault: 'defense_tip_missed', label: 'Largada não defendida' },
    { fault: 'defense_coverage_error', label: 'Erro de cobertura' },
    { fault: 'defense_communication', label: 'Falha de comunicação' },
  ],
  ball_handling: [
    { fault: 'four_touches', label: 'Quatro toques' },
    { fault: 'double_contact', label: 'Dois toques (toque)' },
    { fault: 'catch', label: 'Condução / bola retida' },
    { fault: 'assisted_hit', label: 'Toque apoiado' },
  ],
  net_invasion: [
    { fault: 'net_touch', label: 'Tocou na rede' },
    { fault: 'antenna_touch', label: 'Tocou na antena' },
    { fault: 'over_net_fault', label: 'Invasão por cima' },
    { fault: 'under_net_interference', label: 'Invasão por baixo' },
    { fault: 'center_line_full_foot', label: 'Pé completamente no outro lado' },
    { fault: 'opponent_interference', label: 'Interferência no adversário' },
  ],
  position_rotation: [
    { fault: 'position_fault', label: 'Falta de posição' },
    { fault: 'rotation_fault', label: 'Falta de rotação' },
    { fault: 'wrong_server', label: 'Sacador errado' },
  ],
  libero: [
    { fault: 'libero_attack', label: 'Ataque acima da rede' },
    { fault: 'libero_serve', label: 'Líbero sacou' },
    { fault: 'libero_block', label: 'Líbero bloqueou' },
    { fault: 'libero_block_attempt', label: 'Líbero tentou bloquear' },
    { fault: 'libero_front_zone_set_attack', label: 'Ataque após levantamento do Líbero' },
    { fault: 'libero_illegal_replacement', label: 'Troca ilegal do Líbero' },
    { fault: 'libero_late_replacement', label: 'Troca tardia' },
    { fault: 'libero_wrong_zone_replacement', label: 'Troca fora da zona' },
  ],
  substitution: [
    { fault: 'illegal_substitution', label: 'Substituição ilegal' },
    { fault: 'unauthorized_substitution_request', label: 'Solicitação não autorizada' },
    { fault: 'substitution_limit_exceeded', label: 'Limite excedido' },
  ],
  delay_admin: [
    { fault: 'delay_restart', label: 'Atrasou reinício' },
    { fault: 'delay_regular_interruption', label: 'Prolongou interrupção' },
    { fault: 'improper_request', label: 'Solicitação indevida' },
  ],
  conduct: [
    { fault: 'rude_conduct', label: 'Conduta rude' },
    { fault: 'offensive_conduct', label: 'Conduta ofensiva' },
    { fault: 'aggression', label: 'Agressão / conduta física' },
  ],
  other: [
    { fault: 'team_error', label: 'Erro coletivo' },
    { fault: 'unknown_error', label: 'Erro não identificado' },
    { fault: 'manual_error', label: 'Erro registrado manualmente' },
  ],
};

const DEFAULT_CATEGORY_FAULT: Record<ErrorCategory, Fault> = {
  serve: 'serve_out',
  reception: 'reception_floor',
  setting: 'setting_double',
  attack: 'attack_out',
  block: 'block_out',
  defense: 'defense_floor',
  ball_handling: 'double_contact',
  net_invasion: 'net_touch',
  position_rotation: 'position_fault',
  libero: 'libero_attack',
  substitution: 'illegal_substitution',
  delay_admin: 'delay_restart',
  conduct: 'rude_conduct',
  other: 'unknown_error',
};

type Tab = 'winner' | 'error';
type ErrorStep = 'category' | 'subtype' | 'player';

export const PointModal = ({
  team,
  opposingTeam,
  players,
  preSelectedPlayerId,
  assistDefaultPlayerId,
  onClose,
  onConfirm,
}: PointModalProps) => {
  const [tab, setTab] = useState<Tab>('winner');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>(preSelectedPlayerId);
  const [selectedSkill, setSelectedSkill] = useState<Skill | undefined>();
  const [assistPlayerId, setAssistPlayerId] = useState<string | undefined>(assistDefaultPlayerId);

  // Estados específicos para o fluxo em 3 etapas de erros
  const [errorStep, setErrorStep] = useState<ErrorStep>('category');
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | null>(null);
  const [selectedFault, setSelectedFault] = useState<Fault | undefined>();
  const [showAdvanced, setShowAdvanced] = useState(false);

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
        // Assistência só faz sentido em ataque/largada e quando o autor não é o próprio levantador.
        assistPlayerId:
          (selectedSkill === 'ataque' || selectedSkill === 'largada') &&
          assistPlayerId &&
          assistPlayerId !== selectedPlayerId
            ? assistPlayerId
            : undefined,
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
    <dialog className="modal modal-open modal-bottom sm:modal-middle">
      <div className="modal-box border border-base-300 p-0 overflow-hidden bg-base-200 w-full sm:w-[calc(100%-2rem)] max-w-md mx-0 sm:mx-auto flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-base-300 flex justify-between items-center shrink-0">
          <h3 className="font-bold uppercase tracking-tight text-accent text-base">
            Registrar Detalhes do Ponto
          </h3>
          <button onClick={onClose} className="btn btn-ghost btn-circle btn-sm">
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>

        {/* Abas: Ponto nosso / Erro adversário */}
        <div className="grid grid-cols-2 border-b border-base-300 shrink-0">
          <button
            onClick={() => {
              setTab('winner');
              setSelectedPlayerId(preSelectedPlayerId);
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
              setErrorStep('category');
              setSelectedCategory(null);
              setSelectedFault(undefined);
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

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
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
                      onClick={() => setSelectedSkill((cur) => (cur === skill ? undefined : skill))}
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

              {(selectedSkill === 'ataque' || selectedSkill === 'largada') && (
                <div>
                  <label className="text-[10px] font-bold uppercase text-base-content/60 mb-3 block tracking-widest">
                    Levantou <span className="text-base-content/40">(assistência)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {teamPlayers
                      .filter((p) => p.id !== selectedPlayerId)
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() =>
                            setAssistPlayerId((cur) => (cur === p.id ? undefined : p.id))
                          }
                          className={`p-2.5 border rounded-xl transition-all text-left cursor-pointer ${assistPlayerId === p.id ? 'bg-accent/15 border-accent' : 'bg-base-300 border-base-300 hover:border-accent/50'}`}
                        >
                          <p
                            className={`text-[11px] font-bold ${assistPlayerId === p.id ? 'text-accent' : ''}`}
                          >
                            {p.apelido || p.nome}
                          </p>
                          <p className="text-[8px] uppercase text-base-content/60">
                            {positionLabels[p.posicaoPrincipal] || 'Jogador'}
                          </p>
                        </button>
                      ))}
                    <button
                      onClick={() => setAssistPlayerId(undefined)}
                      className={`col-span-2 p-2.5 border rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest text-center italic cursor-pointer ${assistPlayerId === undefined ? 'bg-accent/15 border-accent text-accent' : 'bg-base-300 border-base-300 hover:bg-base-300/80'}`}
                    >
                      Sem assistência
                    </button>
                  </div>
                  <p className="text-[8px] uppercase text-base-content/40 mt-2 italic tracking-widest">
                    Um toque credita o levantamento ao maestro da jogada.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Etapa 1: Categorias de Erro */}
              {errorStep === 'category' && (
                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase text-base-content/60 mb-1 block tracking-widest">
                    Fundamento do Erro
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {ERROR_CATEGORIES.filter((c) => !c.advanced || showAdvanced).map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          setErrorStep('subtype');
                        }}
                        className={`py-3 px-1 border rounded-lg text-[9px] font-bold uppercase tracking-tight text-center transition-all bg-base-300 border-base-300 hover:border-error/50 hover:bg-base-300/80 cursor-pointer ${selectedCategory === cat.id ? 'border-error text-error bg-error/5' : ''}`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="btn btn-ghost btn-xs text-[9px] uppercase font-bold tracking-wider flex items-center gap-1.5"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      {showAdvanced ? 'Ocultar Avançados' : 'Mais Categorias (Avançado)'}
                    </button>
                  </div>
                  <p className="text-[8px] uppercase text-base-content/40 mt-2 italic tracking-widest">
                    Opcional — confirme direto para registrar erro genérico sem autor.
                  </p>
                </div>
              )}

              {/* Etapa 2: Subtipos do Erro */}
              {errorStep === 'subtype' && selectedCategory && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => setErrorStep('category')}
                      className="btn btn-ghost btn-xs btn-circle"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-base-content/60">
                      {ERROR_CATEGORIES.find((c) => c.id === selectedCategory)?.label} &gt; Subtipo
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {(CATEGORY_SUBTYPES[selectedCategory] || []).map((sub) => (
                      <button
                        key={sub.fault}
                        onClick={() => {
                          setSelectedFault(sub.fault);
                          setErrorStep('player');
                        }}
                        className={`py-2.5 px-2 border rounded-lg text-[9px] font-bold uppercase tracking-tighter text-left transition-all cursor-pointer ${selectedFault === sub.fault ? 'bg-error text-white border-error' : 'bg-base-300 border-base-300 hover:border-base-content/50'}`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      onClick={() => {
                        setSelectedFault(DEFAULT_CATEGORY_FAULT[selectedCategory]);
                        setErrorStep('player');
                      }}
                      className="btn btn-ghost btn-xs text-[9px] uppercase font-bold tracking-wider hover:text-error"
                    >
                      Pular Subtipo
                    </button>
                  </div>
                </div>
              )}

              {/* Etapa 3: Autor do Erro (Jogador Oponente) */}
              {errorStep === 'player' && selectedCategory && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => setErrorStep('subtype')}
                      className="btn btn-ghost btn-xs btn-circle"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-base-content/60 truncate max-w-[280px]">
                      {ERROR_CATEGORIES.find((c) => c.id === selectedCategory)?.label} &gt;{' '}
                      {selectedFault ? FAULT_LABELS[selectedFault] : 'Genérico'} &gt; Autor
                    </span>
                  </div>

                  {opposingPlayers.length > 0 ? (
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
                  ) : (
                    <div className="text-center py-6 border border-dashed border-base-300 rounded-xl">
                      <p className="text-xs italic text-base-content/60 uppercase">
                        Nenhum jogador oponente disponível
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer fixo — Confirmar sempre visível, mesmo com a lista rolada */}
        <div className="p-4 border-t border-base-300 bg-base-200 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
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
