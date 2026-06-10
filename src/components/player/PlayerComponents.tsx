import React from 'react';
import { Info } from 'lucide-react';
import { motion } from 'motion/react';
import { Player, Attributes } from '../../types';
import {
  calculateGeneralOverall,
  getBalancingRole,
  calculatePositionOverall,
  getAutoSpecialty,
  getAutoWeakness,
  getAttributeLabel,
} from '../../logic/calculations';

export const AttributeEditor = ({
  attributes,
  onChange,
}: {
  attributes: Attributes;
  onChange: (key: keyof Attributes, value: number) => void;
}) => {
  const attributeTooltips: Record<keyof Attributes, string> = {
    saque: 'Força, precisão e regularidade do serviço.',
    recepcao: 'Qualidade do passe após o saque adversário.',
    levantamento: 'Precisão e inteligência na distribuição das jogadas.',
    ataque: 'Poder de finalização, técnica e variação de golpes.',
    bloqueio: 'Posicionamento e eficácia em interceptar ataques.',
    defesa: 'Reflexo e técnica para recuperar bolas atacadas.',
    velocidade: 'Agilidade de deslocamento e rapidez de reação.',
    resistencia: 'Capacidade de manter o nível durante partidas longas.',
    leituraDeJogo: 'Visão tática e antecipação de jogadas.',
    regularidade: 'Consistência técnica e baixo índice de erros.',
    controleEmocional: 'Estabilidade mental em pontos decisivos.',
  };

  const attributeLabels: Record<keyof Attributes, string> = {
    saque: 'Saque',
    recepcao: 'Recepção',
    levantamento: 'Levantamento',
    ataque: 'Ataque',
    bloqueio: 'Bloqueio',
    defesa: 'Defesa',
    velocidade: 'Velocidade',
    resistencia: 'Resistência',
    leituraDeJogo: 'Visão de Jogo',
    regularidade: 'Consistência',
    controleEmocional: 'Estabilidade Mental',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {(Object.keys(attributeLabels) as Array<keyof Attributes>).map((key) => (
        <div
          key={key}
          className="bg-base-300 p-3.5 rounded-xl border border-base-300 hover:border-base-content/20 transition-colors group"
        >
          <div className="flex justify-between items-center mb-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-bold uppercase text-base-content/70 tracking-widest">
                {attributeLabels[key]}
              </label>
              <div className="group/tip relative">
                <Info className="w-3.5 h-3.5 text-base-content/50 cursor-help" />
                <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-base-200 border border-base-300 rounded text-[9px] text-base-content opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 pointer-events-none uppercase tracking-tighter leading-relaxed">
                  {attributeTooltips[key]}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-bold text-accent uppercase">
              {attributes[key]} · {getAttributeLabel(attributes[key])}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={attributes[key]}
            onChange={(e) => onChange(key, parseFloat(e.target.value))}
            className="range range-primary range-xs w-full"
          />
        </div>
      ))}
    </div>
  );
};

export const StatBar = ({
  label,
  value,
  max = 10,
  color = 'progress-primary',
}: {
  label: string;
  value: number;
  max?: number;
  color?: string;
}) => {
  const progressColor = color.replace('bg-', 'progress-');
  return (
    <div className="mb-2.5">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] uppercase tracking-wider text-base-content/50 font-mono">
          {label}
        </span>
        <span className="text-xs font-bold font-mono">{value}</span>
      </div>
      <progress className={`progress ${progressColor} w-full`} value={value} max={max} />
    </div>
  );
};

