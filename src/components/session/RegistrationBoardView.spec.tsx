import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function renderView(
  overrides: Partial<RegistrationBoardApi> & {
    shareUrl?: string;
    onShare?: (texto: string) => void;
    sessionDate?: string | null;
  } = {},
) {
  const { shareUrl, onShare, sessionDate, ...apiOverrides } = overrides;
  const contrato = api(apiOverrides);
  render(
    <RegistrationBoardView
      api={contrato}
      players={players}
      sessionName="Pelada de quinta"
      sessionDate={sessionDate === undefined ? '2026-09-24' : sessionDate}
      shareUrl={shareUrl}
      onShare={onShare}
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

  it('o atleta em dia vê que está quitado', () => {
    renderView({
      board: board({
        viewerEntryStatus: 'CONFIRMED',
        viewerQueuePosition: null,
        viewerPaidAt: '2026-09-23T10:00:00.000Z',
      }),
    });
    expect(screen.getByRole('status').textContent).toMatch(/pagamento em dia/i);
  });

  it('o atleta que falta pagar vê o prazo e a chave PIX', () => {
    render(
      <RegistrationBoardView
        api={api({
          board: board({
            viewerEntryStatus: 'CONFIRMED',
            viewerQueuePosition: null,
            viewerPaidAt: null,
            paymentDueAt: '2026-09-24T15:00:00.000Z',
          }),
        })}
        players={players}
        sessionName="Pelada de quinta"
        sessionDate="2026-09-24"
        pixKey="pelada@exemplo.com"
      />,
    );
    expect(screen.getByText(/falta pagar/i)).toBeDefined();
    expect(screen.getByText('pelada@exemplo.com')).toBeDefined();
  });

  it('quem perdeu o prazo é avisado do que aconteceu', () => {
    renderView({
      board: board({
        viewerEntryStatus: 'WAITLISTED',
        viewerQueuePosition: 2,
        viewerPaidAt: null,
        entries: [
          {
            entryId: 'e-c',
            playerId: 'cloud-c',
            status: 'WAITLISTED',
            queuePosition: 2,
            source: 'SELF_JOIN',
            joinedAt: '2026-09-22T12:02:00.000Z',
            paidAt: null,
            paymentLapsedAt: '2026-09-23T12:00:00.000Z',
          },
        ],
      }),
    });
    expect(screen.getByRole('status').textContent).toMatch(/perdeu o prazo/i);
  });

  it('quem organiza marca pagamento e vê o contador', () => {
    const contrato = renderView({
      board: board({ viewerCanManage: true, paidCount: 1 }),
    });
    expect(screen.getByText(/1 de 2 pagos/i)).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: /marcar como pago/i })[0]);
    expect(contrato.markPaid).toHaveBeenCalledWith('cloud-a', true);
  });

  it('o aviso de corte pendente diz quem sai, quem entra, e deixa aplicar agora', () => {
    const contrato = renderView({
      board: board({
        viewerCanManage: true,
        paymentDueAt: '2026-09-23T12:00:00.000Z',
        pendingDeadlineCut: { demoted: ['cloud-a'], promoted: ['cloud-c'] },
      }),
    });

    const aviso = screen.getByRole('status', { name: /corte/i });
    expect(aviso.textContent).toContain('Ana');
    expect(aviso.textContent).toContain('Caio');

    fireEvent.click(screen.getByRole('button', { name: /aplicar agora/i }));
    expect(contrato.applyDeadline).toHaveBeenCalledTimes(1);
  });

  it('quem organiza sobe alguém ao topo da reserva', () => {
    const contrato = renderView({ board: board({ viewerCanManage: true }) });
    fireEvent.click(screen.getAllByRole('button', { name: /subir ao topo/i })[0]);
    expect(contrato.boostReserve).toHaveBeenCalledWith('cloud-c');
  });

  it('quem organiza define o prazo', () => {
    const contrato = renderView({ board: board({ viewerCanManage: true }) });
    const campo = screen.getByLabelText(/prazo para pagar/i);
    fireEvent.change(campo, { target: { value: '2026-09-24T15:00' } });
    fireEvent.blur(campo);
    expect(contrato.setPaymentDue).toHaveBeenCalledWith('2026-09-24T15:00');
  });

  it('quem administra alcança o painel de quem organiza pela tela da inscrição', async () => {
    const onTransfer = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    render(
      <RegistrationBoardView
        api={api({ board: board({ viewerCanManage: true }) })}
        players={players}
        sessionName="Pelada de quinta"
        sessionDate="2026-09-24"
        organizerHandover={{
          podeTransferir: true,
          currentUserId: 'u-dono',
          membros: [{ userId: 'u-bia', nome: 'Bianca Ferraz' }],
          onTransfer,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /quem organiza/i }));
    fireEvent.click(screen.getByRole('button', { name: /assumir esta pelada/i }));

    await waitFor(() => expect(onTransfer).toHaveBeenCalledWith('u-dono'));
  });

  it('sem o repasse disponível, a tela não oferece o botão', () => {
    renderView({ board: board({ viewerCanManage: true }) });
    expect(screen.queryByRole('button', { name: /quem organiza/i })).toBeNull();
  });

  it('quem organiza recebe o botao de chamar o grupo, com o link da pelada', () => {
    const abrir = vi.fn();
    renderView({
      board: board({ viewerCanManage: true, capacity: 12, confirmedCount: 5 }),
      shareUrl: 'https://exemplo.test/comunidades/c1/sessoes/s1/inscricao',
      onShare: abrir,
    });

    fireEvent.click(screen.getByRole('button', { name: /chamar o grupo/i }));

    expect(abrir).toHaveBeenCalledTimes(1);
    const texto = abrir.mock.calls[0][0] as string;
    expect(texto).toContain('https://exemplo.test/comunidades/c1/sessoes/s1/inscricao');
    expect(texto).toMatch(/7 vagas/);
  });

  it('quem so joga nao ve o botao de chamar o grupo', () => {
    renderView({
      board: board({ viewerCanManage: false }),
      shareUrl: 'https://exemplo.test/x',
    });
    expect(screen.queryByRole('button', { name: /chamar o grupo/i })).toBeNull();
  });

  it('sem data conhecida, o cabecalho nao inventa um dia', () => {
    renderView({ board: board({}), sessionDate: null });
    expect(screen.queryByText(/invalid date/i)).toBeNull();
    expect(screen.getByText(/pelada de quinta/i)).toBeDefined();
  });
});
