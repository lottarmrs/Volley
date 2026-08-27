import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveLocalWhatsAppListDraft,
  saveLocalWhatsAppListTemplate,
  selectCommunityWhatsAppListTemplates,
  selectLatestWhatsAppListDraft,
  selectVisibleWhatsAppListTemplates,
} from './localWhatsAppListUseCases';
import type { WhatsAppListDraft, WhatsAppListTemplate } from '../types';

const now = '2026-07-20T12:00:00.000Z';
const earlier = '2026-07-19T12:00:00.000Z';

function template(input: Partial<WhatsAppListTemplate> = {}): WhatsAppListTemplate {
  return {
    id: input.id ?? 'template-1',
    communityId: input.communityId ?? 'community-1',
    name: input.name ?? 'Lista padrao',
    title: input.title ?? 'Domingo',
    settersCount: input.settersCount ?? 1,
    mainSlotsCount: input.mainSlotsCount ?? 12,
    reserveSlotsCount: input.reserveSlotsCount ?? 4,
    settersSectionTitle: input.settersSectionTitle ?? 'Levantadores',
    reserveSectionTitle: input.reserveSectionTitle ?? 'Reserva',
    showLockIcon: input.showLockIcon ?? true,
    paymentSymbol: input.paymentSymbol ?? 'R$',
    createdAt: input.createdAt ?? earlier,
    updatedAt: input.updatedAt ?? earlier,
    ...input,
  };
}

function draft(input: Partial<WhatsAppListDraft> = {}): WhatsAppListDraft {
  return {
    id: input.id ?? 'draft-1',
    communityId: input.communityId ?? 'community-1',
    title: input.title ?? 'Lista do domingo',
    date: input.date ?? '2026-07-20',
    setters: input.setters ?? [],
    mainSlots: input.mainSlots ?? [],
    reserveSlots: input.reserveSlots ?? [],
    settersSectionTitle: input.settersSectionTitle ?? 'Levantadores',
    reserveSectionTitle: input.reserveSectionTitle ?? 'Reserva',
    showLockIcon: input.showLockIcon ?? true,
    paymentSymbol: input.paymentSymbol ?? 'R$',
    createdAt: input.createdAt ?? earlier,
    updatedAt: input.updatedAt ?? earlier,
    ...input,
  };
}

test('saveLocalWhatsAppListTemplate updates existing templates as pending', () => {
  const result = saveLocalWhatsAppListTemplate({
    templates: [template({ name: 'Antiga' })],
    template: template({ name: 'Nova' }),
    now,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Nova');
  assert.equal(result[0].syncStatus, 'pending');
  assert.equal(result[0].createdAt, earlier);
  assert.equal(result[0].updatedAt, now);
});

test('saveLocalWhatsAppListTemplate appends new templates as local', () => {
  const result = saveLocalWhatsAppListTemplate({
    templates: [],
    template: template({ createdAt: 'stale', updatedAt: 'stale' }),
    now,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].syncStatus, 'local');
  assert.equal(result[0].createdAt, now);
  assert.equal(result[0].updatedAt, now);
});

test('saveLocalWhatsAppListDraft updates existing drafts timestamp and appends new drafts unchanged', () => {
  const updated = saveLocalWhatsAppListDraft({
    drafts: [draft({ title: 'Antiga' })],
    draft: draft({ title: 'Nova' }),
    now,
  });
  const appended = saveLocalWhatsAppListDraft({
    drafts: updated,
    draft: draft({ id: 'draft-2', title: 'Outra' }),
    now,
  });

  assert.equal(updated[0].title, 'Nova');
  assert.equal(updated[0].updatedAt, now);
  assert.equal(appended.length, 2);
  assert.equal(appended[1].title, 'Outra');
  assert.equal(appended[1].updatedAt, earlier);
});

test('selectors return visible templates and latest draft by community', () => {
  const templates = [
    template({ id: 'deleted', deletedAt: now }),
    template({ id: 'other', communityId: 'community-2' }),
    template({ id: 'visible' }),
  ];
  const drafts = [
    draft({ id: 'older', updatedAt: earlier }),
    draft({ id: 'other', communityId: 'community-2', updatedAt: '2026-07-21T12:00:00.000Z' }),
    draft({ id: 'latest', updatedAt: now }),
  ];

  assert.deepEqual(
    selectVisibleWhatsAppListTemplates(templates).map((item) => item.id),
    ['other', 'visible'],
  );
  assert.deepEqual(
    selectCommunityWhatsAppListTemplates({ templates, communityId: 'community-1' }).map(
      (item) => item.id,
    ),
    ['visible'],
  );
  assert.equal(selectLatestWhatsAppListDraft({ drafts, communityId: 'community-1' })?.id, 'latest');
});
