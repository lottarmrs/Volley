import type { MyCard } from '@app/myCards';
import type { Achievement, AchievementRarity } from '@logic/futCards';

export const CARTA_L = 260;
export const CARTA_A = 370;

export const TOM_DO_TIER: Record<string, string> = {
  bronze: '#c58a5c',
  silver: '#b4c6d3',
  gold: '#e5bf45',
  elite: '#8b5cf6',
};

export const TOM_DA_EDICAO: Record<string, string> = {
  mvp: '#f5c542',
  maestro: '#2dd4bf',
  muralha: '#f97316',
  in_form: '#c084fc',
};

export const RARIDADE: Record<AchievementRarity, { nome: string; cor: string }> = {
  common: { nome: 'Comum', cor: '#d7ccc8' },
  uncommon: { nome: 'Incomum', cor: '#81c784' },
  rare: { nome: 'Rara', cor: '#64b5f6' },
  epic: { nome: 'Épica', cor: '#ce93d8' },
  legendary: { nome: 'Lendária', cor: '#ffb300' },
};

export const SILHUETAS = [
  { nome: 'MVP', tom: TOM_DA_EDICAO.mvp },
  { nome: 'Maestro', tom: TOM_DA_EDICAO.maestro },
  { nome: 'Muralha', tom: TOM_DA_EDICAO.muralha },
];

export function tomDa(carta: MyCard | undefined): string {
  if (!carta || carta.loading) return '#8a8f98';
  const { card } = carta;
  if (card.edition.kind !== 'base') return TOM_DA_EDICAO[card.edition.kind] ?? '#f97316';
  return card.stats.rated ? TOM_DO_TIER[card.stats.tier] : '#8a8f98';
}

export function formatarData(data: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  return partes ? `${partes[3]}.${partes[2]}.${partes[1]}` : data;
}

export function faltam(conquista: Achievement): string {
  const resta = Math.ceil(conquista.target - conquista.current);
  if (resta <= 0) return 'falta pouco';
  return resta === 1 ? 'falta 1' : `faltam ${resta}`;
}

export function progresso(conquista: Achievement): number {
  const teto = conquista.unlocked ? 100 : 95;
  return Math.round(Math.min(teto, Math.max(0, (conquista.current / conquista.target) * 100)));
}
