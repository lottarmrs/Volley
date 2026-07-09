import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import type { Community } from '../types';
import { useCommunities } from './useCommunities';

const now = '2026-01-01T12:00:00.000Z';

function community(id: string, name: string): Community {
  return {
    id,
    name,
    description: '',
    defaultLocation: '',
    defaultDay: '',
    defaultStartTime: '',
    defaultEndTime: '',
    defaultFormat: 'free_play',
    color: 'primary',
    icon: 'volleyball',
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe('useCommunities duplicate guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('blocks renaming an active community to an existing semantic name', () => {
    localStorage.setItem(
      STORAGE_KEYS.communities,
      JSON.stringify([
        community('community-1', 'Terca do Volei'),
        community('community-2', 'Livre'),
      ]),
    );

    const { result } = renderHook(() => useCommunities());

    let saved: boolean | undefined;
    act(() => {
      saved = result.current.updateCommunity('community-2', { name: ' Terça do Vôlei ' });
    });

    expect(saved).toBe(false);
    expect(result.current.communities.map((item) => item.name)).toEqual([
      'Terca do Volei',
      'Livre',
    ]);
    expect(result.current.validationErrors.name).toMatch(/j[aá] existe/i);
  });
});
