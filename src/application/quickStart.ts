import type { Attributes, Gender, Player } from '@shared/types/player';
import { buildDefaultCommunityPlayer } from './localPlayerUseCases';

export type QuickStartLevel = 'iniciante' | 'bom' | 'forte' | number;

export interface QuickStartEntry {
  name: string;
  level: QuickStartLevel;
  genero: Gender;
}

export const QUICK_START_MIN_PLAYERS = 4;

export const QUICK_START_LEVEL_BASE: Record<string, number> = {
  iniciante: 3,
  bom: 5,
  forte: 7,
};

export function levelToNumericStars(level: QuickStartLevel): number {
  if (typeof level === 'number') return Math.min(5, Math.max(0.5, level));
  if (level === 'iniciante') return 1.5;
  if (level === 'forte') return 4.5;
  return 3;
}

const LIST_MARKER = /^\s*(?:\d+\s*[-.)\]]|[-*•–—>])\s*/;

function normalizeForComparison(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function parseRosterInput(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/[\n;,]/)) {
    const name = rawLine.replace(LIST_MARKER, '').replace(/\s+/g, ' ').trim();
    if (!name) continue;

    const key = normalizeForComparison(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export function buildLevelAttributes(level: QuickStartLevel): Attributes {
  let base: number;

  if (typeof level === 'number') {
    base = Math.min(10, Math.max(1, Math.round(level * 2)));
  } else {
    base = QUICK_START_LEVEL_BASE[level] ?? 5;
  }

  return {
    saque: base,
    recepcao: base,
    levantamento: base,
    ataque: base,
    bloqueio: base,
    defesa: base,
    velocidade: base,
    resistencia: base,
    leituraDeJogo: base,
    regularidade: base,
    controleEmocional: base,
  };
}

export function buildQuickStartPlayers(input: {
  entries: QuickStartEntry[];
  communityId: string;
  now: string;
  createId: () => string;
}): Player[] {
  return input.entries
    .filter((entry) => entry.name.trim().length > 0)
    .map((entry) => ({
      ...buildDefaultCommunityPlayer({
        id: input.createId(),
        name: entry.name,
        communityId: input.communityId,
        now: input.now,
      }),
      genero: entry.genero,
      atributos: buildLevelAttributes(entry.level),
      syncStatus: 'local' as const,
      updatedAt: input.now,
    }));
}

export function describeRosterReadiness(count: number): {
  ready: boolean;
  message: string;
} {
  if (count === 0) {
    return { ready: false, message: 'Cole ou digite a lista de quem vai jogar.' };
  }
  if (count < QUICK_START_MIN_PLAYERS) {
    const faltam = QUICK_START_MIN_PLAYERS - count;
    return {
      ready: false,
      message:
        faltam === 1
          ? 'Falta 1 atleta para dividir dois times.'
          : `Faltam ${faltam} atletas para dividir dois times.`,
    };
  }
  return { ready: true, message: `${count} atletas prontos para o sorteio.` };
}
