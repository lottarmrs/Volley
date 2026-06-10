import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  Trash2,
  Search,
  Save,
  Trophy,
  Scale,
  Users,
  Info,
  Plus,
  Minus,
} from 'lucide-react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  Player,
  Attributes,
  Position,
  Game,
  PointEvent,
  Team,
  Community,
  Session,
} from '../../types';
import {
  getBalancingRole,
  calculateGeneralOverall,
  calculatePositionOverall,
  getAutoSpecialty,
  getAutoWeakness,
  getAttributeLabel,
} from '../../logic/calculations';
import { ATTRIBUTE_TOOLTIPS } from '../../constants';

interface PlayerEditViewProps {
  editingPlayer: Player;
  setEditingPlayer: React.Dispatch<React.SetStateAction<Player | null>>;
  players: Player[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  communities: Community[];
  sessions: Session[];
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
  validationErrors: Record<string, string>;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
}

export const PlayerEditView = ({
  editingPlayer,
  setEditingPlayer,
  players,
  games,
  pointEvents,
  teams,
  communities,
  sessions,
  onBack,
  onSave,
  onDelete,
  validationErrors,
  showDeleteConfirm,
  setShowDeleteConfirm,
}: PlayerEditViewProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Track original player to allow "Revert" action
  const originalPlayer = useMemo(() => {
    return players.find((p) => p.id === editingPlayer.id);
  }, [editingPlayer.id, players]);

  const handleRevert = () => {
    if (originalPlayer) {
      setEditingPlayer(JSON.parse(JSON.stringify(originalPlayer)));
    }
  };

  const overall = calculatePositionOverall(editingPlayer, editingPlayer.posicaoPrincipal);
  const rawOverall = calculatePositionOverall(
    { ...editingPlayer, formaAtual: { ...editingPlayer.formaAtual, valor: 0 } },
    editingPlayer.posicaoPrincipal,
  );

  // Filter left players list
  const filteredPlayers = players.filter((p) => {
    const query = searchQuery.toLowerCase();
    return p.nome.toLowerCase().includes(query) || (p.apelido ?? '').toLowerCase().includes(query);
  });

  const positionLabels: Record<Position, string> = {
    levantador: 'Levantador',
    oposto: 'Oposto',
    ponteiro: 'Ponteiro',
    central: 'Central',
    libero: 'Líbero',
    'all-rounder': 'Coringa',
  };

  const positionAbbreviations: Record<Position, string> = {
    levantador: 'LEVANTADOR',
    oposto: 'OPOSTO',
    ponteiro: 'PONTA',
    central: 'CENTRAL',
    libero: 'LÍBERO',
    'all-rounder': 'CORINGA',
  };

  // Recharts Radar data
  const radarData = [
    { subject: 'Ataque', A: editingPlayer.atributos.ataque * 10 },
    { subject: 'Defesa', A: editingPlayer.atributos.defesa * 10 },
    { subject: 'Saque', A: editingPlayer.atributos.saque * 10 },
    { subject: 'Levant.', A: editingPlayer.atributos.levantamento * 10 },
    { subject: 'Bloq.', A: editingPlayer.atributos.bloqueio * 10 },
    { subject: 'Recep.', A: editingPlayer.atributos.recepcao * 10 },
  ];

  // Recharts Line Performance History data
  const playerFinishedSessions = useMemo(() => {
    return sessions
      .filter((s) => s.status === 'finished' && s.selectedPlayerIds.includes(editingPlayer.id))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [sessions, editingPlayer.id]);

  const historyData = useMemo(() => {
    if (playerFinishedSessions.length > 0) {
      return playerFinishedSessions.map((s) => {
        const sessionGames = games.filter((g) => g.sessionId === s.id && g.status === 'finished');
        const playerTeamsInSession = teams.filter(
          (t) => t.sessionId === s.id && t.playerIds.includes(editingPlayer.id),
        );
        const playerTeamIds = playerTeamsInSession.map((t) => t.id);
        const playerSessionGames = sessionGames.filter(
          (g) => playerTeamIds.includes(g.teamAId) || playerTeamIds.includes(g.teamBId),
        );
        const wins = playerSessionGames.filter((g) => {
          const isTeamA = playerTeamIds.includes(g.teamAId);
          return isTeamA ? g.winnerTeamId === g.teamAId : g.winnerTeamId === g.teamBId;
        }).length;
        const winRate =
          playerSessionGames.length > 0 ? Math.round((wins / playerSessionGames.length) * 100) : 0;
        return {
          name: s.name.length > 15 ? `${s.name.substring(0, 12)}...` : s.name,
          forma: winRate,
        };
      });
    }
    return (editingPlayer.formaAtual.ultimasPartidas || [0, 1, 0, 2, 3]).map((val, idx) => ({
      name: `${idx + 1}º Torneio`,
      forma: (val + 5) * 10,
    }));
  }, [playerFinishedSessions, games, teams, editingPlayer.formaAtual.ultimasPartidas]);

  const ChartTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-base-300 border border-base-300 rounded-lg p-2 text-[10px] font-bold text-base-content">
        Desempenho: {payload[0].value}%
      </div>
    );
  };

