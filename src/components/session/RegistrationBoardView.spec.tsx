import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistrationBoard } from '../../types';
import { makePlayer } from '../../test/fixtures';
import type { RegistrationBoardApi } from '../../hooks/useRegistrationBoard';
import { RegistrationBoardView } from './RegistrationBoardView';

const players = [
  makePlayer('a', { cloudId: 'cloud-a', nome: 'Ana' }),
  makePlayer('b', { cloudId: 'cloud-b', nome: 'Bia' }),
  makePlayer('c', { cloudId: 'cloud-c', nome: 'Caio' }),
  makePlayer('d', { cloudId: 'cloud-d', nome: 'Duda' }),
];

function board(overrides: Partial<RegistrationBoard> = {}): RegistrationBoard {
  return {
    windowId: 'w-1',
    sessionId: 'cloud-session',
    status: 'OPEN',
    revision: 2,
    capacity: 2,
    confirmedCount: 2,
    waitlistedCount: 1,
    paymentDueAt: null,
    paidCount: 0,
    viewerCanManage: false,
    viewerPlayerId: 'cloud-c',
    viewerEntryStatus: 'WAITLISTED',
    viewerQueuePosition: 1,
    viewerPaidAt: null,
    pendingDeadlineCut: null,
    entries: [
      {
        entryId: 'e-a',
        playerId: 'cloud-a',
        status: 'CONFIRMED',
        queuePosition: null,
        source: 'SELF_JOIN',
        joinedAt: '2026-09-22T12:00:00.000Z',
        paidAt: null,
        paymentLapsedAt: null,
      },
      {
        entryId: 'e-b',
        playerId: 'cloud-b',
        status: 'CONFIRMED',
        queuePosition: null,
        source: 'SELF_JOIN',
        joinedAt: '2026-09-22T12:01:00.000Z',
        paidAt: null,
        paymentLapsedAt: null,
      },
      {
        entryId: 'e-c',
        playerId: 'cloud-c',
        status: 'WAITLISTED',
        queuePosition: 1,
        source: 'SELF_JOIN',
        joinedAt: '2026-09-22T12:02:00.000Z',
        paidAt: null,
        paymentLapsedAt: null,
      },
    ],
    ...overrides,
  };
}

function api(overrides: Partial<RegistrationBoardApi> = {}): RegistrationBoardApi {
  return {
    board: board(),
    loading: false,
    busy: false,
    error: null,
    open: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    addAthlete: vi.fn(),
    removeAthlete: vi.fn(),
    changeCapacity: vi.fn(),
    setOpen: vi.fn(),
    reload: vi.fn(),
    markPaid: vi.fn(),
    setPaymentDue: vi.fn(),
    boostReserve: vi.fn(),
    applyDeadline: vi.fn(),
    ...overrides,
  };
}

function renderView(overrides: Partial<RegistrationBoardApi> = {}) {
  const contrato = api(overrides);
  render(
    <RegistrationBoardView
      api={contrato}
      players={players}
      sessionName="Pelada de quinta"
      sessionDate="2026-09-24"
    />,
  );
  return contrato;
}

describe('RegistrationBoardView', () => {
  it('mostra os confirmados e a reserva com a posição', () => {
    renderView();
    expect(screen.getByText('Ana')).toBeDefined();
    expect(screen.getByText('Bia')).toBeDefined();
    const reserva = screen.getByRole('list', { name: /reserva/i });
    expect(reserva.textContent).toContain('Caio');
    expect(reserva.textContent).toContain('1');
  });

  it('diz ao atleta que ele está na reserva e oferece sair', () => {
    const contrato = renderView();
    expect(screen.getByRole('status').textContent).toMatch(/reserva/i);
    fireEvent.click(screen.getByRole('button', { name: /sair da lista/i }));
    expect(contrato.leave).toHaveBeenCalledTimes(1);
  });

  it('oferece entrar para quem está fora, e mostra as vagas', () => {
    const contrato = renderView({
      board: board({
        viewerEntryStatus: null,
        viewerQueuePosition: null,
        capacity: 4,
        confirmedCount: 2,
        waitlistedCount: 0,
      }),
    });
    expect(screen.getByText(/2 vagas/i)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /quero jogar/i }));
    expect(contrato.join).toHaveBeenCalledTimes(1);
  });

  it('para quem organiza, mostra capacidade editável e as ações da janela', () => {
    const contrato = renderView({ board: board({ viewerCanManage: true }) });
    fireEvent.change(screen.getByLabelText(/vagas/i), { target: { value: '6' } });
    fireEvent.blur(screen.getByLabelText(/vagas/i));
    expect(contrato.changeCapacity).toHaveBeenCalledWith(6);

    fireEvent.click(screen.getByRole('button', { name: /fechar inscri/i }));
    expect(contrato.setOpen).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getAllByRole('button', { name: /tirar da lista/i })[0]);
    expect(contrato.removeAthlete).toHaveBeenCalledWith('cloud-a');
  });

  it('sem janela, quem organiza vê o convite para abrir e o atleta vê a espera', () => {
    const doOrganizador = renderView({ board: null });
    expect(screen.queryByRole('button', { name: /abrir inscri/i })).toBeNull();

    render(
      <RegistrationBoardView
        api={api({ board: null })}
        players={players}
        sessionName="Pelada de quinta"
        sessionDate="2026-09-24"
        canOpen
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /abrir inscri/i }));
    expect(doOrganizador.open).not.toHaveBeenCalled();
  });

  it('mostra o erro da última ação', () => {
    renderView({ error: 'A inscrição está fechada. Fale com quem organiza.' });
    expect(screen.getByRole('alert').textContent).toContain('A inscrição está fechada');
  });

  it('inscrição fechada não oferece entrar', () => {
    renderView({ board: board({ status: 'CLOSED', viewerEntryStatus: null }) });
    expect(screen.queryByRole('button', { name: /quero jogar/i })).toBeNull();
    expect(screen.getByText(/fechada/i)).toBeDefined();
  });

  it('enquanto carrega, não afirma que a inscrição não abriu', () => {
    renderView({ board: null, loading: true });
    expect(screen.queryByText(/ainda não abriu/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /quero jogar/i })).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/carregando/i);
  });

  it('quando a leitura falha, oferece tentar de novo em vez do painel de estreia', () => {
    const contrato = renderView({
      board: null,
      error: 'Não foi possível carregar a inscrição. Tente de novo.',
    });
    expect(screen.queryByText(/ainda não abriu/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(contrato.reload).toHaveBeenCalledTimes(1);
  });

  it('escolher o atleta não inscreve ninguém; só o botão inscreve', () => {
    const contrato = renderView({ board: board({ viewerCanManage: true }) });
    const seletor = screen.getByLabelText(/incluir atleta/i);

    fireEvent.change(seletor, { target: { value: 'cloud-d' } });
    expect(contrato.addAthlete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^incluir$/i }));
    expect(contrato.addAthlete).toHaveBeenCalledWith('cloud-d');
  });
});
