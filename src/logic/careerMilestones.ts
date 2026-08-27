/** Apresentacao dos marcos. Os LIMIARES vivem no SQL (regenerate_player_milestones),
 *  uma vez so — aqui ha apenas rotulo e emoji, para as duas listas nao divergirem. */
export const MILESTONE_PRESENTATION = {
  first_session: { label: 'Primeira sessão', emoji: '🎬' },
  first_win: { label: 'Primeira vitória', emoji: '🏆' },
  games_10: { label: '10 jogos', emoji: '🔟' },
  games_50: { label: '50 jogos', emoji: '⭐' },
  games_100: { label: '100 jogos', emoji: '💯' },
  points_100: { label: '100 pontos', emoji: '🎯' },
  points_500: { label: '500 pontos', emoji: '🔥' },
  points_1000: { label: '1000 pontos', emoji: '👑' },
  streak_3: { label: '3 sessões seguidas vencidas', emoji: '📈' },
  streak_5: { label: '5 sessões seguidas vencidas', emoji: '🚀' },
} as const;

export type MilestoneSlug = keyof typeof MILESTONE_PRESENTATION;

export function describeMilestone(slug: string): { label: string; emoji: string } {
  return MILESTONE_PRESENTATION[slug as MilestoneSlug] ?? { label: slug, emoji: '🏅' };
}
