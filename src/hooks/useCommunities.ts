import { useState, useEffect, useCallback } from 'react';
import { Community } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import { normalizeCommunities } from '../logic/migrations';
import { generateUUID } from '../logic/uuid';
import {
  applyLocalCommunityDeletion,
  applyLocalCommunityUpdate,
  createLocalCommunity,
  duplicateLocalCommunity,
  validateLocalCommunitySave,
} from '../application/localCommunityUseCases';
import { fetchMyCommunities } from '../application/communityDataQueries';
import { queryKeys } from '../application/queryKeys';
import { communityCloudService } from '../infra/supabase/communityCloudService';
import { useOnlineAccount, useOnlineList } from './useOnlineList';

function upsertInList(list: Community[], community: Community): Community[] {
  return list.some((item) => item.id === community.id)
    ? list.map((item) => (item.id === community.id ? community : item))
    : [...list, community];
}

export function useCommunities() {
  const { online, userId, settled } = useOnlineAccount();
  const [localCommunities, setLocalCommunities] = useState<Community[]>(() =>
    normalizeCommunities(loadFromStorage<Community[]>(STORAGE_KEYS.communities, [])),
  );
  const remote = useOnlineList<Community>({
    enabled: online,
    queryKey: queryKeys.comunidades(userId ?? ''),
    fetch: fetchMyCommunities,
  });
  const communities = online ? remote.data : localCommunities;

  const [editingCommunity, setEditingCommunity] = useState<Community | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (settled && !online) saveToStorage(STORAGE_KEYS.communities, localCommunities);
  }, [localCommunities, online, settled]);

  const persistCommunity = useCallback(
    (community: Community) => {
      if (!online || !userId) {
        setLocalCommunities((prev) => upsertInList(prev, community));
        return;
      }
      void remote.write(
        (list) => upsertInList(list, community),
        () => communityCloudService.upsert(community, community.cloudOwnerId ?? userId),
      );
    },
    [online, remote, userId],
  );

  const deleteCommunity = useCallback(
    async (communityId: string): Promise<boolean> => {
      if (!online) {
        setLocalCommunities((prev) =>
          applyLocalCommunityDeletion({
            communities: prev,
            communityId,
            now: new Date().toISOString(),
          }),
        );
        return true;
      }
      const community = communities.find((item) => item.id === communityId);
      if (!community?.cloudId) return false;
      const done = await remote.write(
        (list) => list.filter((item) => item.id !== communityId),
        async () => {
          await communityCloudService.softDelete(community.cloudId!);
          return true;
        },
      );
      return done === true;
    },
    [communities, online, remote],
  );

  const handleSaveCommunity = useCallback(
    (allowed = true) => {
      if (!allowed) {
        throw new Error('PERMISSION_DENIED');
      }
      if (!editingCommunity) return false;

      const errors = validateLocalCommunitySave({ communities, community: editingCommunity });

      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return false;
      }

      persistCommunity({
        ...editingCommunity,
        syncStatus: online ? editingCommunity.syncStatus : 'pending',
        updatedAt: new Date().toISOString(),
      });
      setEditingCommunity(null);
      setValidationErrors({});
      return true;
    },
    [editingCommunity, communities, online, persistCommunity],
  );

  const handleDeleteCommunity = useCallback(
    (onCascadeDelete?: (communityId: string) => void, allowed = true) => {
      if (!allowed) {
        throw new Error('PERMISSION_DENIED');
      }
      if (!editingCommunity) return;

      void deleteCommunity(editingCommunity.id);

      if (onCascadeDelete) {
        onCascadeDelete(editingCommunity.id);
      }

      setEditingCommunity(null);
      setShowDeleteConfirm(false);
    },
    [editingCommunity, deleteCommunity],
  );

  const handleEditCommunity = useCallback((community: Community) => {
    setEditingCommunity({ ...community });
    setValidationErrors({});
    setShowDeleteConfirm(false);
  }, []);

  const handleAddCommunity = useCallback(() => {
    const now = new Date().toISOString();
    const newCommunity: Community = {
      id: generateUUID(),
      name: '',
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
      syncStatus: 'local',
    };
    setEditingCommunity(newCommunity);
    setValidationErrors({});
    setShowDeleteConfirm(false);
  }, []);

  const updateCommunity = useCallback(
    (communityId: string, patch: Partial<Community>, allowed = true) => {
      if (!allowed) {
        throw new Error('PERMISSION_DENIED');
      }
      const result = applyLocalCommunityUpdate({
        communities,
        communityId,
        patch,
        now: new Date().toISOString(),
      });
      if ('communities' in result) {
        const updated = result.communities.find((community) => community.id === communityId);
        if (online && updated) persistCommunity(updated);
        if (!online) setLocalCommunities(result.communities);
        setValidationErrors({});
        return true;
      }
      setValidationErrors(result.errors);
      return false;
    },
    [communities, online, persistCommunity],
  );

  const addCommunity = useCallback(
    (input: Partial<Community>) => {
      const community = createLocalCommunity({
        communities,
        input,
        id: generateUUID(),
        now: new Date().toISOString(),
      });
      persistCommunity(community);
      return community;
    },
    [communities, persistCommunity],
  );

  const duplicateCommunity = useCallback(
    (communityId: string) => {
      const result = duplicateLocalCommunity({
        communities,
        communityId,
        id: generateUUID(),
        now: new Date().toISOString(),
      });
      if (!result) return null;
      const duplicate: Community = online
        ? { ...result.duplicate, cloudOwnerId: undefined, joinCode: null }
        : result.duplicate;
      persistCommunity(duplicate);
      return { duplicate };
    },
    [communities, online, persistCommunity],
  );

  return {
    communities: communities.filter((c) => !c.deletedAt),
    rawCommunities: communities,
    replaceLocalCommunities: setLocalCommunities,
    online,
    status: remote.status,
    refresh: remote.refresh,
    editingCommunity,
    setEditingCommunity,
    validationErrors,
    setValidationErrors,
    showDeleteConfirm,
    setShowDeleteConfirm,
    handleSaveCommunity,
    handleDeleteCommunity,
    handleEditCommunity,
    handleAddCommunity,
    updateCommunity,
    addCommunity,
    duplicateCommunity,
    deleteCommunity,
  };
}
