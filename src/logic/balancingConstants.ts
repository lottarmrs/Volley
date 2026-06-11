// Fator de normalização: overall (0–100) → mesma faixa dos fundamentos (0–10)
export const OVERALL_SCALE = 10;

export const PENALTIES = {
  forbiddenPair: 10000,
  togetherPair: 10000,
  lockedAssignment: 10000,
  teamSizeDiff: 2000,
  setterSlot: 8000,
  setterMissing: 15000,
  compositionSlot: 8000, // Fase B
  duplicateSolution: 5000,
} as const;

export const THRESHOLDS = {
  strongAttacker: 7.0, // será tornado relativo na Fase C
  setter: 7.0,
  defensiveRef: 7.0,
} as const;

// Limiares de qualidade na escala normalizada (score total cai ~10× após a normalização).
export const QUALITY = { excellent: 1.5, good: 3.0, acceptable: 6.0 } as const;
