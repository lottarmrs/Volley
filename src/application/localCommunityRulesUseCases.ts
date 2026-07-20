import type { Community, CommunityRules } from '../types';

export function createDefaultLocalCommunityRules(input: {
  community: Community;
  now: string;
}): CommunityRules {
  return {
    communityId: input.community.id,
    defaultFormat: input.community.defaultFormat || 'free_play',
    defaultLocation: input.community.defaultLocation || '',
    defaultDay: input.community.defaultDay || '',
    defaultStartTime: input.community.defaultStartTime || '',
    defaultEndTime: input.community.defaultEndTime || '',
    freePlay: {
      type: 'free_play',
      teamCount: 3,
      maxPoints: 15,
      tieBreakMethod: 'win_by_2',
      rotationSystem: 'winner_stays',
      queuePolicy: 'fifo',
    },
    tournament: {
      type: 'tournament',
      format: 'round_robin',
      teamCount: 3,
      useGroupStage: false,
      roundTrip: false,
      maxPoints: 15,
      tieBreakMethod: 'direct_3',
      victoryRule: 'direct_3',
      hasFinal: false,
      hasThirdPlaceMatch: false,
      classificationPoints: { win: 3, loss: 0 },
      standingsRules: [
        'classificationPoints',
        'wins',
        'pointDifference',
        'pointsFor',
        'headToHead',
        'pointsAgainst',
      ],
    },
    updatedAt: input.now,
  };
}

export function saveLocalCommunityRules(input: {
  rules: CommunityRules[];
  next: CommunityRules;
  allowed: boolean;
  now: string;
}): CommunityRules[] {
  if (!input.allowed) {
    throw new Error('PERMISSION_DENIED');
  }

  const exists = input.rules.some((rule) => rule.communityId === input.next.communityId);
  const saved = {
    ...input.next,
    syncStatus: exists ? ('pending' as const) : ('local' as const),
    updatedAt: input.now,
  };

  if (!exists) return [...input.rules, saved];

  return input.rules.map((rule) => (rule.communityId === input.next.communityId ? saved : rule));
}

export function removeLocalCommunityRules(input: {
  rules: CommunityRules[];
  communityId: string;
}): CommunityRules[] {
  return input.rules.filter((rule) => rule.communityId !== input.communityId);
}

export function selectVisibleCommunityRules(rules: CommunityRules[]): CommunityRules[] {
  return rules.filter((rule) => !rule.deletedAt);
}