  const playerTeamIds = teams
    .filter((t) => t.playerIds.includes(editingPlayer.id))
    .map((t) => t.id);
  const hasHistory =
    games.some((g) => playerTeamIds.includes(g.teamAId) || playerTeamIds.includes(g.teamBId)) ||
    pointEvents.some((p) => p.playerId === editingPlayer.id);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={onBack}
          className="btn btn-ghost btn-sm gap-2 text-xs font-bold uppercase"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar ao Recrutamento
        </button>
      </div>

      {/* Main Three-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* COLUMN 1: Player List (Left) */}
        <div className="lg:col-span-1 card bg-base-200 border border-base-300 p-4 h-[400px] lg:h-[780px] flex flex-col shadow-xl">
          <h3 className="text-xs font-bold uppercase text-base-content tracking-wider mb-3">
            Lista de Atletas
          </h3>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/50" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input input-bordered pl-9 py-2 w-full text-xs"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredPlayers.map((p) => {
              const isEditing = p.id === editingPlayer.id;
              const pOverall = calculatePositionOverall(p, p.posicaoPrincipal);
              return (
                <div
                  key={p.id}
                  onClick={() => setEditingPlayer(JSON.parse(JSON.stringify(p)))}
                  className={`p-3 rounded-xl cursor-pointer transition-all border flex items-center justify-between ${
                    isEditing
                      ? 'bg-primary/10 border-primary text-primary shadow-inner font-bold'
                      : 'bg-base-300 border-base-300 hover:border-base-content/20 text-base-content/75 hover:text-base-content'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs ${
                        isEditing
                          ? 'border-primary bg-primary/20 text-primary'
                          : 'border-base-300 bg-base-100 text-base-content/50'
                      }`}
                    >
                      {p.nome.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-tight">
                        {p.apelido || p.nome}
                      </p>
                      <span className="text-[9px] text-base-content/50 font-mono uppercase">
                        {positionAbbreviations[p.posicaoPrincipal]} • {p.genero}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`font-mono font-black text-xs ${isEditing ? 'text-accent' : 'text-base-content/40'}`}
                  >
                    {pOverall}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN 2 & 3: Player Editor (Middle) */}
        <div className="lg:col-span-2 card bg-base-200 border border-base-300 p-6 h-auto lg:h-[780px] flex flex-col justify-between shadow-xl">
          <div className="space-y-5 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {/* Header info */}
            <div className="flex items-start gap-4 border-b border-base-300 pb-4">
              <div className="avatar avatar-placeholder shrink-0">
                <div className="w-16 rounded-full bg-base-300 text-accent border-2 border-accent font-black text-xl shadow-lg shadow-accent/15">
                  <span>
                    {editingPlayer.nome ? editingPlayer.nome.substring(0, 2).toUpperCase() : 'AT'}
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={editingPlayer.nome}
                      onChange={(e) => setEditingPlayer({ ...editingPlayer, nome: e.target.value })}
                      placeholder="Nome Completo"
                      className="input input-bordered input-sm w-full font-bold uppercase text-base-content"
                    />
                    {validationErrors.nome && (
                      <p className="text-[9px] text-error font-bold uppercase mt-1">
                        {validationErrors.nome}
                      </p>
                    )}
                  </div>
                  <div className="w-full sm:w-1/3">
                    <input
                      type="text"
                      value={editingPlayer.apelido || ''}
                      onChange={(e) =>
                        setEditingPlayer({ ...editingPlayer, apelido: e.target.value })
                      }
                      placeholder="Apelido"
                      className="input input-bordered input-sm w-full font-bold uppercase text-base-content"
                    />
                  </div>
                </div>

                {/* Primary position — pill radio-style, same look as secondary */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[9px] text-base-content/40 font-mono uppercase w-14 shrink-0">
                    PRINCIPAL
                  </span>
                  {(Object.keys(positionAbbreviations) as Position[]).map((pos) => {
                    const isPrimary = pos === editingPlayer.posicaoPrincipal;
                    return (
                      <label
                        key={pos}
                        className={`px-1.5 py-0.5 rounded border text-[9px] font-bold cursor-pointer uppercase select-none transition-colors ${
                          isPrimary
                            ? 'bg-accent/20 border-accent text-accent'
                            : 'bg-base-300 border-base-300 text-base-content/50 hover:border-base-content/20'
                        }`}
                      >
                        <input
                          type="radio"
                          name="posicaoPrincipal"
                          checked={isPrimary}
                          onChange={() => {
                            setEditingPlayer({
                              ...editingPlayer,
                              posicaoPrincipal: pos,
                              posicoesSecundarias: editingPlayer.posicoesSecundarias.filter(
                                (p) => p !== pos,
                              ),
                            });
                          }}
                          className="hidden"
                        />
                        {positionAbbreviations[pos]}
                      </label>
                    );
                  })}
                  {/* Tier badge — auto-computed */}
                  <span
                    className={`badge badge-xs font-black uppercase font-mono ml-auto ${
                      overall > 75
                        ? 'badge-warning'
                        : overall > 60
                          ? 'badge-primary'
                          : overall > 45
                            ? 'badge-secondary'
                            : 'badge-ghost'
                    }`}
                  >
                    {overall > 75
                      ? 'ELITE'
                      : overall > 60
                        ? 'COMPETITIVO'
                        : overall > 45
                          ? 'SOCIAL'
                          : 'INICIANTE'}
                  </span>
                </div>

                {/* Secondary positions — checkbox pill toggles */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[9px] text-base-content/40 font-mono uppercase w-14 shrink-0">
                    SECUND.
                  </span>
                  {(Object.keys(positionAbbreviations) as Position[]).map((pos) => {
                    if (pos === editingPlayer.posicaoPrincipal) return null;
                    const isSelected = editingPlayer.posicoesSecundarias.includes(pos);
                    return (
                      <label
                        key={pos}
                        className={`px-1.5 py-0.5 rounded border text-[9px] font-bold cursor-pointer uppercase select-none transition-colors ${
                          isSelected
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-base-300 border-base-300 text-base-content/50 hover:border-base-content/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...editingPlayer.posicoesSecundarias, pos]
                              : editingPlayer.posicoesSecundarias.filter((p) => p !== pos);
                            setEditingPlayer({ ...editingPlayer, posicoesSecundarias: updated });
                          }}
                          className="hidden"
                        />
                        {positionAbbreviations[pos]}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Promotion Banner if Guest */}
            {editingPlayer.isGuest && (
              <div className="flex items-center justify-between bg-primary/10 border border-primary/20 p-4 rounded-xl shadow-inner mb-4">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black uppercase text-primary font-mono tracking-wider">
                    Atleta Convidado
                  </span>
                  <p className="text-[10px] text-base-content/70">
                    Este atleta está cadastrado como convidado temporário.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingPlayer({ ...editingPlayer, isGuest: false })}
                  className="btn btn-primary btn-xs uppercase font-bold text-[9px] tracking-wide px-3"
                >
                  Promover a Atleta Fixo
                </button>
              </div>
            )}

            {/* Informações Básicas e Físicas */}
            <div className="bg-base-300/40 p-4 rounded-xl border border-base-300 space-y-4">
              <span className="text-[9px] font-bold text-base-content/40 uppercase block mb-1">
                Informações Básicas e Físicas
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Genero */}
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-base-content/60 uppercase">
                    Gênero
                  </label>
                  <select
                    value={editingPlayer.genero}
                    onChange={(e) =>
                      setEditingPlayer({ ...editingPlayer, genero: e.target.value as any })
                    }
                    className="select select-bordered select-xs w-full uppercase font-bold"
                  >
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>
                {/* Altura */}
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-base-content/60 uppercase">
                    Altura (CM)
                  </label>
                  <input
                    type="number"
                    value={editingPlayer.alturaCm || ''}
                    onChange={(e) =>
                      setEditingPlayer({
                        ...editingPlayer,
                        alturaCm: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    className="input input-bordered input-xs w-full uppercase font-mono font-bold"
                    placeholder="Altura"
                  />
                  {validationErrors.alturaCm && (
                    <p className="text-[8px] text-error font-bold uppercase">
                      {validationErrors.alturaCm}
                    </p>
                  )}
                </div>
                {/* Mao Dominante */}
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-base-content/60 uppercase">
                    Mão Dominante
                  </label>
                  <select
                    value={editingPlayer.maoDominante}
                    onChange={(e) =>
                      setEditingPlayer({ ...editingPlayer, maoDominante: e.target.value as any })
                    }
                    className="select select-bordered select-xs w-full uppercase font-bold"
                  >
                    <option value="direita">Destro</option>
                    <option value="esquerda">Canhoto</option>
                  </select>
                </div>
                {/* Status Ativo */}
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-base-content/60 uppercase">
                    Status Geral
                  </label>
                  <select
                    value={editingPlayer.ativo ? 'ativo' : 'inativo'}
                    onChange={(e) =>
                      setEditingPlayer({ ...editingPlayer, ativo: e.target.value === 'ativo' })
                    }
                    className="select select-bordered select-xs w-full uppercase font-bold"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>

              {/* Status de Saúde e Frequência */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-base-300 pt-3">
                <div className="flex items-center justify-between bg-base-300 p-2 rounded border border-base-300">
                  <span className="text-[9px] font-bold uppercase text-base-content/70">
                    Atleta Lesionado
                  </span>
                  <input
                    type="checkbox"
                    checked={editingPlayer.status.lesionado}
                    onChange={(e) =>
                      setEditingPlayer({
                        ...editingPlayer,
                        status: { ...editingPlayer.status, lesionado: e.target.checked },
                      })
                    }
                    className="checkbox checkbox-error checkbox-sm"
                  />
                </div>
                <div className="flex items-center justify-between bg-base-300 p-2 rounded border border-base-300">
                  <span className="text-[9px] font-bold uppercase text-base-content/70">
                    Presença Frequente
                  </span>
                  <input
                    type="checkbox"
                    checked={editingPlayer.status.presencaFrequente}
                    onChange={(e) =>
                      setEditingPlayer({
                        ...editingPlayer,
                        status: { ...editingPlayer.status, presencaFrequente: e.target.checked },
                      })
                    }
                    className="checkbox checkbox-primary checkbox-sm"
                  />
                </div>
              </div>

              {/* Limitacao Fisica */}
              {editingPlayer.status.lesionado && (
                <div className="flex flex-col gap-1 border-t border-base-300 pt-3">
                  <label className="text-[8px] font-bold text-error uppercase">
                    Limitação Física / Observação de Lesão
                  </label>
                  <input
                    type="text"
                    value={editingPlayer.status.limitacaoFisica || ''}
                    onChange={(e) =>
                      setEditingPlayer({
                        ...editingPlayer,
                        status: {
                          ...editingPlayer.status,
                          limitacaoFisica: e.target.value || null,
                        },
                      })
                    }
                    className="input input-bordered input-xs w-full uppercase font-bold text-error placeholder:text-error/30"
                    placeholder="Ex: Lesão no joelho esquerdo"
                  />
                </div>
              )}
            </div>

            {/* Perfil do Atleta (Auto-calculado) */}
            <div className="bg-base-300/40 p-4 rounded-xl border border-base-300 space-y-3">
              <span className="text-[9px] font-bold text-base-content/40 uppercase block">
                Perfil do Atleta
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 bg-base-300/50 p-2.5 rounded-lg border border-base-300/50">
                  <span className="text-[8px] font-bold text-success uppercase">
                    ★ Especialidade
                  </span>
                  <span className="text-xs font-bold text-success mt-0.5 truncate">
                    {getAutoSpecialty(editingPlayer)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 bg-base-300/50 p-2.5 rounded-lg border border-base-300/50">
                  <span className="text-[8px] font-bold text-error uppercase">⚠ Fraqueza</span>
                  <span className="text-xs font-bold text-error mt-0.5 truncate">
                    {getAutoWeakness(editingPlayer)}
                  </span>
                </div>
              </div>
            </div>

            {/* Forma Física e Observações */}
            <div className="bg-base-300/40 p-4 rounded-xl border border-base-300 space-y-4">
              <span className="text-[9px] font-bold text-base-content/40 uppercase block mb-1">
                Forma Física Atual
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Valor Forma */}
                <div className="flex flex-col gap-1 col-span-1">
                  <label className="text-[8px] font-bold text-base-content/60 uppercase">
                    Rating de Forma (-5 a 5)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingPlayer({
                          ...editingPlayer,
                          formaAtual: {
                            ...editingPlayer.formaAtual,
                            valor: Math.max(-5, editingPlayer.formaAtual.valor - 1),
                          },
                        })
                      }
                      className="btn btn-xs btn-circle btn-ghost"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min="-5"
                      max="5"
                      step="1"
                      value={editingPlayer.formaAtual.valor}
                      onChange={(e) =>
                        setEditingPlayer({
                          ...editingPlayer,
                          formaAtual: {
                            ...editingPlayer.formaAtual,
                            valor: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="range range-xs range-accent w-full"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditingPlayer({
                          ...editingPlayer,
                          formaAtual: {
                            ...editingPlayer.formaAtual,
                            valor: Math.min(5, editingPlayer.formaAtual.valor + 1),
                          },
                        })
                      }
                      className="btn btn-xs btn-circle btn-ghost"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-mono font-bold text-accent min-w-[20px] text-center">
                      {editingPlayer.formaAtual.valor}
                    </span>
                  </div>
                </div>
                {/* Observacao Forma */}
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-[8px] font-bold text-base-content/60 uppercase">
                    Observação sobre a Forma
                  </label>
                  <input
                    type="text"
                    value={editingPlayer.formaAtual.observacao || ''}
                    onChange={(e) =>
                      setEditingPlayer({
                        ...editingPlayer,
                        formaAtual: { ...editingPlayer.formaAtual, observacao: e.target.value },
                      })
                    }
                    className="input input-bordered input-xs w-full font-bold text-base-content"
                    placeholder="Ex: Em plena evolução"
                  />
                </div>
              </div>
            </div>

            {/* Main sliders editor */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-base-content/60">
                Editor de Atributos Principais
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    label: 'Ataque',
                    key: 'ataque' as keyof Attributes,
                    placement: 'tooltip-right',
                  },
                  {
                    label: 'Defesa',
                    key: 'defesa' as keyof Attributes,
                    placement: 'tooltip-right',
                  },
                  { label: 'Saque', key: 'saque' as keyof Attributes, placement: 'tooltip-left' },
                  {
                    label: 'Stamina / Resistência',
                    key: 'resistencia' as keyof Attributes,
                    placement: 'tooltip-left',
                  },
                ].map((attr) => (
                  <div
                    key={attr.key}
                    className="bg-base-300 p-3.5 rounded-xl border border-base-300 transition-colors"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] font-bold uppercase text-base-content/70 tracking-wider whitespace-nowrap">
                          {attr.label}
                        </span>
                        <div
                          className={`tooltip ${attr.placement} cursor-help`}
                          data-tip={ATTRIBUTE_TOOLTIPS[attr.key]}
                        >
                          <Info className="w-3.5 h-3.5 text-base-content/40 hover:text-base-content/70" />
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-accent whitespace-nowrap">
                        {editingPlayer.atributos[attr.key]} ·{' '}
                        <span className="text-[10px] text-base-content/50 uppercase font-sans font-medium">
                          {getAttributeLabel(editingPlayer.atributos[attr.key])}
                        </span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={editingPlayer.atributos[attr.key]}
                      onChange={(e) =>
                        setEditingPlayer({
                          ...editingPlayer,
                          atributos: {
                            ...editingPlayer.atributos,
                            [attr.key]: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="range range-accent range-xs w-full"
                    />
                  </div>
                ))}
              </div>

              {/* Other technical attributes */}
              <div className="bg-base-300 p-4 rounded-xl border border-base-300 mt-3">
                <span className="text-[9px] font-bold text-base-content/40 uppercase block mb-3">
                  Outros Atributos Técnicos
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    {
                      label: 'Recepção',
                      key: 'recepcao' as keyof Attributes,
                      placement: 'tooltip-right',
                    },
                    {
                      label: 'Levantamento',
                      key: 'levantamento' as keyof Attributes,
                      placement: 'tooltip-top',
                    },
                    {
                      label: 'Bloqueio',
                      key: 'bloqueio' as keyof Attributes,
                      placement: 'tooltip-left',
                    },
                    {
                      label: 'Velocidade',
                      key: 'velocidade' as keyof Attributes,
                      placement: 'tooltip-right',
                    },
                    {
                      label: 'Visão de Jogo',
                      key: 'leituraDeJogo' as keyof Attributes,
                      placement: 'tooltip-top',
                    },
                    {
                      label: 'Consistência',
                      key: 'regularidade' as keyof Attributes,
                      placement: 'tooltip-left',
                    },
                    {
                      label: 'Estabilidade Mental',
                      key: 'controleEmocional' as keyof Attributes,
                      placement: 'tooltip-right',
                    },
                  ].map((attr) => (
                    <div key={attr.key} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[8px] font-bold text-base-content/60 uppercase whitespace-nowrap">
                            {attr.label}
                          </span>
                          <div
                            className={`tooltip ${attr.placement} cursor-help`}
                            data-tip={ATTRIBUTE_TOOLTIPS[attr.key]}
                          >
                            <Info className="w-2.5 h-2.5 text-base-content/40 hover:text-base-content/70" />
                          </div>
                        </div>
                        <span className="text-[9px] font-mono font-bold text-primary whitespace-nowrap">
                          {editingPlayer.atributos[attr.key]} ·{' '}
                          <span className="text-[8px] text-base-content/40 uppercase font-sans font-medium">
                            {getAttributeLabel(editingPlayer.atributos[attr.key])}
                          </span>
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="0.5"
                        value={editingPlayer.atributos[attr.key]}
                        onChange={(e) =>
                          setEditingPlayer({
                            ...editingPlayer,
                            atributos: {
                              ...editingPlayer.atributos,
                              [attr.key]: parseFloat(e.target.value),
                            },
                          })
                        }
                        className="range range-primary range-xs w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Performance History (Line Chart) */}
            <div className="space-y-3 border-t border-base-300 pt-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-base-content/60">
                Histórico de Performance
              </h4>
              <div className="bg-base-300 p-4 rounded-xl border border-base-300 min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={historyData} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                    <XAxis dataKey="name" stroke="var(--color-text-subtle)" fontSize={8} />
                    <YAxis stroke="var(--color-text-subtle)" fontSize={8} domain={[0, 100]} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="forma"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--color-accent)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Action buttons (Bottom) */}
          <div className="flex items-center justify-between border-t border-base-300 pt-4 mt-4">
            <div className="flex gap-2">
              {!showDeleteConfirm ? (
                <button onClick={() => setShowDeleteConfirm(true)} className="btn btn-error btn-sm">
                  <Trash2 className="w-3.5 h-3.5" /> {hasHistory ? 'Desativar' : 'Excluir'}
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-error/15 p-1 px-3 rounded-full border border-error/30 animate-fade-in">
                  <span className="text-[8px] font-bold text-error uppercase">Confirmar?</span>
                  <button
                    onClick={onDelete}
                    className="px-2 py-0.5 bg-error text-error-content rounded text-[8px] font-bold uppercase"
                  >
                    Sim
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-2 py-0.5 bg-base-300 text-base-content rounded text-[8px] font-bold uppercase"
                  >
                    Não
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={handleRevert} className="btn btn-neutral btn-sm">
                Reverter
              </button>
              <button onClick={onSave} className="btn btn-accent btn-sm">
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>

        {/* COLUMN 4: Radar Chart (Right) */}
        <div className="lg:col-span-1 card bg-base-200 border border-base-300 p-6 h-auto lg:h-[780px] flex flex-col justify-between shadow-xl min-w-0 overflow-hidden">
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase text-base-content tracking-wider">
              Radar de Habilidades
            </h3>
            <p className="text-[10px] text-base-content/65 leading-relaxed">
              Gráfico técnico de equilíbrio do atleta por fundamento.
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis dataKey="subject" stroke="var(--color-text-muted)" fontSize={9} />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  stroke="var(--color-text-subtle)"
                  fontSize={8}
                />
                <Radar
                  name={editingPlayer.apelido || editingPlayer.nome}
                  dataKey="A"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3">
            {/* Overall + forma delta panel */}
            <div className="bg-base-300 p-4 rounded-xl border border-base-300">
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-[10px] font-bold text-base-content/60 uppercase">
                    Overall
                  </span>
                  <p className="text-3xl font-black font-mono text-accent mt-0.5">{overall}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-base-content/40 font-bold uppercase">
                    Influência da Forma
                  </p>
                  <div className="flex items-center gap-1 justify-end mt-0.5">
                    <span className="text-[10px] font-mono text-base-content/50">
                      base {rawOverall}
                    </span>
                    {overall !== rawOverall && (
                      <span
                        className={`text-[11px] font-black font-mono ${overall > rawOverall ? 'text-success' : 'text-error'}`}
                      >
                        {overall > rawOverall ? '+' : ''}
                        {overall - rawOverall}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <progress
                      className="progress progress-accent w-16 h-1.5"
                      value={editingPlayer.formaAtual.valor + 5}
                      max={10}
                    />
                    <span className="text-[9px] font-mono font-bold text-accent">
                      {editingPlayer.formaAtual.valor}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {/* Positional overalls */}
            <div className="bg-base-300/60 rounded-xl border border-base-300 p-3 space-y-2">
              <p className="text-[8px] font-bold uppercase tracking-widest text-base-content/40">
                Overall por Posição
              </p>
              {(
                ['levantador', 'oposto', 'ponteiro', 'central', 'libero', 'all-rounder'] as const
              ).map((pos) => {
                const posOverall = calculatePositionOverall(editingPlayer, pos);
                const isPrimary = pos === editingPlayer.posicaoPrincipal;
                const isSecondary = editingPlayer.posicoesSecundarias.includes(pos);
                return (
                  <div
                    key={pos}
                    className={`flex items-center justify-between text-[9px] font-mono ${
                      isPrimary
                        ? 'text-accent'
                        : isSecondary
                          ? 'text-primary'
                          : 'text-base-content/30'
                    }`}
                  >
                    <span className="uppercase font-bold">{positionLabels[pos]}</span>
                    <div className="flex items-center gap-2">
                      <progress
                        className={`progress w-16 h-1 ${
                          isPrimary
                            ? 'progress-accent'
                            : isSecondary
                              ? 'progress-primary'
                              : 'progress-neutral'
                        }`}
                        value={posOverall}
                        max={100}
                      />
                      <span className="font-black w-6 text-right">{posOverall}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
