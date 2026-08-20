import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router';
import { ChampionshipWizardView } from './ChampionshipWizardView';

const { spies, navigateSpy, createChampionshipSpy } = vi.hoisted(() => ({
  spies: {
    setChampionships: vi.fn(),
    setChampionshipTeams: vi.fn(),
    setChampionshipRounds: vi.fn(),
  },
  navigateSpy: vi.fn(),
  createChampionshipSpy: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

// O spy delega para a implementacao real por padrao (o preview de rodadas depende
// do agendamento de verdade); os testes de erro sobrescrevem pontualmente.
vi.mock('../../application/championshipUseCases', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../application/championshipUseCases')>();
  createChampionshipSpy.mockImplementation(actual.createChampionship);
  return { ...actual, createChampionship: createChampionshipSpy };
});

vi.mock('../../app/shellContext', () => ({
  useShell: () => ({
    comm: { communities: [{ id: 'comm-1', name: 'Vôlei de Terça' }] },
    play: {
      players: [
        { id: 'p1', nome: 'Ana Silva', apelido: 'Ana' },
        { id: 'p2', nome: 'Bruno Costa', apelido: 'Bruno' },
      ],
    },
    championships: spies,
  }),
}));

function renderWizard() {
  return render(
    <BrowserRouter>
      <ChampionshipWizardView />
    </BrowserRouter>,
  );
}

/** Passo 1 -> 4 pelo caminho feliz, com a liga nomeada. */
async function irAteRevisao(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Ex: Liga da Primavera 2026'), 'Liga da Primavera');
  await user.click(screen.getByRole('button', { name: /próximo: pontuação/i }));
  await user.click(screen.getByRole('button', { name: /próximo: times & capitães/i }));
  await user.click(screen.getByRole('button', { name: /próximo: revisão & calendário/i }));
}

describe('ChampionshipWizardView', () => {
  beforeEach(() => {
    spies.setChampionships.mockClear();
    spies.setChampionshipTeams.mockClear();
    spies.setChampionshipRounds.mockClear();
    navigateSpy.mockClear();
    // mockClear, nao mockReset: reset apagaria a delegacao para a implementacao
    // real que a fabrica do mock instalou uma unica vez, no import.
    createChampionshipSpy.mockClear();
  });

  it('renders step 1 form fields for basic info', () => {
    renderWizard();
    expect(screen.getByText('Criar Nova Liga')).toBeTruthy();
    expect(screen.getByPlaceholderText('Ex: Liga da Primavera 2026')).toBeTruthy();
  });

  it('trava o avanço enquanto a liga não tem nome', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    const proximo = screen.getByRole('button', { name: /próximo: pontuação/i });
    expect(proximo).toHaveProperty('disabled', true);

    await user.type(screen.getByPlaceholderText('Ex: Liga da Primavera 2026'), 'Liga de Ouro');
    expect(proximo).toHaveProperty('disabled', false);
  });

  it('percorre os quatro passos até a revisão', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await irAteRevisao(user);

    expect(screen.getByText(/Passo 4: Revisão Geral e Calendário/i)).toBeTruthy();
    expect(screen.getByText(/Prévia das Rodadas Geradas/i)).toBeTruthy();
  });

  it('o capitão é escolhido por teclado depois que o atleta entra na equipe', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.type(screen.getByPlaceholderText('Ex: Liga da Primavera 2026'), 'Liga de Ouro');
    await user.click(screen.getByRole('button', { name: /próximo: pontuação/i }));
    await user.click(screen.getByRole('button', { name: /próximo: times & capitães/i }));

    // Sem seleção não existe botão de capitão: ele só aparece para atleta escalado.
    expect(screen.queryByRole('button', { name: /capitão da/i })).toBeNull();

    const [anaNaEquipeA] = screen.getAllByRole('button', { name: 'Ana' });
    await user.click(anaNaEquipeA);
    expect(anaNaEquipeA.getAttribute('aria-pressed')).toBe('true');

    const capitao = screen.getAllByRole('button', { name: /capitão da/i })[0];
    expect(capitao.getAttribute('aria-pressed')).toBe('false');

    capitao.focus();
    await user.keyboard('{Enter}');
    expect(capitao.getAttribute('aria-pressed')).toBe('true');
  });

  it('mostra o motivo quando a criação é recusada, em vez de não fazer nada', async () => {
    const user = userEvent.setup({ delay: null });
    createChampionshipSpy.mockReturnValueOnce({
      ok: false,
      error: {
        kind: 'product',
        code: 'invalid_input',
        message: 'A recorrência informada não cobre todas as rodadas da liga.',
      },
    });
    renderWizard();

    await irAteRevisao(user);
    await user.click(screen.getByRole('button', { name: /lançar liga e gerar rodadas/i }));

    expect(screen.getByRole('alert').textContent).toMatch(/não cobre todas as rodadas/i);
    expect(spies.setChampionships).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('grava a liga com syncStatus local e navega para o detalhe', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await irAteRevisao(user);
    await user.click(screen.getByRole('button', { name: /lançar liga e gerar rodadas/i }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(spies.setChampionships).toHaveBeenCalledTimes(1);

    // O wizard grava via updater: aplica no estado anterior para inspecionar.
    const updater = spies.setChampionships.mock.calls[0][0] as (prev: unknown[]) => unknown[];
    const [liga] = updater([]) as { name: string; syncStatus: string }[];
    expect(liga.name).toBe('Liga da Primavera');
    expect(liga.syncStatus).toBe('local');

    const teamsUpdater = spies.setChampionshipTeams.mock.calls[0][0] as (
      prev: unknown[],
    ) => unknown[];
    const times = teamsUpdater([]) as { syncStatus: string }[];
    expect(times).toHaveLength(2);
    expect(times.every((t) => t.syncStatus === 'local')).toBe(true);

    expect(navigateSpy).toHaveBeenCalledTimes(1);
  });
});
