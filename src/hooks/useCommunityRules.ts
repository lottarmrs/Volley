import { useCallback, useEffect, useMemo, useState } from 'react';
import { Community, CommunityRules } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';

export function createDefaultCommunityRules(community: Community): CommunityRules {
  return {
    communityId: community.id,
    defaultFormat: community.defaultFormat || 'free_play',
    defaultLocation: community.defaultLocation || '',
    defaultDay: community.defaultDay || '',
    defaultStartTime: community.defaultStartTime || '',
    defaultEndTime: community.defaultEndTime || '',
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
      standingsRules: ['classificationPoints', 'wins', 'pointDifference', 'pointsFor', 'headToHead', 'pointsAgainst'],
    },
    updatedAt: new Date().toISOString(),
  };
}

export function useCommunityRules() {
  const [rules, setRules] = useState<CommunityRules[]>(() =>
    loadFromStorage<CommunityRules[]>(STORAGE_KEYS.communityRules, [])
  );

  useEffect(() => saveToStorage(STORAGE_KEYS.communityRules, rules), [rules]);

  const getRules = useCallback((community: Community) => {
    return rules.find(rule => rule.communityId === community.id) || createDefaultCommunityRules(community);
  }, [rules]);

  const saveRules = useCallback((next: CommunityRules) => {
    const now = new Date().toISOString();
    setRules(prev => prev.some(rule => rule.communityId === next.communityId)
      ? prev.map(rule => rule.communityId === next.communityId ? { ...next, syncStatus: 'pending', updatedAt: now } : rule)
      : [...prev, { ...next, syncStatus: 'local', updatedAt: now }]
    );
  }, []);

  const removeRules = useCallback((communityId: string) => {
    setRules(prev => prev.filter(rule => rule.communityId !== communityId));
  }, []);

  return useMemo(() => ({ 
    rules: rules.filter(r => !r.deletedAt), 
    rawRules: rules, // Expose full list for syncService
    setRules, 
    getRules, 
    saveRules, 
    removeRules 
  }), [rules, getRules, saveRules, removeRules]);
}
