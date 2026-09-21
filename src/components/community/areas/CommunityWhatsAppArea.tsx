import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, RefreshCw, Save } from 'lucide-react';
import type {
  Community,
  Player,
  ShareBlock,
  WhatsAppListDraft,
  WhatsAppListSlot,
  WhatsAppListTemplate,
} from '../../../types';
import type { WhatsAppApi } from '@app/screens/communitiesView/communitiesViewModel';
import { getCommunityPlayers, getPlayerDisplayName } from '../../../logic/community';
import { getPresenceStatus } from '../../../logic/communityPresence';
import {
  createDefaultTemplate,
  createDraftFromTemplate,
  formatMainListSection,
  formatOpenSlotsMessage,
  formatPaymentInfo,
  formatPaymentReminder,
  formatReserveSection,
  formatSettersSection,
  formatShortCallMessage,
  formatWhatsAppHeader,
  formatWhatsAppList,
} from '../../../logic/whatsappList';
import { formatLocalDateInput } from '../../../logic/date';
import { ShareActions } from '../../share/ShareActions';
import { EmptyState } from '../../../ui/EmptyState';
import { useUnsavedGuard } from '../unsavedGuard';

function createSlotsWithCurrent(
  current: Array<{ index: number; displayName?: string; note?: string; paid?: boolean }>,
  count: number,
) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    index: index + 1,
    displayName: current[index]?.displayName,
    note: current[index]?.note,
    paid: current[index]?.paid,
  }));
}

function templateFromDraft(
  template: WhatsAppListTemplate,
  draft: WhatsAppListDraft,
): WhatsAppListTemplate {
  return {
    ...template,
    title: draft.title,
    defaultLocation: draft.location,
    defaultStartTime: draft.startTime,
    defaultEndTime: draft.endTime,
    defaultValue: draft.value,
    pixKey: draft.pixKey,
    pixHolder: draft.pixHolder,
    pixBank: draft.pixBank,
    paymentDeadline: draft.paymentDeadline,
    paymentNote: draft.paymentNote,
    settersCount: draft.setters.length,
    mainSlotsCount: draft.mainSlots.length,
    reserveSlotsCount: draft.reserveSlots.length,
    settersSectionTitle: draft.settersSectionTitle,
    reserveSectionTitle: draft.reserveSectionTitle,
    showLockIcon: draft.showLockIcon,
    paymentSymbol: draft.paymentSymbol,
    extraText: draft.extraText,
  };
}

