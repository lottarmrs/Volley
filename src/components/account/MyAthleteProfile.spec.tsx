import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateMyAthleteProfile } from '@app/athleteProfileUseCases';
import type { Player } from '../../types';
import { MyAthleteProfile } from './MyAthleteProfile';

vi.mock('@app/athleteProfileUseCases', () => ({ updateMyAthleteProfile: vi.fn() }));

const player: Player = {
  id: 'p1',
  cloudId: 'cloud-p1',
  nome: 'Ana Souza',
  apelido: 'Ana',
  genero: 'F',
  ativo: true,
  posicaoPrincipal: 'ponteiro',
  posicoesSecundarias: [],
  maoDominante: 'direita',
  atributos: {
    saque: 5,
    recepcao: 5,
    levantamento: 5,
    ataque: 5,
    bloqueio: 5,
    defesa: 5,
    velocidade: 5,
    resistencia: 5,
    leituraDeJogo: 5,
    regularidade: 5,
    controleEmocional: 5,
  },
  perfil: {
    nivel: 3,
    classe: '',
    arquetipo: '',
    especialidade: '',
    fraqueza: '',
  },
  formaAtual: { valor: 0, observacao: '', ultimasPartidas: [] },
  status: { lesionado: false, limitacaoFisica: null, presencaFrequente: true },
  metadata: { criadoEm: '2026-01-01T00:00:00.000Z', atualizadoEm: '2026-01-01T00:00:00.000Z' },
  alturaCm: 170,
};

describe('MyAthleteProfile', () => {
  beforeEach(() => {
    vi.mocked(updateMyAthleteProfile).mockReset();
  });

  it('com player=null mostra o carregamento e nenhum formulario', () => {
    render(<MyAthleteProfile player={null} onSaved={vi.fn()} onAvatarApplied={vi.fn()} />);
    expect(screen.getByText(/carregando sua ficha/i)).toBeTruthy();
    expect(screen.queryByLabelText('Altura (cm)')).toBeNull();
  });

  it('preenche os campos a partir da ficha e mostra o envio de foto', () => {
    render(<MyAthleteProfile player={player} onSaved={vi.fn()} onAvatarApplied={vi.fn()} />);
    expect((screen.getByLabelText('Altura (cm)') as HTMLInputElement).value).toBe('170');
    expect(screen.getByRole('radio', { name: 'Feminino' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: 'Ponteiro' })).toHaveProperty('checked', true);
    expect(screen.getByLabelText('Lesionado')).toBeTruthy();
    expect(screen.getByTitle(/foto/i)).toBeTruthy();
  });

  it('salvar chama updateMyAthleteProfile com o draft e depois onSaved', async () => {
    vi.mocked(updateMyAthleteProfile).mockResolvedValue({ ok: true, value: 'ready' } as never);
    const onSaved = vi.fn();
    render(<MyAthleteProfile player={player} onSaved={onSaved} onAvatarApplied={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(updateMyAthleteProfile).toHaveBeenCalledWith(
      expect.objectContaining({ genero: 'F', posicaoPrincipal: 'ponteiro', alturaCm: 170 }),
    );
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ genero: 'F', posicaoPrincipal: 'ponteiro', alturaCm: 170 }),
    );
  });

  it('erro do servidor fica em role=alert e onSaved nao e chamado', async () => {
    vi.mocked(updateMyAthleteProfile).mockResolvedValue({
      ok: false,
      error: {
        kind: 'product',
        code: 'cloud_unavailable',
        recoverable: true,
        message: 'Precisamos de conexão para salvar sua ficha.',
      },
    } as never);
    const onSaved = vi.fn();
    render(<MyAthleteProfile player={player} onSaved={onSaved} onAvatarApplied={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
