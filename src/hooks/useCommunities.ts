import { useState, useEffect, useCallback } from 'react';
import { Community } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import { normalizeCommunities } from '../logic/migrations';

export function useCommunities() {
  const [communities, setCommunities] = useState<Community[]>(() => 
    normalizeCommunities(loadFromStorage<Community[]>(STORAGE_KEYS.communities, []))
  );

  const [editingCommunity, setEditingCommunity] = useState<Community | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.communities, communities);
  }, [communities]);

  const handleSaveCommunity = useCallback(() => {
    if (!editingCommunity) return false;

    const errors: Record<string, string> = {};
    if (!editingCommunity.name.trim()) {
      errors.name = 'O nome da comunidade é obrigatório.';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return false;
    }

    const exists = communities.some(c => c.id === editingCommunity.id);
    const updated = exists
      ? communities.map(c => 
          c.id === editingCommunity.id 
            ? { ...editingCommunity, updatedAt: new Date().toISOString() } 
            : c
        )
      : [...communities, editingCommunity];

    setCommunities(updated);
    setEditingCommunity(null);
    setValidationErrors({});
    return true;
  }, [editingCommunity, communities]);

  const handleDeleteCommunity = useCallback((onCascadeDelete?: (communityId: string) => void) => {
    if (!editingCommunity) return;

    const updated = communities.filter(c => c.id !== editingCommunity.id);
    setCommunities(updated);

    // Run cascade delete to clean up references in player models
    if (onCascadeDelete) {
      onCascadeDelete(editingCommunity.id);
    }

    setEditingCommunity(null);
    setShowDeleteConfirm(false);
  }, [editingCommunity, communities]);

  const handleEditCommunity = useCallback((community: Community) => {
    setEditingCommunity({ ...community });
    setValidationErrors({});
    setShowDeleteConfirm(false);
  }, []);

  const handleAddCommunity = useCallback(() => {
    const newCommunity: Community = {
      id: `community-${Date.now()}`,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setEditingCommunity(newCommunity);
    setValidationErrors({});
    setShowDeleteConfirm(false);
  }, []);

  const updateCommunity = useCallback((communityId: string, patch: Partial<Community>) => {
    setCommunities(prev => prev.map(community => community.id === communityId
      ? { ...community, ...patch, updatedAt: new Date().toISOString() }
      : community
    ));
  }, []);

  const addCommunity = useCallback((input: Partial<Community>) => {
    const now = new Date().toISOString();
    const community: Community = {
      id: input.id || `community-${Date.now()}`,
      name: input.name || 'Nova comunidade',
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
    };
    setCommunities(prev => [...prev, community]);
    return community;
  }, []);

  const duplicateCommunity = useCallback((communityId: string, includeAthletes: boolean) => {
    const source = communities.find(community => community.id === communityId);
    if (!source) return null;
    const now = new Date().toISOString();
    const duplicate: Community = {
      ...source,
      id: `community-${Date.now()}`,
      name: `${source.name} (copia)`,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    setCommunities(prev => [...prev, duplicate]);
    return { duplicate, includeAthletes };
  }, [communities]);

  return {
    communities,
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
    duplicateCommunity
  };
}
