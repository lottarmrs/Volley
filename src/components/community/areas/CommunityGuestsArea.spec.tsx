import { fireEvent, render, screen, within } from '@testing-library/react';
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

const desativado: Player = makePlayer('g9', {
  nome: 'Beto Parado',
  apelido: 'Beto Parado',
  posicaoPrincipal: 'central',
  alturaCm: 190,
  ativo: false,
});

function renderArea(overrides: Partial<ComponentProps<typeof CommunityGuestsArea>> = {}) {
  return render(
    <CommunityGuestsArea
      guests={[convidado]}
      noCloud={false}
      isOwner
      onSave={vi.fn(() => appOk(convidado))}
      onDeactivate={vi.fn(() => appOk('deactivated' as const))}
      onReactivate={vi.fn(() => appOk('reactivated' as const))}
      onDelete={vi.fn(() => appOk('removed' as const))}
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
        isOwner
        onSave={vi.fn(() => appOk(convidado))}
        onDeactivate={vi.fn(() => appOk('deactivated' as const))}
        onReactivate={vi.fn(() => appOk('reactivated' as const))}
        onDelete={vi.fn(() => appOk('removed' as const))}
      />,
    );
    expect(screen.getByText('Nível')).toBeTruthy();
  });

  it('no editor de um convidado ativo, a acao destrutiva e so Desativar, em dois toques', () => {
    const onDeactivate = vi.fn(() => appOk('deactivated' as const));
    const onDelete = vi.fn(() => appOk('removed' as const));
    renderArea({ onDeactivate, onDelete });

    fireEvent.click(screen.getByText('Zé'));
    expect(screen.queryByRole('button', { name: /excluir/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));
    expect(onDeactivate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /confirmar desativação/i }));
    expect(onDeactivate).toHaveBeenCalledWith('g1');
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /cadastrar convidado/i })).toBeTruthy();
  });

  it('a lista principal mostra so os ativos e os desativados ficam numa secao propria', () => {
    renderArea({ guests: [convidado, desativado] });

    const principal = screen.getByRole('list', { name: 'Convidados ativos' });
    expect(within(principal).getByText('Zé')).toBeTruthy();
    expect(within(principal).queryByText('Beto Parado')).toBeNull();

    const secao = screen.getByRole('list', { name: 'Desativados' });
    expect(within(secao).getByText('Beto Parado')).toBeTruthy();
  });

  it('sem desativados, a secao Desativados nao aparece', () => {
    renderArea();

    expect(screen.queryByText('Desativados')).toBeNull();
  });

  it('admin reativa um desativado e nao ve Excluir', () => {
    const onReactivate = vi.fn(() => appOk('reactivated' as const));
    renderArea({ guests: [convidado, desativado], isOwner: false, onReactivate });

    const secao = screen.getByRole('list', { name: 'Desativados' });
    expect(within(secao).queryByRole('button', { name: /excluir/i })).toBeNull();
    fireEvent.click(within(secao).getByRole('button', { name: 'Reativar' }));

    expect(onReactivate).toHaveBeenCalledWith('g9');
  });

  it('dono exclui um desativado com confirmacao em dois toques', () => {
    const onDelete = vi.fn(() => appOk('removed' as const));
    renderArea({ guests: [convidado, desativado], onDelete });

    const secao = screen.getByRole('list', { name: 'Desativados' });
    fireEvent.click(within(secao).getByRole('button', { name: 'Excluir' }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(secao).getByRole('button', { name: /confirmar exclusão/i }));
    expect(onDelete).toHaveBeenCalledWith('g9');
  });

  it('excluir que so desativa por causa do historico avisa em role status', () => {
    const onDelete = vi.fn(() => appOk('deactivated' as const));
    renderArea({ guests: [desativado], onDelete });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar exclusão/i }));

    expect(screen.getByRole('status').textContent).toContain('histórico');
  });

  it('erro ao excluir aparece em role alert', () => {
    const onDelete = vi.fn(() =>
      productError('permission_denied', 'Só o dono da comunidade pode excluir um convidado.'),
    );
    renderArea({ guests: [desativado], onDelete });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar exclusão/i }));

    expect(screen.getByRole('alert').textContent).toContain('Só o dono');
  });

  it('?editar= de um desativado abre o editor, diz que esta desativado e oferece Reativar', () => {
    const onReactivate = vi.fn(() => appOk('reactivated' as const));
    renderArea({ guests: [convidado, desativado], initialEditingId: 'g9', onReactivate });

    expect(screen.getByLabelText('Nome')).toHaveProperty('value', 'Beto Parado');
    expect(screen.getByText(/convidado desativado/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Desativar' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    expect(onReactivate).toHaveBeenCalledWith('g9');
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

  it('initialEditingId que nao bate com nenhum convidado abre a lista com aviso, sem editor vazio', () => {
    renderArea({ initialEditingId: 'nao-existe' });

    expect(screen.getByRole('button', { name: /cadastrar convidado/i })).toBeTruthy();
    expect(screen.queryByLabelText('Nome')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'Esse convidado não está mais aqui: foi removido ou ganhou conta e agora aparece em Pessoas.',
    );
  });

  it('o aviso de convidado ausente some ao interagir com a lista', () => {
    renderArea({ initialEditingId: 'nao-existe' });

    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByText('Zé'));

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Voltar do editor avisa onCloseEditor', () => {
    const onCloseEditor = vi.fn();
    renderArea({ initialEditingId: 'g1', onCloseEditor });

    fireEvent.click(screen.getByRole('button', { name: /voltar/i }));

    expect(onCloseEditor).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /cadastrar convidado/i })).toBeTruthy();
  });

  it('Salvar com sucesso avisa onCloseEditor', () => {
    const onSave = vi.fn(() => appOk(convidado));
    const onCloseEditor = vi.fn();
    renderArea({ initialEditingId: 'g1', onSave, onCloseEditor });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onCloseEditor).toHaveBeenCalled();
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

  describe('foto do convidado', () => {
    it('convidado com nuvem pode ganhar foto no editor', () => {
      renderArea({
        guests: [{ ...convidado, cloudId: 'cg1' }],
        initialEditingId: convidado.id,
      });
      expect(screen.getByTitle('Alterar foto de perfil')).toBeTruthy();
    });

    it('convidado sem nuvem nao mostra o envio de foto', () => {
      renderArea({
        guests: [{ ...convidado, cloudId: undefined }],
        initialEditingId: convidado.id,
      });
      expect(screen.queryByTitle('Alterar foto de perfil')).toBeNull();
      expect(
        screen.queryByTitle('Sincronize o atleta com a nuvem para adicionar uma foto'),
      ).toBeNull();
    });
  });
});
