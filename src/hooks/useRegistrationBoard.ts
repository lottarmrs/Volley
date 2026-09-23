import { useCallback, useEffect, useRef, useState } from 'react';
import type { RegistrationBoard, Session } from '../types';
import type { AppResult } from '../application/appResult';
import {
  addAthleteToRegistration,
  applyRegistrationPaymentDeadline,
  boostRegistrationReserve,
  changeRegistrationCapacity,
  defaultRegistrationBoardGateway,
  joinRegistration,
  leaveRegistration,
  markRegistrationPayment,
  openRegistration,
  removeAthleteFromRegistration,
  setRegistrationOpen,
  setRegistrationPaymentDue,
} from '../application/registrationUseCases';
import { generateUUID } from '../logic/uuid';

export interface UseRegistrationBoardInput {
  session: Session | null;
  communityCloudId: string | null;
  defaultCapacity: number;
  onSessionChange?: (session: Session) => void;
}

export interface RegistrationBoardApi {
  board: RegistrationBoard | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  open: () => Promise<void>;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  addAthlete: (playerCloudId: string) => Promise<void>;
  removeAthlete: (playerCloudId: string) => Promise<void>;
  changeCapacity: (capacity: number) => Promise<void>;
  setOpen: (open: boolean) => Promise<void>;
  reload: () => Promise<void>;
  markPaid: (playerCloudId: string, paid: boolean) => Promise<void>;
  setPaymentDue: (dueAt: string | null) => Promise<void>;
  boostReserve: (playerCloudId: string) => Promise<void>;
  applyDeadline: () => Promise<void>;
}

export function useRegistrationBoard(input: UseRegistrationBoardInput): RegistrationBoardApi {
  const sessionCloudId =
    input.session?.authorityModel === 'target' ? (input.session.cloudId ?? null) : null;
  const [board, setBoard] = useState<RegistrationBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Record<string, { commandId: string; entryId: string }>>({});

  const ler = useCallback(
    async (viva: () => boolean) => {
      if (!sessionCloudId) {
        setBoard(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const proximo = await defaultRegistrationBoardGateway.readSessionBoard(sessionCloudId);
        if (viva()) setBoard(proximo);
      } catch {
        if (viva()) setError('Não foi possível carregar a inscrição. Tente de novo.');
      } finally {
        if (viva()) setLoading(false);
      }
    },
    [sessionCloudId],
  );

  useEffect(() => {
    let active = true;
    void ler(() => active);
    return () => {
      active = false;
    };
  }, [ler]);

  const comando = (chave: string) => {
    const atual = pending.current[chave];
    if (atual) return atual;
    const novo = { commandId: generateUUID(), entryId: generateUUID() };
    pending.current[chave] = novo;
    return novo;
  };

  const executar = useCallback(
    async (
      chave: string,
      acao: (ids: { commandId: string; entryId: string }) => Promise<AppResult<RegistrationBoard>>,
    ) => {
      setBusy(true);
      setError(null);
      const ids = comando(chave);
      try {
        const resultado = await acao(ids);
        if (resultado.ok) {
          delete pending.current[chave];
          setBoard(resultado.value);
          return;
        }
        setError(resultado.error.message);
      } catch {
        setError('Não foi possível falar com a nuvem. Tente de novo.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const exigirJanela = (): string | null => board?.windowId ?? null;

  return {
    board,
    loading,
    busy,
    error,
    open: () =>
      executar('open', (ids) =>
        openRegistration({
          session: input.session as Session,
          communityCloudId: input.communityCloudId,
          capacity: input.defaultCapacity,
          commandId: ids.commandId,
          windowId: ids.entryId,
          onSessionChange: input.onSessionChange,
        }),
      ),
    join: () =>
      executar('join', (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return joinRegistration({ windowId, commandId: ids.commandId, entryId: ids.entryId });
      }),
    leave: () =>
      executar('leave', (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return leaveRegistration({ windowId, commandId: ids.commandId });
      }),
    addAthlete: (playerCloudId) =>
      executar(`add:${playerCloudId}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return addAthleteToRegistration({
          windowId,
          playerCloudId,
          commandId: ids.commandId,
          entryId: ids.entryId,
        });
      }),
    removeAthlete: (playerCloudId) =>
      executar(`remove:${playerCloudId}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return removeAthleteFromRegistration({
          windowId,
          playerCloudId,
          commandId: ids.commandId,
        });
      }),
    changeCapacity: (capacity) =>
      executar(`capacity:${capacity}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return changeRegistrationCapacity({ windowId, capacity, commandId: ids.commandId });
      }),
    setOpen: (open) =>
      executar(`setOpen:${open}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId || !board) throw new Error('Sem janela de inscrição');
        return setRegistrationOpen({
          windowId,
          open,
          expectedRevision: board.revision,
          commandId: ids.commandId,
        });
      }),
    markPaid: (playerCloudId, paid) =>
      executar(`pay:${playerCloudId}:${paid}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return markRegistrationPayment({
          windowId,
          playerCloudId,
          paid,
          commandId: ids.commandId,
        });
      }),
    setPaymentDue: (dueAt) =>
      executar(`due:${dueAt ?? 'nenhum'}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return setRegistrationPaymentDue({ windowId, dueAt, commandId: ids.commandId });
      }),
    boostReserve: (playerCloudId) =>
      executar(`boost:${playerCloudId}`, (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return boostRegistrationReserve({ windowId, playerCloudId, commandId: ids.commandId });
      }),
    applyDeadline: () =>
      executar('applyDeadline', (ids) => {
        const windowId = exigirJanela();
        if (!windowId) throw new Error('Sem janela de inscrição');
        return applyRegistrationPaymentDeadline({ windowId, commandId: ids.commandId });
      }),
    reload: () => ler(() => true),
  };
}
