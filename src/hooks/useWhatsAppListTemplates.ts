import { useCallback, useEffect, useMemo, useState } from 'react';
import { WhatsAppListDraft, WhatsAppListTemplate } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';

export function useWhatsAppListTemplates() {
  const [templates, setTemplates] = useState<WhatsAppListTemplate[]>(() =>
    loadFromStorage<WhatsAppListTemplate[]>(STORAGE_KEYS.whatsAppListTemplates, [])
  );
  const [drafts, setDrafts] = useState<WhatsAppListDraft[]>(() =>
    loadFromStorage<WhatsAppListDraft[]>(STORAGE_KEYS.whatsAppListDrafts, [])
  );

  useEffect(() => saveToStorage(STORAGE_KEYS.whatsAppListTemplates, templates), [templates]);
  useEffect(() => saveToStorage(STORAGE_KEYS.whatsAppListDrafts, drafts), [drafts]);

  const saveTemplate = useCallback((template: WhatsAppListTemplate) => {
    setTemplates(prev => prev.some(item => item.id === template.id)
      ? prev.map(item => item.id === template.id ? { ...template, updatedAt: new Date().toISOString() } : item)
      : [...prev, template]
    );
  }, []);

  const saveDraft = useCallback((draft: WhatsAppListDraft) => {
    setDrafts(prev => prev.some(item => item.id === draft.id)
      ? prev.map(item => item.id === draft.id ? { ...draft, updatedAt: new Date().toISOString() } : item)
      : [...prev, draft]
    );
  }, []);

  const getCommunityTemplates = useCallback((communityId: string) => {
    return templates.filter(template => template.communityId === communityId);
  }, [templates]);

  const getLatestDraft = useCallback((communityId: string) => {
    return drafts
      .filter(draft => draft.communityId === communityId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  }, [drafts]);

  return useMemo(() => ({
    templates,
    drafts,
    setTemplates,
    setDrafts,
    saveTemplate,
    saveDraft,
    getCommunityTemplates,
    getLatestDraft,
  }), [templates, drafts, saveTemplate, saveDraft, getCommunityTemplates, getLatestDraft]);
}
