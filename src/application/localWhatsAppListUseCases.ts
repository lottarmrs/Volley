import type { WhatsAppListDraft, WhatsAppListTemplate } from '../types';

export function saveLocalWhatsAppListTemplate(input: {
  templates: WhatsAppListTemplate[];
  template: WhatsAppListTemplate;
  now: string;
}): WhatsAppListTemplate[] {
  const exists = input.templates.some((item) => item.id === input.template.id);
  const saved: WhatsAppListTemplate = exists
    ? { ...input.template, syncStatus: 'pending', updatedAt: input.now }
    : { ...input.template, syncStatus: 'local', createdAt: input.now, updatedAt: input.now };

  if (!exists) return [...input.templates, saved];

  return input.templates.map((item) => (item.id === input.template.id ? saved : item));
}

export function saveLocalWhatsAppListDraft(input: {
  drafts: WhatsAppListDraft[];
  draft: WhatsAppListDraft;
  now: string;
}): WhatsAppListDraft[] {
  const exists = input.drafts.some((item) => item.id === input.draft.id);
  if (!exists) return [...input.drafts, input.draft];

  return input.drafts.map((item) =>
    item.id === input.draft.id ? { ...input.draft, updatedAt: input.now } : item,
  );
}

export function selectVisibleWhatsAppListTemplates(
  templates: WhatsAppListTemplate[],
): WhatsAppListTemplate[] {
  return templates.filter((template) => !template.deletedAt);
}

export function selectCommunityWhatsAppListTemplates(input: {
  templates: WhatsAppListTemplate[];
  communityId: string;
}): WhatsAppListTemplate[] {
  return input.templates.filter(
    (template) => template.communityId === input.communityId && !template.deletedAt,
  );
}

export function selectLatestWhatsAppListDraft(input: {
  drafts: WhatsAppListDraft[];
  communityId: string;
}): WhatsAppListDraft | undefined {
  return input.drafts
    .filter((draft) => draft.communityId === input.communityId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
}
