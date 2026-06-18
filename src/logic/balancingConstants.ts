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

// ── Motor de consistência (gamificação de facilitadores) ────────────────────
// Progressão de atributos por TAXA de erro para papéis cujo valor está em ações
// não-terminais (levantamento/recepção/defesa). Ver discussão em
// memory/multi-evaluation-attributes-design. Tudo afinável aqui.
export const CONSISTENCY = {
  /** Exposição mínima (toques estimados no jogo) para gerar sinal. Abaixo: ignora. */
  eMin: 6,
  /** Exposição em que a confiança chega a 1.0 (escala linear a partir de eMin). */
  eFull: 20,
  /** Taxa de sucesso "esperada" por atributo: erra menos que isso ⇒ ganho. */
  baseline: {
    levantamento: 0.88,
    recepcao: 0.8,
    defesa: 0.75,
  } as Record<string, number>,
  /** Escala do delta por jogo. */
  k: 1.0,
  /** Teto suave: consistência sozinha não passa daqui (feito explícito ainda fura). */
  ceiling: 8.5,
  /** Limite absoluto do delta acumulado por sessão, por atributo. */
  sessionCap: 0.5,
} as const;
