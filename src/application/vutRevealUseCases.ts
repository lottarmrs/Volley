import type { Player } from '../types';
import { buildVutCard, type BuildVutCardContext, type VutCard } from '../logic/futCards';

export interface VutRevealItem {
  card: VutCard;
  reasons: string[];
}

export function buildVutRevealItemsFromCards(
  cardPairs: Array<{ before?: VutCard; after?: VutCard }>,
): VutRevealItem[] {
  const items: VutRevealItem[] = [];

  for (const { before, after } of cardPairs) {
    if (!before || !after) continue;

    const reasons: string[] = [];
    if (after.edition.kind !== 'base') {
      reasons.push(`${after.edition.emoji} EDIÇÃO ESPECIAL: ${after.edition.label.toUpperCase()}`);
    }

    const beforeUnlocked = new Set(
      before.achievements
        .filter((achievement) => achievement.unlocked)
        .map((achievement) => achievement.id),
    );
    const afterUnlocked = after.achievements.filter((achievement) => achievement.unlocked);

    for (const achievement of afterUnlocked) {
      if (!beforeUnlocked.has(achievement.id)) {
        reasons.push(`🏆 CONQUISTA: ${achievement.name.toUpperCase()} (${achievement.emoji})`);
      }
    }

    if (reasons.length > 0) items.push({ card: after, reasons });
  }

  return items;
}

export function buildVutRevealItems(input: {
  participants: Player[];
  updatedPlayers: Player[];
  beforeContext: BuildVutCardContext;
  afterContext: BuildVutCardContext;
}): VutRevealItem[] {
  const cardPairs = input.participants.map((player) => {
    const updatedPlayer =
      input.updatedPlayers.find((candidate) => candidate.id === player.id) || player;
    return {
      before: buildVutCard(player, input.beforeContext),
      after: buildVutCard(updatedPlayer, input.afterContext),
    };
  });

  return buildVutRevealItemsFromCards(cardPairs);
}
