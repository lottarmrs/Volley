import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { appOk, productError } from '@app/appResult';
import type { Player } from '../../../types';
import { makePlayer } from '../../../test/fixtures';
import { CommunityGuestsArea } from './CommunityGuestsArea';

const convidado: Player = makePlayer('g1', {
  nome: 'Zé',
  apelido: 'Zezinho',
  posicaoPrincipal: 'ponteiro',
  alturaCm: 180,
});

function renderArea(overrides: Partial<ComponentProps<typeof CommunityGuestsArea>> = {}) {
  return render(
    <CommunityGuestsArea
      guests={[convidado]}
      noCloud={false}
      onSave={vi.fn(() => appOk(convidado))}
      onRemove={vi.fn(() => appOk('removed' as const))}
      hasHistory={() => false}
      {...overrides}
    />,
  );
}

describe('CommunityGuestsArea', () => {
  it('lista só os convidados recebidos, com o botão de cadastrar', () => {
    renderArea();

    expect(screen.getByRole('button', { name: /cadastrar convidado/i })).toBeTruthy();
    expect(screen.getByText('Zé')).toBeTruthy();
    expect(screen.getByText('Zezinho')).toBeTruthy();
  });

  it('lista vazia mostra a frase e o botão de cadastrar', () => {
    renderArea({ guests: [] });

    expect(screen.getByText('Nenhum convidado ainda.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /cadastrar convidado/i })).toBeTruthy();
  });

  it('cadastrar convidado abre o formulario com Nome e o AthleteProfileForm; salvar chama onSave com playerId nulo', () => {
    const onSave = vi.fn(() => appOk(convidado));
    renderArea({ onSave });

    fireEvent.click(screen.getByRole('button', { name: /cadastrar convidado/i }));

    expect(screen.getByLabelText('Nome')).toBeTruthy();
    expect(screen.getByText('Gênero')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo Convidado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: null, nome: 'Novo Convidado' }),
    );
  });

  it('tocar num convidado abre o formulario preenchido', () => {
    renderArea();

    fireEvent.click(screen.getByText('Zé'));

    expect(screen.getByLabelText('Nome')).toHaveProperty('value', 'Zé');
    expect(screen.getByLabelText('Altura (cm)')).toHaveProperty('value', '180');
  });

  it('Nivel so aparece quando noCloud e verdadeiro', () => {
    const { rerender } = renderArea({ noCloud: false });
    fireEvent.click(screen.getByText('Zé'));
    expect(screen.queryByText('Nível')).toBeNull();

    rerender(
      <CommunityGuestsArea
        guests={[convidado]}
        noCloud
        onSave={vi.fn(() => appOk(convidado))}
        onRemove={vi.fn(() => appOk('removed' as const))}
        hasHistory={() => false}
      />,
    );
    expect(screen.getByText('Nível')).toBeTruthy();
  });

  it('mostra Excluir quando nao ha historico e chama onRemove apos confirmar', () => {
    const onRemove = vi.fn(() => appOk('removed' as const));
    renderArea({ onRemove, hasHistory: () => false });

    fireEvent.click(screen.getByText('Zé'));
    const excluir = screen.getByRole('button', { name: /excluir/i });
    fireEvent.click(excluir);
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /confirmar exclusão/i }));
    expect(onRemove).toHaveBeenCalledWith('g1');
  });

  it('mostra Desativar quando ha historico', () => {
    renderArea({ hasHistory: () => true });

    fireEvent.click(screen.getByText('Zé'));
    expect(screen.getByRole('button', { name: /desativar/i })).toBeTruthy();
  });

  it('erro do onSave aparece em role alert', () => {
    const onSave = vi.fn(() => productError('invalid_input', 'Escolha o gênero.'));
    renderArea({ onSave });

    fireEvent.click(screen.getByRole('button', { name: /cadastrar convidado/i }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Alguem' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByRole('alert').textContent).toContain('Escolha o gênero.');
  });

  it('com initialEditingId, abre direto a edicao daquele convidado', () => {
    renderArea({ initialEditingId: 'g1' });

    expect(screen.getByLabelText('Nome')).toHaveProperty('value', 'Zé');
    expect(screen.queryByRole('button', { name: /cadastrar convidado/i })).toBeNull();
  });

  it('mostra o searchSlot numa secao propria quando existe', () => {
    renderArea({ searchSlot: <p>busca por username</p> });

    expect(screen.getByText('Trazer atleta com conta pelo @')).toBeTruthy();
    expect(screen.getByText('busca por username')).toBeTruthy();
  });

  it('sem searchSlot, a secao nao aparece', () => {
    renderArea();

    expect(screen.queryByText('Trazer atleta com conta pelo @')).toBeNull();
  });
});
