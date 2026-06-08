import { Player, Attributes, Position, TeamStrengthSnapshot, PositionWeights, OverallMetric } from '../types';
import { POSITION_WEIGHTS } from '../constants';

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function calculateHeightScore(heightCm?: number | null): number {
  if (!heightCm) return 5;

  const minHeight = 155;
  const maxHeight = 195;

  const score = 1 + ((heightCm - minHeight) / (maxHeight - minHeight)) * 9;

  return Number(clamp(score, 1, 10).toFixed(1));
}

export const calculatePositionOverall = (player: Player, position: Position): number => {
  const weights = POSITION_WEIGHTS[position];
  const { atributos, formaAtual, alturaCm } = player;
  const heightScore = calculateHeightScore(alturaCm);
  
  let overall = 0;
  
  Object.entries(weights).forEach(([metric, weight]) => {
    if (!weight) return;
    
    const value = metric === 'altura' 
      ? heightScore 
      : (atributos[metric as keyof Attributes] || 0);
      
    overall += value * weight;
  });
  
  const baseRating = Math.round(overall * 10);
  const adjustedRating = Math.round(baseRating + formaAtual.valor * 0.5);
  return adjustedRating;
};

export const calculateGeneralOverall = (player: Player): number => {
  const { atributos, formaAtual, alturaCm } = player;
  const values = Object.values(atributos);
  const sum = values.reduce((acc, val) => acc + val, 0);
  const baseAttrAvg = sum / values.length;
  
  // Overall general: height weighs 5%
  const heightScore = calculateHeightScore(alturaCm);
  const overall = (baseAttrAvg * 0.95) + (heightScore * 0.05);
  
  const baseRating = Math.round(overall * 10);
  const adjustedRating = Math.round(baseRating + formaAtual.valor * 0.5);
  return adjustedRating;
};

export const calculateNetPresence = (players: Player[]): number => {
  if (players.length === 0) return 0;

  const values = players.map(player => {
    const altura = calculateHeightScore(player.alturaCm);
    return (
      (player.atributos.bloqueio || 5) * 0.45 +
      (player.atributos.ataque || 5) * 0.35 +
      altura * 0.20
    );
  });

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number(average.toFixed(1));
};

export const getBalancingRole = (atributos: Attributes): string => {
  const { ataque, recepcao, defesa, levantamento, bloqueio } = atributos;

  if (ataque >= 7.5 && recepcao < 6) return 'Atacante Especialista';
  if (recepcao >= 7.5 && defesa >= 7.5) return 'Passador de Elite';
  if (levantamento >= 7.5) return 'Arquiteto do Jogo';
  if (bloqueio >= 7.5 && ataque >= 7) return 'Parede de Ataque';
  if (defesa >= 8) return 'Muralha Defensiva';
  
  const values = [ataque, recepcao, defesa, levantamento, bloqueio];
  const allMedian = values.every(v => v >= 5 && v <= 7.5);
  if (allMedian) return 'Coringa';
  
  if (values.every(v => v < 5)) return 'Recruta (Em Evolução)';
  
  return 'Jogador de Suporte';
};

const SPECIALTY_PHRASES: Record<keyof Attributes, string> = {
  saque: 'Saque Devastador',
  recepcao: 'Recepção de Elite',
  levantamento: 'Levantamento Preciso',
  ataque: 'Ataque Letal',
  bloqueio: 'Bloqueio Impenetrável',
  defesa: 'Defesa Sólida',
  velocidade: 'Explosão Atlética',
  resistencia: 'Resistência Superior',
  leituraDeJogo: 'Visão Tática Apurada',
  regularidade: 'Consistência Técnica',
  controleEmocional: 'Equilíbrio Emocional',
};

const WEAKNESS_PHRASES: Record<keyof Attributes, string> = {
  saque: 'Saque Inconsistente',
  recepcao: 'Recepção Vulnerável',
  levantamento: 'Distribuição Limitada',
  ataque: 'Ataque Previsível',
  bloqueio: 'Bloqueio Deficiente',
  defesa: 'Defesa Frágil',
  velocidade: 'Lento nos Deslocamentos',
  resistencia: 'Resistência Abaixo do Ideal',
  leituraDeJogo: 'Leitura de Jogo Básica',
  regularidade: 'Alta Taxa de Erros',
  controleEmocional: 'Instabilidade sob Pressão',
};

// Position-critical attributes used to break ties in specialty detection
const POSITION_CRITICAL: Partial<Record<string, Array<keyof Attributes>>> = {
  levantador: ['levantamento', 'leituraDeJogo', 'regularidade'],
  oposto: ['ataque', 'saque', 'bloqueio'],
  ponteiro: ['ataque', 'recepcao', 'defesa'],
  central: ['bloqueio', 'ataque', 'velocidade'],
  libero: ['recepcao', 'defesa', 'regularidade'],
  'all-rounder': ['regularidade', 'leituraDeJogo', 'resistencia'],
};

