import { useCallback, useEffect, useMemo, useState } from 'react';
import { WhatsAppListDraft, WhatsAppListTemplate } from '../types';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import {
  saveLocalWhatsAppListDraft,
  saveLocalWhatsAppListTemplate,
  selectCommunityWhatsAppListTemplates,
  selectLatestWhatsAppListDraft,
  selectVisibleWhatsAppListTemplates,
} from '../application/localWhatsAppListUseCases';

export function useWhatsAppListTemplates() {
  const [templates, setTemplates] = useState<WhatsAppListTemplate[]>(() =>
    loadFromStorage<WhatsAppListTemplate[]>(STORAGE_KEYS.whatsAppListTemplates, []),
  );
  const [drafts, setDrafts] = useState<WhatsAppListDraft[]>(() =>
    loadFromStorage<WhatsAppListDraft[]>(STORAGE_KEYS.whatsAppListDrafts, []),
  );

  useEffect(() => saveToStorage(STORAGE_KEYS.whatsAppListTemplates, templates), [templates]);
  useEffect(() => saveToStorage(STORAGE_KEYS.whatsAppListDrafts, drafts), [drafts]);

  const saveTemplate = useCallback((template: WhatsAppListTemplate) => {
    setTemplates((prev) =>
      saveLocalWhatsAppListTemplate({
        templates: prev,
        template,
        now: new Date().toISOString(),
      }),
    );
  }, []);

  const saveDraft = useCallback((draft: WhatsAppListDraft) => {
    setDrafts((prev) =>
      saveLocalWhatsAppListDraft({
        drafts: prev,
        draft,
        now: new Date().toISOString(),
      }),
    );
  }, []);

  const getCommunityTemplates = useCallback(
    (communityId: string) => {
      return selectCommunityWhatsAppListTemplates({ templates, communityId });
    },
    [templates],
  );

  const getLatestDraft = useCallback(
    (communityId: string) => {
      return selectLatestWhatsAppListDraft({ drafts, communityId });
    },
    [drafts],
  );

  return useMemo(
    () => ({
      templates: selectVisibleWhatsAppListTemplates(templates),
      rawTemplates: templates, // Expose full list for syncService
      drafts,
      setTemplates,
      setDrafts,
      saveTemplate,
      saveDraft,
      getCommunityTemplates,
      getLatestDraft,
    }),
    [templates, drafts, saveTemplate, saveDraft, getCommunityTemplates, getLatestDraft],
  );
}
