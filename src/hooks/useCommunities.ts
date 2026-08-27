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

export function useCommunities() {
  const [communities, setCommunities] = useState<Community[]>(() =>
    normalizeCommunities(loadFromStorage<Community[]>(STORAGE_KEYS.communities, [])),
  );

  const [editingCommunity, setEditingCommunity] = useState<Community | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.communities, communities);
  }, [communities]);

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

      const now = new Date().toISOString();
      const savedCommunity: Community = {
        ...editingCommunity,
        syncStatus: 'pending',
        updatedAt: now,
      };

      const exists = communities.some((c) => c.id === savedCommunity.id);
      const updated = exists
        ? communities.map((c) => (c.id === savedCommunity.id ? savedCommunity : c))
        : [...communities, savedCommunity];

      setCommunities(updated);
      setEditingCommunity(null);
      setValidationErrors({});
      return true;
    },
    [editingCommunity, communities],
  );

  const handleDeleteCommunity = useCallback(
    (onCascadeDelete?: (communityId: string) => void, allowed = true) => {
      if (!allowed) {
        throw new Error('PERMISSION_DENIED');
      }
      if (!editingCommunity) return;

      const updated = applyLocalCommunityDeletion({
        communities,
        communityId: editingCommunity.id,
        now: new Date().toISOString(),
      });
      setCommunities(updated);

      // Run cascade delete to clean up references in player models
      if (onCascadeDelete) {
        onCascadeDelete(editingCommunity.id);
      }

      setEditingCommunity(null);
      setShowDeleteConfirm(false);
    },
    [editingCommunity, communities],
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
        setCommunities(result.communities);
        setValidationErrors({});
        return true;
      }
      setValidationErrors(result.errors);
      return false;
    },
    [communities],
  );

  const addCommunity = useCallback(
    (input: Partial<Community>) => {
      const now = new Date().toISOString();
      const community = createLocalCommunity({
        communities,
        input,
        id: generateUUID(),
        now,
      });
      setCommunities((prev) => [...prev, community]);
      return community;
    },
    [communities],
  );

  const duplicateCommunity = useCallback(
    (communityId: string, includeAthletes: boolean) => {
      const result = duplicateLocalCommunity({
        communities,
        communityId,
        includeAthletes,
        id: generateUUID(),
        now: new Date().toISOString(),
      });
      if (!result) return null;
      setCommunities((prev) => [...prev, result.duplicate]);
      return result;
    },
    [communities],
  );

  return {
    communities: communities.filter((c) => !c.deletedAt),
    rawCommunities: communities, // Expose full list with soft deletes for syncService
    setCommunities,
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
  };
}
