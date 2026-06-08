import React, { useState, useMemo } from 'react';
import { X, Search, Sparkles, Check, Info } from 'lucide-react';
import { Player, Attributes, Position, Gender } from '../../types';
import { calculateGeneralOverall, getAttributeLabel } from '../../logic/calculations';
import { ATTRIBUTE_TOOLTIPS } from '../../constants';

interface GuestPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  onAddGuestPlayer: (player: Player, editDetails: boolean) => void;
  defaultCommunityId?: string | null;
}

const POSITION_LABELS: Record<Position, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
  'all-rounder': 'Coringa'
};

const INITIAL_ATTRIBUTES: Attributes = {
  saque: 5,
  recepcao: 5,
  levantamento: 5,
  ataque: 5,
  bloqueio: 5,
  defesa: 5,
  velocidade: 5,
  resistencia: 5,
  leituraDeJogo: 5,
  regularidade: 5,
  controleEmocional: 5
};

export function GuestPlayerModal({
  isOpen,
  onClose,
  players,
  onAddGuestPlayer,
  defaultCommunityId
}: GuestPlayerModalProps) {
  const [nome, setNome] = useState('');
  const [genero, setGenero] = useState<Gender>('M');
  const [posicaoPrincipal, setPosicaoPrincipal] = useState<Position>('ponteiro');
  const [atributos, setAtributos] = useState<Attributes>({ ...INITIAL_ATTRIBUTES });
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplatePlayer, setSelectedTemplatePlayer] = useState<Player | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Filter registered players for autocomplete
  const filteredTemplatePlayers = useMemo(() => {
    if (!templateSearch.trim()) return [];
    return players
      .filter(p => !p.isGuest && p.ativo)
      .filter(p => p.nome.toLowerCase().includes(templateSearch.toLowerCase()) || 
                   (p.apelido && p.apelido.toLowerCase().includes(templateSearch.toLowerCase())))
      .slice(0, 5);
  }, [players, templateSearch]);

  if (!isOpen) return null;

  const handleSelectTemplate = (player: Player) => {
    setSelectedTemplatePlayer(player);
    setTemplateSearch(player.nome);
    setAtributos({ ...player.atributos });
    setGenero(player.genero);
    setPosicaoPrincipal(player.posicaoPrincipal);
    setShowAutocomplete(false);
  };

  const handleClearTemplate = () => {
    setSelectedTemplatePlayer(null);
    setTemplateSearch('');
    setAtributos({ ...INITIAL_ATTRIBUTES });
  };

  const handleAttributeChange = (key: keyof Attributes, val: number) => {
    setAtributos(prev => ({
      ...prev,
      [key]: val
    }));
  };

  const handleSave = (editDetails: boolean) => {
    if (!nome.trim()) {
      alert('O nome do convidado é obrigatório.');
      return;
    }

    const now = new Date().toISOString();
    
    // Auto-calculate helper stats
    const newGuest: Player = {
      id: `player-guest-${Date.now()}`,
      nome: nome.trim(),
      apelido: nome.trim(),
      genero,
      ativo: true,
      posicaoPrincipal,
      posicoesSecundarias: selectedTemplatePlayer ? [...selectedTemplatePlayer.posicoesSecundarias] : [],
      alturaCm: selectedTemplatePlayer?.alturaCm,
      maoDominante: selectedTemplatePlayer?.maoDominante || 'direita',
      atributos,
      perfil: {
        nivel: 1,
        classe: 'Convidado',
        arquetipo: selectedTemplatePlayer?.perfil.arquetipo || 'Versátil',
        especialidade: selectedTemplatePlayer?.perfil.especialidade || 'Convidado',
        fraqueza: selectedTemplatePlayer?.perfil.fraqueza || 'Nenhum'
      },
      formaAtual: {
        valor: 0,
        observacao: 'Avaliação Inicial',
        ultimasPartidas: []
      },
      status: {
        lesionado: false,
        limitacaoFisica: null,
        presencaFrequente: true
      },
      metadata: {
        criadoEm: now,
        atualizadoEm: now
      },
      isGuest: true,
      communityIds: defaultCommunityId ? [defaultCommunityId] : []
    };

    onAddGuestPlayer(newGuest, editDetails);
    
    // Reset state
    setNome('');
    setGenero('M');
    setPosicaoPrincipal('ponteiro');
    setAtributos({ ...INITIAL_ATTRIBUTES });
    setSelectedTemplatePlayer(null);
    setTemplateSearch('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-base-200 border border-base-300 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-base-300 bg-base-300/30">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-black uppercase tracking-widest text-base-content">
              Cadastrar Convidado Rápido
            </h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="btn btn-ghost btn-xs btn-circle text-base-content/70 hover:text-base-content"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Section 1: Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-base-300/40 p-5 rounded-xl border border-base-300">
            {/* Nome */}
            <div className="fieldset md:col-span-1">
              <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted">Nome do Atleta</label>
              <input 
                type="text" 
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: Carlos Convidado"
                className="input input-bordered w-full font-bold uppercase text-xs"
                required
              />
            </div>

            {/* Gênero */}
            <div className="fieldset md:col-span-1">
              <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted">Gênero</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGenero('M')}
                  className={`btn btn-sm text-xs font-bold uppercase ${genero === 'M' ? 'btn-neutral' : 'btn-ghost btn-outline border-base-300'}`}
                >
                  Masculino
                </button>
                <button
                  type="button"
                  onClick={() => setGenero('F')}
                  className={`btn btn-sm text-xs font-bold uppercase ${genero === 'F' ? 'btn-neutral' : 'btn-ghost btn-outline border-base-300'}`}
                >
                  Feminino
                </button>
              </div>
            </div>

            {/* Posição Principal */}
            <div className="fieldset md:col-span-1">
              <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted">Posição Principal</label>
              <select
                value={posicaoPrincipal}
                onChange={e => setPosicaoPrincipal(e.target.value as Position)}
                className="select select-bordered select-sm w-full uppercase font-bold text-xs"
              >
                {Object.entries(POSITION_LABELS).map(([pos, label]) => (
                  <option key={pos} value={pos}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 2: plays like "Joga igual a..." template selector */}
          <div className="bg-base-300/40 p-5 rounded-xl border border-base-300 space-y-4">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Joga igual a... (Copiar Atributos)
              </h4>
              <p className="text-[9px] text-text-muted uppercase font-bold mt-1">
                Selecione um atleta cadastrado para servir de base. Você pode ajustar os atributos depois.
              </p>
            </div>

            <div className="relative">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-base-content/50 absolute left-3" />
                <input
                  type="text"
                  value={templateSearch}
                  onChange={e => {
                    setTemplateSearch(e.target.value);
                    setShowAutocomplete(true);
                  }}
                  onFocus={() => setShowAutocomplete(true)}
                  placeholder="Pesquisar atleta de referência..."
                  className="input input-bordered input-sm pl-9 w-full uppercase font-bold text-xs pr-10"
                />
                {selectedTemplatePlayer && (
                  <button
                    type="button"
                    onClick={handleClearTemplate}
                    className="absolute right-3 text-error hover:text-error-hover text-xs font-bold uppercase"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showAutocomplete && filteredTemplatePlayers.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-base-300 border border-base-content/10 mt-1 rounded-xl shadow-xl z-50 overflow-hidden">
                  {filteredTemplatePlayers.map(p => {
                    const pOverall = calculateGeneralOverall(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectTemplate(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-neutral/40 flex items-center justify-between border-b border-base-content/5 last:border-none"
                      >
                        <div>
                          <p className="text-xs font-bold uppercase text-base-content">{p.nome}</p>
                          <span className="text-[9px] text-text-muted font-mono uppercase">
                            {POSITION_LABELS[p.posicaoPrincipal]} • {p.genero}
                          </span>
                        </div>
                        <span className="badge badge-accent font-mono font-black text-xs">{pOverall}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Template Visual Feedback */}
            {selectedTemplatePlayer && (
              <div className="flex items-center gap-3 bg-accent/10 border border-accent/20 rounded-xl p-3.5 text-xs text-accent">
                <Check className="w-4 h-4 text-accent shrink-0" />
                <div>
                  <span className="font-extrabold uppercase">Atributos copiados de:</span>{' '}
                  <span className="font-mono uppercase font-black">{selectedTemplatePlayer.nome}</span>{' '}
                  <span className="badge badge-accent badge-sm font-mono font-black">{calculateGeneralOverall(selectedTemplatePlayer)} OVERALL</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Slider Attribute Editor */}
          <div className="space-y-5">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-base-content/60">
                Ajustar Atributos do Convidado
              </h4>
              <p className="text-[9px] text-text-muted uppercase font-bold mt-1">
                Ajuste fino dos atributos técnicos e físicos
              </p>
            </div>

            {/* Main Attributes (4 sliders) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Ataque', key: 'ataque' as keyof Attributes, placement: 'tooltip-right' },
                { label: 'Defesa', key: 'defesa' as keyof Attributes, placement: 'tooltip-right' },
                { label: 'Saque', key: 'saque' as keyof Attributes, placement: 'tooltip-left' },
                { label: 'Resistência', key: 'resistencia' as keyof Attributes, placement: 'tooltip-left' }
              ].map(attr => (
                <div key={attr.key} className="bg-base-300 p-3 rounded-xl border border-base-300">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] font-bold uppercase text-base-content/80 whitespace-nowrap">{attr.label}</span>
                      <div className={`tooltip ${attr.placement} cursor-help`} data-tip={ATTRIBUTE_TOOLTIPS[attr.key]}>
                        <Info className="w-3 h-3 text-base-content/40 hover:text-base-content/70" />
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-accent whitespace-nowrap">
                      {atributos[attr.key]} · <span className="text-[10px] text-base-content/50 uppercase font-sans font-medium">{getAttributeLabel(atributos[attr.key])}</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={atributos[attr.key]}
                    onChange={e => handleAttributeChange(attr.key, parseFloat(e.target.value))}
                    className="range range-accent range-xs w-full"
                  />
                </div>
              ))}
            </div>

            {/* Technical Attributes (7 sliders) */}
            <div className="bg-base-300/40 p-4 rounded-xl border border-base-300">
              <span className="text-[9px] font-bold text-base-content/40 uppercase block mb-3">Atributos Técnicos e Mentais</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Recepção', key: 'recepcao' as keyof Attributes, placement: 'tooltip-right' },
                  { label: 'Levantamento', key: 'levantamento' as keyof Attributes, placement: 'tooltip-top' },
                  { label: 'Bloqueio', key: 'bloqueio' as keyof Attributes, placement: 'tooltip-left' },
                  { label: 'Velocidade', key: 'velocidade' as keyof Attributes, placement: 'tooltip-right' },
                  { label: 'Visão de Jogo', key: 'leituraDeJogo' as keyof Attributes, placement: 'tooltip-top' },
                  { label: 'Consistência', key: 'regularidade' as keyof Attributes, placement: 'tooltip-left' },
                  { label: 'Estabilidade Mental', key: 'controleEmocional' as keyof Attributes, placement: 'tooltip-right' }
                ].map(attr => (
                  <div key={attr.key} className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[8px] font-bold text-base-content/60 uppercase whitespace-nowrap">{attr.label}</span>
                        <div className={`tooltip ${attr.placement} cursor-help`} data-tip={ATTRIBUTE_TOOLTIPS[attr.key]}>
                          <Info className="w-2.5 h-2.5 text-base-content/40 hover:text-base-content/70" />
                        </div>
                      </div>
                      <span className="text-[9px] font-mono font-bold text-primary whitespace-nowrap">
                        {atributos[attr.key]} · <span className="text-[8px] text-base-content/40 uppercase font-sans font-medium">{getAttributeLabel(atributos[attr.key])}</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={atributos[attr.key]}
                      onChange={e => handleAttributeChange(attr.key, parseFloat(e.target.value))}
                      className="range range-primary range-xs w-full"
                    />
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row gap-3 p-5 border-t border-base-300 bg-base-300/30">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost sm:flex-1 font-bold uppercase text-xs"
          >
            Cancelar
          </button>
          
          <button
            type="button"
            onClick={() => handleSave(true)}
            className="btn btn-neutral btn-outline sm:flex-1 font-bold uppercase text-xs"
          >
            Salvar e Editar Detalhes
          </button>
          
          <button
            type="button"
            onClick={() => handleSave(false)}
            className="btn btn-primary sm:flex-[2] font-bold uppercase text-xs"
          >
            Salvar Convidado
          </button>
        </div>
      </div>
    </div>
  );
}
