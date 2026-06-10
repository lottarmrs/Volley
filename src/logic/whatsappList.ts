import { WhatsAppListDraft, WhatsAppListSlot, WhatsAppListTemplate } from '../types';

function formatDate(date: string) {
  const value = new Date(`${date}T12:00:00`);
  const weekday = value.toLocaleDateString('pt-BR', { weekday: 'long' }).toUpperCase();
  const day = value.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${weekday} (${day})`;
}

function formatTimeRange(draft: WhatsAppListDraft) {
  if (!draft.startTime && !draft.endTime) return '';
  if (draft.startTime && draft.endTime)
    return `${draft.startTime} AS ${draft.endTime}`.toUpperCase();
  return (draft.startTime || draft.endTime || '').toUpperCase();
}

function formatMoney(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  return `${value}$`;
}

function formatSlot(slot: WhatsAppListSlot) {
  const name = slot.displayName || '';
  const paid = slot.paid ? ' pago' : '';
  const note = slot.note ? ` - ${slot.note}` : '';
  return `${slot.index} - ${name}${paid}${note}`.trimEnd();
}

function createSlots(count: number): WhatsAppListSlot[] {
  return Array.from({ length: count }, (_, index) => ({ index: index + 1 }));
}

export function createDraftFromTemplate(
  template: WhatsAppListTemplate,
  date: string,
): WhatsAppListDraft {
  const now = new Date().toISOString();
  return {
    id: `wa-list-${Date.now()}`,
    communityId: template.communityId,
    templateId: template.id,
    title: template.title,
    date,
    location: template.defaultLocation,
    startTime: template.defaultStartTime,
    endTime: template.defaultEndTime,
    value: template.defaultValue,
    pixKey: template.pixKey,
    pixHolder: template.pixHolder,
    pixBank: template.pixBank,
    paymentDeadline: template.paymentDeadline,
    paymentNote: template.paymentNote,
    setters: createSlots(template.settersCount),
    mainSlots: createSlots(template.mainSlotsCount),
    reserveSlots: createSlots(template.reserveSlotsCount),
    settersSectionTitle: template.settersSectionTitle,
    reserveSectionTitle: template.reserveSectionTitle,
    showLockIcon: template.showLockIcon,
    paymentSymbol: template.paymentSymbol,
    extraText: template.extraText,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultTemplate(
  communityId: string,
  communityName: string,
): WhatsAppListTemplate {
  const now = new Date().toISOString();
  return {
    id: `wa-template-${Date.now()}`,
    communityId,
    name: 'Lista padrao',
    title: communityName.toUpperCase(),
    defaultLocation: '',
    defaultStartTime: '',
    defaultEndTime: '',
    defaultValue: 15,
    pixKey: '',
    pixHolder: '',
    pixBank: '',
    paymentDeadline: '',
    paymentNote: 'SOMENTE VIA PIX',
    settersCount: 3,
    mainSlotsCount: 18,
    reserveSlotsCount: 4,
    settersSectionTitle: 'LEVANTADORES',
    reserveSectionTitle: 'CONVIDADOS/RESERVAS',
    showLockIcon: true,
    paymentSymbol: '$',
    extraText: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function formatWhatsAppHeader(draft: WhatsAppListDraft) {
  return [
    `*${draft.title}*`,
    `*DATA: ${formatDate(draft.date)}*`,
    draft.location ? `*LOCAL: ${draft.location.toUpperCase()}*` : '',
    formatTimeRange(draft) ? `*HORARIO: ${formatTimeRange(draft)}*` : '',
    formatMoney(draft.value) ? `*VALOR: ${formatMoney(draft.value)}*` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatPaymentInfo(draft: WhatsAppListDraft) {
  const keyLine = draft.pixKey
    ? `CHAVE: ${draft.pixKey}${draft.pixHolder ? ` - ( ${draft.pixHolder}${draft.pixBank ? ` - ${draft.pixBank}` : ''} )` : ''}`
    : '';
  const deadline = draft.paymentDeadline
    ? `_PRAZO PARA PAGAMENTO ATE ${draft.paymentDeadline}_`
    : '';
  const note = draft.paymentNote ? `*(${draft.paymentNote})*` : '';
  return [keyLine, deadline && note ? `${deadline} ${note}` : deadline || note]
    .filter(Boolean)
    .join('\n\n');
}

export function formatSettersSection(draft: WhatsAppListDraft) {
  const slots = draft.setters.map(formatSlot).join('\n');
  return [`_${draft.settersSectionTitle || 'LEVANTADORES'}_`, slots].filter(Boolean).join('\n');
}

export function formatMainListSection(draft: WhatsAppListDraft) {
  const lock = draft.showLockIcon ? '🔒\n' : '';
  return `${lock}${draft.mainSlots.map(formatSlot).join('\n')}`;
}

export function formatReserveSection(draft: WhatsAppListDraft) {
  return [
    `*${draft.reserveSectionTitle || 'CONVIDADOS/RESERVAS'}*`,
    draft.reserveSlots.map(formatSlot).join('\n'),
  ].join('\n');
}

export function formatShortCallMessage(draft: WhatsAppListDraft) {
  return [
    `${draft.title}`,
    `${formatDate(draft.date)}${draft.location ? ` - ${draft.location}` : ''}`,
    formatTimeRange(draft) ? `Horario: ${formatTimeRange(draft)}` : '',
    `Vagas: ${draft.mainSlots.length}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatPaymentReminder(draft: WhatsAppListDraft) {
  return [
    `Lembrete de pagamento - ${draft.title}`,
    draft.paymentDeadline ? `Prazo: ${draft.paymentDeadline}` : '',
    draft.pixKey ? `Pix: ${draft.pixKey}` : '',
    draft.pixHolder ? `Responsavel: ${draft.pixHolder}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatOpenSlotsMessage(draft: WhatsAppListDraft) {
  const openMain = draft.mainSlots.filter((slot) => !slot.displayName).length;
  const openSetters = draft.setters.filter((slot) => !slot.displayName).length;
  const openReserve = draft.reserveSlots.filter((slot) => !slot.displayName).length;
  return [
    `Vagas abertas - ${draft.title}`,
    `Levantadores: ${openSetters}`,
    `Lista principal: ${openMain}`,
    `Reservas: ${openReserve}`,
  ].join('\n');
}

export function formatWhatsAppList(draft: WhatsAppListDraft) {
  return [
    formatWhatsAppHeader(draft),
    formatPaymentInfo(draft),
    formatSettersSection(draft),
    formatMainListSection(draft),
    formatReserveSection(draft),
    draft.extraText || '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
