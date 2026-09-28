import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateMyAthleteProfile } from '@app/athleteProfileUseCases';
import { STORAGE_KEYS } from '@storage/localStorageRepository';
import { CompleteAthleteProfilePage } from './CompleteAthleteProfilePage';

vi.mock('@app/athleteProfileUseCases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/athleteProfileUseCases')>()),
  updateMyAthleteProfile: vi.fn(),
}));
const retry = vi.fn();
const signOut = vi.fn();
vi.mock('./useAuthSession', () => ({
  useAuthSession: () => ({ retry, signOut, session: { user: { id: 'conta-1' } } }),
}));

function preencher() {
  fireEvent.click(screen.getByRole('radio', { name: 'Masculino' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Ponteiro' }));
  fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '182' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Destro' }));
}

function renderAt(from?: string) {
  render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/completar-ficha', state: from ? { from: { pathname: from } } : null },
      ]}
    >
      <Routes>
        <Route path="/completar-ficha" element={<CompleteAthleteProfilePage />} />
        <Route path="/convite/:c" element={<p>Convite</p>} />
        <Route path="/" element={<p>Início</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CompleteAthleteProfilePage', () => {
  beforeEach(() => {
    vi.mocked(updateMyAthleteProfile).mockReset();
    retry.mockReset();
    signOut.mockReset();
    localStorage.clear();
  });

  it('da para sair da conta sem preencher a ficha', () => {
    signOut.mockResolvedValue(undefined);
    renderAt();
    fireEvent.click(screen.getByRole('button', { name: /sair da conta/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(updateMyAthleteProfile).not.toHaveBeenCalled();
  });

  it('depois de salvar, a copia local da propria ficha ja tem a ficha', async () => {
    localStorage.setItem(
      STORAGE_KEYS.players,
      JSON.stringify([
        { id: 'minha', nome: 'Zé', userId: 'conta-1', genero: null, status: {} },
        { id: 'dela', nome: 'Ana', userId: 'conta-2', genero: null, status: {} },
      ]),
    );
    vi.mocked(updateMyAthleteProfile).mockResolvedValue({ ok: true, value: 'ready' });
    renderAt();
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(retry).toHaveBeenCalled());
    const [minha, dela] = JSON.parse(localStorage.getItem(STORAGE_KEYS.players) ?? '[]');
    expect(minha.genero).toBe('M');
    expect(minha.posicaoPrincipal).toBe('ponteiro');
    expect(minha.alturaCm).toBe(182);
    expect(minha.maoDominante).toBe('direita');
    expect(dela.genero).toBeNull();
  });

  it('sem copia local, salvar nao cria uma', async () => {
    vi.mocked(updateMyAthleteProfile).mockResolvedValue({ ok: true, value: 'ready' });
    renderAt();
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(retry).toHaveBeenCalled());
    expect(localStorage.getItem(STORAGE_KEYS.players)).toBeNull();
  });

  it('continuar fica desabilitado ate os quatro obrigatorios', () => {
    renderAt();
    const continuar = screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement;
    expect(continuar.disabled).toBe(true);
    preencher();
    expect(continuar.disabled).toBe(false);
    expect(screen.getByText(/é com isso que o sorteio monta times equilibrados/i)).toBeTruthy();
    expect(screen.queryByLabelText('Lesionado')).toBeNull();
  });

  it('salva, atualiza a sessao e segue para o destino guardado', async () => {
    vi.mocked(updateMyAthleteProfile).mockResolvedValue({ ok: true, value: 'ready' });
    renderAt('/convite/ABC');
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(retry).toHaveBeenCalled());
    expect(await screen.findByText('Convite')).toBeTruthy();
  });

  it('a falha fica na tela e mantem o que foi preenchido', async () => {
    vi.mocked(updateMyAthleteProfile).mockResolvedValue({
      ok: false,
      error: {
        kind: 'product',
        code: 'cloud_unavailable',
        recoverable: true,
        message: 'Precisamos de conexão para salvar sua ficha.',
      },
    } as never);
    renderAt();
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('Altura (cm)') as HTMLInputElement).value).toBe('182');
    expect(retry).not.toHaveBeenCalled();
  });
});
