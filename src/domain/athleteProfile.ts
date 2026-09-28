import type { Attributes, Gender, Player, Position } from '../types';

export const ATHLETE_POSITIONS: Position[] = [
  'levantador',
  'oposto',
  'ponteiro',
  'central',
  'libero',
  'all-rounder',
];

export interface AthleteProfileDraft {
  genero: Gender | null;
  posicaoPrincipal: Position | null;
  alturaCm: number | null;
  maoDominante: 'direita' | 'esquerda' | null;
  apelido: string;
  posicoesSecundarias: Position[];
  lesionado?: boolean;
  limitacaoFisica?: string | null;
}

export function validateAthleteProfile(draft: AthleteProfileDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.genero !== 'M' && draft.genero !== 'F') errors.genero = 'Escolha o gênero.';
  if (!draft.posicaoPrincipal || !ATHLETE_POSITIONS.includes(draft.posicaoPrincipal))
    errors.posicaoPrincipal = 'Escolha a posição principal.';
  if (draft.alturaCm === null || !Number.isFinite(draft.alturaCm))
    errors.alturaCm = 'Informe a altura em centímetros.';
  else if (draft.alturaCm < 120 || draft.alturaCm > 230)
    errors.alturaCm = 'A altura precisa estar entre 120 e 230 cm.';
  if (draft.maoDominante !== 'direita' && draft.maoDominante !== 'esquerda')
    errors.maoDominante = 'Escolha a mão dominante.';
  const secundarias = draft.posicoesSecundarias;
  if (
    secundarias.some((p) => !ATHLETE_POSITIONS.includes(p)) ||
    new Set(secundarias).size !== secundarias.length ||
    (draft.posicaoPrincipal !== null && secundarias.includes(draft.posicaoPrincipal))
  )
    errors.posicoesSecundarias = 'As posições secundárias não podem repetir a principal.';
  return errors;
}

export function draftFromPlayer(player: Player): AthleteProfileDraft {
  return {
    genero: player.genero ?? null,
    posicaoPrincipal: player.posicaoPrincipal ?? null,
    alturaCm: player.alturaCm ?? null,
    maoDominante: player.maoDominante ?? null,
    apelido: player.apelido && player.apelido !== player.nome ? player.apelido : '',
    posicoesSecundarias: player.posicoesSecundarias ?? [],
    lesionado: player.status?.lesionado ?? false,
    limitacaoFisica: player.status?.limitacaoFisica ?? null,
  };
}

export function levelFromAttributes(atributos: Attributes): 1 | 2 | 3 | 4 | 5 {
  const valores = Object.values(atributos).filter(
    (v) => typeof v === 'number' && Number.isFinite(v),
  );
  const media = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 5;
  return Math.min(5, Math.max(1, Math.round(media / 2))) as 1 | 2 | 3 | 4 | 5;
}