/* Compact mini stat cell used inside the PlayerItem card */
const MiniStat = ({ label, value }: { label: string; value: number }) => {
  const color =
    value >= 8
      ? 'text-accent'
      : value >= 6
        ? 'text-primary'
        : value >= 4
          ? 'text-base-content/70'
          : 'text-base-content/40';

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-[11px] font-black font-mono leading-none ${color}`}>{value}</span>
      <span className="text-[7px] uppercase font-bold text-base-content/40 tracking-wide leading-none">
        {label}
      </span>
    </div>
  );
};

export const PlayerItem: React.FC<{
  player: Player;
  isSelected?: boolean;
  onToggle?: () => void;
}> = ({ player, isSelected, onToggle }) => {
  const overall = calculatePositionOverall(player, player.posicaoPrincipal);
  const rawOverall = calculatePositionOverall(
    { ...player, formaAtual: { ...player.formaAtual, valor: 0 } },
    player.posicaoPrincipal,
  );
  const balancingRole = getBalancingRole(player.atributos);

  // Best positional overalls (top 2)
  const positions = [
    'levantador',
    'oposto',
    'ponteiro',
    'central',
    'libero',
    'all-rounder',
  ] as const;
  const positionOveralls = positions
    .map((pos) => ({ pos, rating: calculatePositionOverall(player, pos) }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 2);

  const positionLabels: Record<string, string> = {
    levantador: 'Levantador',
    oposto: 'Oposto',
    ponteiro: 'Ponteiro',
    central: 'Central',
    libero: 'Líbero',
    'all-rounder': 'Coringa',
  };

  const positionAbbreviations: Record<string, string> = {
    levantador: 'LEV',
    oposto: 'OPO',
    ponteiro: 'PON',
    central: 'CEN',
    libero: 'LIB',
    'all-rounder': 'COR',
  };

  const initials = player.nome ? player.nome.substring(0, 2).toUpperCase() : 'AT';
  const formPct = Math.round(((player.formaAtual.valor + 5) / 10) * 100);
  const formDelta = overall - rawOverall;
  const tierLabel =
    overall > 75 ? 'ELITE' : overall > 60 ? 'COMP' : overall > 45 ? 'SOCIAL' : 'BASE';
  const tierColor =
    overall > 75
      ? 'badge-warning'
      : overall > 60
        ? 'badge-primary'
        : overall > 45
          ? 'badge-secondary'
          : 'badge-ghost';

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      onClick={onToggle}
      className={`card bg-base-200 border shadow-md rounded-2xl cursor-pointer transition-all border-l-4 ${
        isSelected
          ? 'border-primary bg-primary/5 shadow-primary/10'
          : 'border-base-300 hover:border-primary/50 hover:shadow-primary/5'
      } ${!player.ativo ? 'opacity-50 grayscale' : ''}`}
    >
      <div className="card-body p-4 gap-3">
        {/* ── Top Row: Avatar + Name + Overall ───────────────────────── */}
        <div className="flex gap-3 items-center">
          <div
            className={`avatar avatar-placeholder ${player.ativo ? 'avatar-online' : 'avatar-offline'}`}
          >
            <div className="w-12 rounded-full bg-base-300 text-accent font-black ring-2 ring-primary/40 ring-offset-2 ring-offset-base-200">
              <span className="text-xs">{initials}</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm leading-tight uppercase tracking-tight truncate text-base-content">
              {player.nome}
              {player.apelido && player.apelido !== player.nome && (
                <span className="text-accent font-semibold lowercase italic text-xs ml-1">
                  "{player.apelido}"
                </span>
              )}
            </h3>
            <p className="text-[9px] uppercase text-base-content/50 font-bold tracking-wider mt-0.5">
              {positionLabels[player.posicaoPrincipal] || player.posicaoPrincipal}
              {' • '}
              <span className="text-primary font-bold">{balancingRole}</span>
            </p>
          </div>

          {/* Overall + forma delta */}
          <div className="text-right shrink-0">
            <div className="flex items-baseline gap-0.5 justify-end">
              <span className="text-xl font-black font-mono text-accent leading-none">
                {overall}
              </span>
              {formDelta !== 0 && (
                <span
                  className={`text-[9px] font-black font-mono ${formDelta > 0 ? 'text-success' : 'text-error'}`}
                >
                  {formDelta > 0 ? '+' : ''}
                  {formDelta}
                </span>
              )}
            </div>
            <p className="text-[7px] uppercase text-base-content/40 font-bold tracking-wider">
              OVERALL
            </p>
            {/* Forma influence note */}
            {formDelta !== 0 && (
              <p className="text-[7px] uppercase text-base-content/30 font-mono">
                base {rawOverall} {formDelta > 0 ? '▲forma' : '▼forma'}
              </p>
            )}
          </div>
        </div>

        {/* ── Badge Row ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1.5">
          {player.isGuest && (
            <span className="badge badge-accent badge-xs font-bold uppercase font-mono">
              CONVIDADO
            </span>
          )}
          {/* Tier */}
          <span className={`badge ${tierColor} badge-xs font-bold uppercase font-mono`}>
            {tierLabel}
          </span>

          {/* Position badges */}
          <span className="badge badge-neutral badge-xs font-bold uppercase font-mono">
            {positionAbbreviations[player.posicaoPrincipal] || player.posicaoPrincipal}
          </span>
          {player.posicoesSecundarias.map((p) => (
            <span
              key={p}
              className="badge badge-ghost badge-xs font-bold uppercase font-mono opacity-70"
            >
              {positionAbbreviations[p] || p}
            </span>
          ))}

          <span className="badge badge-outline badge-xs font-bold uppercase">
            {player.maoDominante === 'esquerda' ? 'Canhoto' : 'Destro'}
          </span>
        </div>

        {/* ── Specialty & Weakness (auto) ─────────────────── */}
        <div className="bg-base-300 p-2 rounded-lg border border-base-300 text-[10px] space-y-1">
          <div className="flex justify-between items-center text-success">
            <span className="font-bold uppercase tracking-tight">★</span>
            <span className="font-semibold truncate max-w-[170px] text-right">
              {getAutoSpecialty(player)}
            </span>
          </div>
          <div className="flex justify-between items-center text-error">
            <span className="font-bold uppercase tracking-tight">⚠</span>
            <span className="font-semibold truncate max-w-[170px] text-right">
              {getAutoWeakness(player)}
            </span>
          </div>
        </div>

        {/* ── All 11 Stats Grid ───────────────────────────────────────── */}
        <div className="bg-base-300/60 rounded-xl border border-base-300 p-2.5">
          <p className="text-[8px] font-bold uppercase tracking-widest text-base-content/35 mb-2">
            Atributos Técnicos
          </p>
          <div className="grid grid-cols-4 gap-y-2 gap-x-1">
            <MiniStat label="ATQ" value={player.atributos.ataque} />
            <MiniStat label="DEF" value={player.atributos.defesa} />
            <MiniStat label="SAQ" value={player.atributos.saque} />
            <MiniStat label="REC" value={player.atributos.recepcao} />
            <MiniStat label="LEV" value={player.atributos.levantamento} />
            <MiniStat label="BLQ" value={player.atributos.bloqueio} />
            <MiniStat label="VEL" value={player.atributos.velocidade} />
            <MiniStat label="RES" value={player.atributos.resistencia} />
            <MiniStat label="VIS" value={player.atributos.leituraDeJogo} />
            <MiniStat label="CON" value={player.atributos.regularidade} />
            <MiniStat label="MNT" value={player.atributos.controleEmocional} />
            {/* Forma Atual as percentage */}
            <div className="flex flex-col items-center gap-0.5">
              <span
                className={`text-[11px] font-black font-mono leading-none ${formPct >= 70 ? 'text-success' : formPct >= 40 ? 'text-warning' : 'text-error'}`}
              >
                {formPct}%
              </span>
              <span className="text-[7px] uppercase font-bold text-base-content/40 tracking-wide leading-none">
                FORMA
              </span>
            </div>
          </div>
        </div>

        {/* ── Overall by top positions ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          {positionOveralls.map(({ pos, rating }) => (
            <div
              key={pos}
              className="bg-base-300/40 rounded-lg px-2 py-1.5 flex items-center justify-between border border-base-300/60"
            >
              <span className="text-[8px] font-bold uppercase tracking-wide text-base-content/50 font-mono">
                {positionAbbreviations[pos]}
              </span>
              <span
                className={`text-[11px] font-black font-mono ${pos === player.posicaoPrincipal ? 'text-accent' : 'text-base-content/60'}`}
              >
                {rating}
              </span>
            </div>
          ))}
        </div>

        {/* ── Form Observation ────────────────────────────────────────── */}
        {player.formaAtual.observacao && (
          <p className="text-[9px] italic text-base-content/50 px-1 leading-relaxed truncate">
            "{player.formaAtual.observacao}"
          </p>
        )}

        {/* ── Bottom Row: Gender + Injury + Height ────────────────────── */}
        <div className="flex items-center justify-between pt-1 border-t border-base-300 text-[9px] font-mono text-base-content/40">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`w-2 h-2 rounded-full ${player.genero === 'M' ? 'bg-info' : 'bg-secondary'}`}
            />
            <span className="uppercase">{player.genero === 'M' ? 'Masculino' : 'Feminino'}</span>
            {player.status.lesionado && (
              <span className="badge badge-error badge-soft badge-xs font-bold uppercase rounded-md scale-90">
                Lesionado
                {player.status.limitacaoFisica && (
                  <span className="ml-0.5 normal-case">: {player.status.limitacaoFisica}</span>
                )}
              </span>
            )}
            {player.status.presencaFrequente && (
              <span className="badge badge-success badge-soft badge-xs font-bold uppercase rounded-md scale-90">
                ✓ Frequente
              </span>
            )}
          </div>
          {player.alturaCm && <span>{player.alturaCm} CM</span>}
        </div>
      </div>
    </motion.div>
  );
};