export function CommunityWhatsAppArea({
  community,
  players,
  whatsAppApi,
  canCreateSession = true,
  canEditRules = true,
}: {
  community: Community;
  players: Player[];
  whatsAppApi: WhatsAppApi;
  canCreateSession?: boolean;
  canEditRules?: boolean;
}) {
  const templates = whatsAppApi.getCommunityTemplates(community.id);
  const initialTemplate = templates[0] || createDefaultTemplate(community.id, community.name);
  const [template, setTemplate] = useState<WhatsAppListTemplate>(initialTemplate);
  const [draft, setDraft] = useState<WhatsAppListDraft>(
    () =>
      whatsAppApi.getLatestDraft(community.id) ||
      createDraftFromTemplate(initialTemplate, formatLocalDateInput()),
  );
  const text = formatWhatsAppList(draft);

  // `updatedAt` muda a cada tecla, então comparar o objeto inteiro acusaria
  // sujeira falsa; a referência é o que está persistido, sem o carimbo.
  const semCarimbo = (valor: WhatsAppListDraft) => JSON.stringify({ ...valor, updatedAt: '' });
  const persistido = whatsAppApi.getLatestDraft(community.id);

  useUnsavedGuard({
    dirty: persistido ? semCarimbo(draft) !== semCarimbo(persistido) : true,
    save: () => {
      whatsAppApi.saveTemplate(template);
      whatsAppApi.saveDraft(draft);
    },
    label: 'Lista WhatsApp',
  });

  const updateDraft = (patch: Partial<WhatsAppListDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }));

  const recreateFromTemplate = () => {
    // Rótulo neutro, ação destrutiva: "Gerar" substitui o rascunho inteiro pelo
    // modelo e apaga os nomes já digitados.
    const nomesPreenchidos = [...draft.setters, ...draft.mainSlots, ...draft.reserveSlots].filter(
      (slot) => slot.displayName?.trim(),
    ).length;
    if (nomesPreenchidos > 0) {
      const confirmado = window.confirm(
        `Gerar a lista do zero apaga ${nomesPreenchidos} ${
          nomesPreenchidos === 1 ? 'nome já preenchido' : 'nomes já preenchidos'
        }. Continuar?`,
      );
      if (!confirmado) return;
    }
    const next = createDraftFromTemplate(template, draft.date);
    setDraft(next);
    whatsAppApi.saveTemplate(template);
    whatsAppApi.saveDraft(next);
  };

  const prefillNames = () => {
    const setters = players
      .filter((player) => player.posicaoPrincipal === 'levantador')
      .slice(0, draft.setters.length);
    const others = players
      .filter((player) => player.posicaoPrincipal !== 'levantador')
      .slice(0, draft.mainSlots.length);
    updateDraft({
      setters: draft.setters.map((slot, index) => ({
        ...slot,
        displayName: setters[index] ? getPlayerDisplayName(setters[index]) : slot.displayName,
      })),
      mainSlots: draft.mainSlots.map((slot, index) => ({
        ...slot,
        displayName: others[index] ? getPlayerDisplayName(others[index]) : slot.displayName,
      })),
    });
  };

  const blocks: ShareBlock[] = [
    { id: 'complete', label: 'Lista completa', text },
    { id: 'header', label: 'Cabecalho', text: formatWhatsAppHeader(draft) },
    { id: 'payment', label: 'Pagamento', text: formatPaymentInfo(draft) },
    { id: 'setters', label: 'Levantadores', text: formatSettersSection(draft) },
    { id: 'main', label: 'Lista principal', text: formatMainListSection(draft) },
    { id: 'reserve', label: 'Reservas', text: formatReserveSection(draft) },
    { id: 'short', label: 'Chamada curta', text: formatShortCallMessage(draft) },
    { id: 'payment-reminder', label: 'Lembrete pagamento', text: formatPaymentReminder(draft) },
    { id: 'open-slots', label: 'Vagas abertas', text: formatOpenSlotsMessage(draft) },
  ];

  // A lista que vai para o grupo é a convocatória do elenco. Sem elenco ela sai
  // vazia, e mandar uma lista em branco no WhatsApp é pior que não mandar.
  if (getCommunityPlayers(community.id, players).length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        size="compact"
        title="A convocatória sai daqui"
        description="Este é o texto pronto para colar no grupo: quem está convocado, quantas vagas sobraram, o local, o horário e a chave PIX. Ele se monta sozinho a partir do elenco e da chamada — que precisam existir primeiro."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card card-border bg-base-200">
        <div className="card-body gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="form-control">
              <span className="label-text">Nome do modelo</span>
              <input
                className="input input-bordered"
                value={template.name}
                onChange={(event) => setTemplate({ ...template, name: event.target.value })}
                disabled={!canEditRules}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Título</span>
              <input
                className="input input-bordered"
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
                disabled={!canCreateSession}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Data</span>
              <input
                type="date"
                className="input input-bordered"
                value={draft.date}
                onChange={(event) => updateDraft({ date: event.target.value })}
                disabled={!canCreateSession}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Local</span>
              <input
                className="input input-bordered"
                value={draft.location || ''}
                onChange={(event) => updateDraft({ location: event.target.value })}
                disabled={!canCreateSession}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Inicio</span>
              <input
                type="time"
                className="input input-bordered"
                value={draft.startTime || ''}
                onChange={(event) => updateDraft({ startTime: event.target.value })}
                disabled={!canCreateSession}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Fim</span>
              <input
                type="time"
                className="input input-bordered"
                value={draft.endTime || ''}
                onChange={(event) => updateDraft({ endTime: event.target.value })}
                disabled={!canCreateSession}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Valor</span>
              <input
                type="number"
                className="input input-bordered"
                value={draft.value || 0}
                onChange={(event) => updateDraft({ value: Number(event.target.value) })}
                disabled={!canCreateSession}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Chave Pix</span>
              <input
                className="input input-bordered"
                value={draft.pixKey || ''}
                onChange={(event) => updateDraft({ pixKey: event.target.value })}
                disabled={!canCreateSession}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Responsável Pix</span>
              <input
                className="input input-bordered"
                value={draft.pixHolder || ''}
                onChange={(event) => updateDraft({ pixHolder: event.target.value })}
                disabled={!canCreateSession}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Banco</span>
              <input
                className="input input-bordered"
                value={draft.pixBank || ''}
                onChange={(event) => updateDraft({ pixBank: event.target.value })}
                disabled={!canCreateSession}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Prazo pagamento</span>
              <input
                className="input input-bordered"
                value={draft.paymentDeadline || ''}
                onChange={(event) => updateDraft({ paymentDeadline: event.target.value })}
                disabled={!canCreateSession}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Observacao pagamento</span>
              <input
                className="input input-bordered"
                value={draft.paymentNote || ''}
                onChange={(event) => updateDraft({ paymentNote: event.target.value })}
                disabled={!canCreateSession}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CountInput
              label="Levantadores"
              value={draft.setters.length}
              onChange={(count) =>
                updateDraft({ setters: createSlotsWithCurrent(draft.setters, count) })
              }
              disabled={!canCreateSession}
            />
            <CountInput
              label="Lista principal"
              value={draft.mainSlots.length}
              onChange={(count) =>
                updateDraft({ mainSlots: createSlotsWithCurrent(draft.mainSlots, count) })
              }
              disabled={!canCreateSession}
            />
            <CountInput
              label="Reservas"
              value={draft.reserveSlots.length}
              onChange={(count) =>
                updateDraft({ reserveSlots: createSlotsWithCurrent(draft.reserveSlots, count) })
              }
              disabled={!canCreateSession}
            />
          </div>

          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={draft.showLockIcon}
              onChange={(event) => updateDraft({ showLockIcon: event.target.checked })}
              disabled={!canCreateSession}
            />
            <span className="label-text">Exibir cadeado entre levantadores e lista principal</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <button
              type="button"
              className="btn btn-outline"
              onClick={prefillNames}
              disabled={!canCreateSession}
            >
              Preencher nomes
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={recreateFromTemplate}
              disabled={!canCreateSession}
            >
              <RefreshCw className="w-4 h-4" /> Gerar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => whatsAppApi.saveDraft(draft)}
              disabled={!canCreateSession}
            >
              <Save className="w-4 h-4" /> Salvar lista
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                whatsAppApi.saveTemplate({ ...template, ...templateFromDraft(template, draft) })
              }
              disabled={!canEditRules}
            >
              Salvar modelo
            </button>
          </div>
        </div>
      </div>

      <textarea
        className="textarea textarea-bordered w-full min-h-96 font-mono text-xs"
        readOnly
        value={text}
      />
      <ShareActions
        title={`Lista - ${community.name}`}
        text={text}
        blocks={blocks}
        variant="menu"
      />
    </div>
  );
}

function CountInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="form-control">
      <span className="label-text">{label}</span>
      <input
        type="number"
        min={0}
        className="input input-bordered"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
      />
    </label>
  );
}
