import { useState, useEffect, useCallback } from 'react';
import { Community } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import { normalizeCommunities } from '../logic/migrations';
import { generateUUID } from '../logic/uuid';
import {
  applyLocalCommunityDeletion,
  validateLocalCommunitySave,
} from '../application/localCommunityUseCases';

function normalizeCommunityName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function uniqueCommunityName(baseName: string, communities: Community[]): string {
  const base = baseName.trim() || 'Nova comunidade';
  const existingNames = new Set(
    communities
      .filter((community) => !community.deletedAt && !community.archived)
      .map((community) => normalizeCommunityName(community.name)),
  );

  let candidate = base;
  let suffix = 2;
  while (existingNames.has(normalizeCommunityName(candidate))) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  return candidate;
}

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
      const current = communities.find((community) => community.id === communityId);
      const nextName = patch.name ?? current?.name;
      const duplicate = nextName
        ? communities.find(
            (community) =>
              community.id !== communityId &&
              !community.deletedAt &&
              !community.archived &&
              normalizeCommunityName(community.name) === normalizeCommunityName(nextName),
          )
        : undefined;
      if (duplicate) {
        setValidationErrors({
          name: `Ja existe uma comunidade com esse nome: ${duplicate.name}.`,
        });
        return false;
      }
      setCommunities((prev) =>
        prev.map((community) =>
          community.id === communityId
            ? { ...community, ...patch, syncStatus: 'pending', updatedAt: new Date().toISOString() }
            : community,
        ),
      );
      setValidationErrors({});
      return true;
    },
    [communities],
  );

  const addCommunity = useCallback(
    (input: Partial<Community>) => {
      const now = new Date().toISOString();
      const community: Community = {
        id: input.id || generateUUID(),
        name: uniqueCommunityName(input.name || 'Nova comunidade', communities),
        description: input.description || '',
        defaultLocation: input.defaultLocation || '',
        defaultDay: input.defaultDay || '',
        defaultStartTime: input.defaultStartTime || '',
        defaultEndTime: input.defaultEndTime || '',
        defaultFormat: input.defaultFormat || 'free_play',
        color: input.color || 'primary',
        icon: input.icon || 'volleyball',
        archived: Boolean(input.archived),
        createdAt: input.createdAt || now,
        updatedAt: now,
        syncStatus: 'local',
      };
      setCommunities((prev) => [...prev, community]);
      return community;
    },
    [communities],
  );

  const duplicateCommunity = useCallback(
    (communityId: string, includeAthletes: boolean) => {
      const source = communities.find((community) => community.id === communityId);
      if (!source) return null;
      const now = new Date().toISOString();
      const duplicate: Community = {
        ...source,
        id: generateUUID(),
        name: uniqueCommunityName(`${source.name} (copia)`, communities),
        archived: false,
        createdAt: now,
        updatedAt: now,
        cloudId: undefined, // Clear cloud ID for duplicated community
        syncStatus: 'local',
      };
      setCommunities((prev) => [...prev, duplicate]);
      return { duplicate, includeAthletes };
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
