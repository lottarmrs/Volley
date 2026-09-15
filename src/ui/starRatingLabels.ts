const RATING_LABELS: Record<number, string> = {
  0.5: 'Iniciante -',
  1: 'Iniciante / Recreativo',
  1.5: 'Em Evolução',
  2: 'Abaixo da Média',
  2.5: 'Regular -',
  3: 'Regular / Mediano',
  3.5: 'Bom / Competitivo',
  4: 'Avançado',
  4.5: 'Muito Bom +',
  5: 'Destaque / Nível Seleção',
};

export function getStarLabelText(value: number): string {
  if (value <= 0) return 'Não Avaliado';
  const rounded = Math.round(value * 2) / 2;
  return RATING_LABELS[rounded] ?? `${rounded} Estrelas`;
}