export const getAutoSpecialty = (player: Player): string => {
  const { atributos, posicaoPrincipal, formaAtual } = player;

  if (formaAtual.valor >= 4.5) return 'Pico Absoluto de Forma';
  if (formaAtual.valor >= 3.5) return 'Em Grande Fase';

  const sorted = (Object.entries(atributos) as [keyof Attributes, number][])
    .sort(([, a], [, b]) => b - a);

  const [topKey, topVal] = sorted[0];
  if (topVal < 4) return 'Em Desenvolvimento';

  // Prefer a position-critical attribute if it's close to the top (within 1 point)
  const critical = POSITION_CRITICAL[posicaoPrincipal] ?? [];
  for (const key of critical) {
    const val = atributos[key] ?? 0;
    if (val >= topVal - 1 && val >= 6) {
      return SPECIALTY_PHRASES[key];
    }
  }

  return SPECIALTY_PHRASES[topKey];
};

export const getAutoWeakness = (player: Player): string => {
  const { atributos, formaAtual } = player;

  if (formaAtual.valor <= -2.5) return 'Fora de Forma';

  const sorted = (Object.entries(atributos) as [keyof Attributes, number][])
    .sort(([, a], [, b]) => a - b);

  const [bottomKey, bottomVal] = sorted[0];
  if (bottomVal >= 7.5) return 'Sem fraqueza evidente';

  return WEAKNESS_PHRASES[bottomKey];
};

export const getPlayerRecommendation = (player: Player): { bestPosition: Position, allPositions: { position: Position, rating: number }[] } => {
  const positions: Position[] = ['levantador', 'oposto', 'ponteiro', 'central', 'libero', 'all-rounder'];
  const ratings = positions.map(pos => ({
    position: pos,
    rating: calculatePositionOverall(player, pos)
  })).sort((a, b) => b.rating - a.rating);

  return {
    bestPosition: ratings[0].position,
    allPositions: ratings
  };
};

export const calculateTeamStrength = (players: Player[]): TeamStrengthSnapshot => {
  if (players.length === 0) {
    return {
      overall: 0, attack: 0, reception: 0, setting: 0, defense: 0,
      block: 0, serve: 0, regularity: 0, stamina: 0, gameReading: 0,
      netPresence: 0,
      maleCount: 0, femaleCount: 0
    };
  }

  const getEffectiveAttr = (p: Player, attr: keyof Attributes) => {
    const base = p.atributos[attr] || 0;
    const bonus = p.formaAtual.valor * 0.2; // Max +/- 1.0 on a -5 to 5 scale
    return Math.max(0, Math.min(10, base + bonus));
  };

  const avgEffective = (attr: keyof Attributes) => players.length > 0 ? players.reduce((acc, p) => acc + getEffectiveAttr(p, attr), 0) / players.length : 0;
  
  // Special logic for setting as per spec: best + 50% of second best
  const settingValues = players.map(p => getEffectiveAttr(p, 'levantamento')).sort((a, b) => b - a);
  const settingStrength = settingValues.length > 0 
    ? settingValues[0] + (settingValues[1] ? settingValues[1] * 0.5 : 0)
    : 0;

  return {
    overall: Number((players.reduce((acc, p) => acc + calculateGeneralOverall(p), 0) / (players.length || 1)).toFixed(1)),
    attack: Number(avgEffective('ataque').toFixed(1)),
    reception: Number(avgEffective('recepcao').toFixed(1)),
    setting: Number(settingStrength.toFixed(1)),
    defense: Number(avgEffective('defesa').toFixed(1)),
    block: Number(avgEffective('bloqueio').toFixed(1)),
    serve: Number(avgEffective('saque').toFixed(1)),
    regularity: Number(avgEffective('regularidade').toFixed(1)),
    stamina: Number(avgEffective('resistencia').toFixed(1)),
    gameReading: Number(avgEffective('leituraDeJogo').toFixed(1)),
    averageHeight: players.some(p => p.alturaCm) 
      ? Math.round(players.reduce((acc, p) => acc + (p.alturaCm || 0), 0) / (players.filter(p => p.alturaCm).length || 1)) 
      : null,
    netPresence: calculateNetPresence(players),
    maleCount: players.filter(p => p.genero === 'M').length,
    femaleCount: players.filter(p => p.genero === 'F').length,
  };
};

export const calculateGenderDistribution = (totalMulheres: number, numeroTimes: number): number[] => {
  const base = Math.floor(totalMulheres / numeroTimes);
  const sobra = totalMulheres % numeroTimes;

  const distribuicao: number[] = [];
  for (let i = 0; i < numeroTimes; i++) {
    distribuicao.push(i < sobra ? base + 1 : base);
  }
  return distribuicao;
};

export const calculateTeamSizes = (totalJogadores: number, numeroTimes: number): number[] => {
  const base = Math.floor(totalJogadores / numeroTimes);
  const sobra = totalJogadores % numeroTimes;

  const tamanhos: number[] = [];
  for (let i = 0; i < numeroTimes; i++) {
    tamanhos.push(i < sobra ? base + 1 : base);
  }
  return tamanhos;
};

export const getAttributeLabel = (val: number): string => {
  if (val < 3) return 'Inexperiente';
  if (val < 5) return 'Ruim';
  if (val < 6) return 'Ok';
  if (val < 7) return 'Regular';
  if (val < 8) return 'Bom';
  if (val < 9) return 'Muito Bom';
  if (val < 10) return 'Federado';
  return 'Profissional';
};

