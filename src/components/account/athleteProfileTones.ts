import type { Attributes, Player } from '@shared/types';
import type { VutCard, VutEditionKind } from '@logic/futCards';
import { toFut } from '@logic/futCards';
import { TOM_DA_EDICAO } from './myCardTones';

export type Aba = 'geral' | 'fundamentos' | 'conquistas' | 'edicoes';

export const ABAS: { id: Aba; nome: string; curto: string }[] = [
  { id: 'geral', nome: 'Visão geral', curto: 'Geral' },
  { id: 'fundamentos', nome: 'Fundamentos', curto: 'Fundamentos' },
  { id: 'conquistas', nome: 'Conquistas', curto: 'Conquistas' },
  { id: 'edicoes', nome: 'Edições', curto: 'Edições' },
];

export const FUNDAMENTOS: { chave: keyof Attributes; nome: string }[] = [
  { chave: 'saque', nome: 'Saque' },
  { chave: 'recepcao', nome: 'Recepção' },
  { chave: 'levantamento', nome: 'Levantamento' },
  { chave: 'ataque', nome: 'Ataque' },
  { chave: 'bloqueio', nome: 'Bloqueio' },
  { chave: 'defesa', nome: 'Defesa' },
  { chave: 'velocidade', nome: 'Velocidade' },
  { chave: 'resistencia', nome: 'Resistência' },
  { chave: 'leituraDeJogo', nome: 'Leitura de jogo' },
  { chave: 'regularidade', nome: 'Regularidade' },
  { chave: 'controleEmocional', nome: 'Controle emocional' },
];

export const NEUTRO = '#8a8f98';

export interface Leitura {
  texto: string;
  cor: string;
}

export function faseDa(media: number | null): Leitura {
  if (media == null || !Number.isFinite(media)) return { texto: 'sem jogos', cor: NEUTRO };
  if (media >= 8) return { texto: 'em alta', cor: '#4ade80' };
  if (media >= 7) return { texto: 'boa', cor: '#60a5fa' };
  if (media >= 6) return { texto: 'regular', cor: '#facc15' };
  return { texto: 'péssima', cor: '#fb923c' };
}

export function condicaoDe(player: Player): Leitura {
  return player.status?.lesionado
    ? { texto: player.genero === 'F' ? 'lesionada' : 'lesionado', cor: '#fb923c' }
    : { texto: 'saudável', cor: '#4ade80' };
}

export function maoDe(player: Player): string {
  const mao = String(player.maoDominante ?? '').toLowerCase();
  if (mao === 'direita' || mao === 'right') return 'destro';
  if (mao === 'esquerda' || mao === 'left') return 'canhoto';
  return '—';
}

const NOME_DA_EDICAO: Record<VutEditionKind, string> = {
  base: 'base',
  mvp: 'MVP',
  maestro: 'Maestro',
  muralha: 'Muralha',
  in_form: 'In-Form',
};

export function edicaoDa(card: VutCard): Leitura {
  const kind = card.edition.kind;
  return {
    texto: NOME_DA_EDICAO[kind] ?? card.edition.label,
    cor: kind === 'base' ? 'rgba(255,255,255,0.78)' : (TOM_DA_EDICAO[kind] ?? '#f97316'),
  };
}

export function formaRecente(card: VutCard): string {
  const historico = (card.player.formaAtual?.ultimasPartidas ?? []).filter(Number.isFinite);
  if (historico.length < 2) return '—';
  const media = historico.reduce((soma, nota) => soma + nota, 0) / historico.length;
  const diferenca = Math.round((historico[historico.length - 1] - media) * 10) / 10;
  if (diferenca === 0) return '±0,0';
  const sinal = diferenca > 0 ? '+' : '−';
  return `${sinal}${Math.abs(diferenca).toFixed(1).replace('.', ',')}`;
}

export function notaNaCarta(
  fundamentos: Partial<Attributes> | null,
  chave: keyof Attributes,
): number | null {
  const valor = fundamentos?.[chave];
  return typeof valor === 'number' && Number.isFinite(valor) ? toFut(valor) : null;
}

export function avaliado(fundamentos: Partial<Attributes> | null): boolean {
  return FUNDAMENTOS.some(({ chave }) => notaNaCarta(fundamentos, chave) != null);
}

export function alturaEmMetros(alturaCm: number | undefined): string {
  if (!alturaCm || !Number.isFinite(alturaCm) || alturaCm <= 0) return '—';
  return `${(alturaCm / 100).toFixed(2).replace('.', ',')} m`;
}

export function iniciaisDe(nome: string | undefined): string {
  const limpo = nome?.trim();
  return limpo ? limpo.substring(0, 2).toUpperCase() : '?';
}
