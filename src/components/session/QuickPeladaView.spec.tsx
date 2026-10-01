import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Player } from '@shared/types';
import { makePlayer } from '../../test/fixtures';
import { QuickPeladaView } from './QuickPeladaView';

const ELENCO: Player[] = ['Rafa', 'Bia', 'Gus', 'Camila', 'Thiago', 'Tati'].map((nome, i) =>
  makePlayer(`p${i + 1}`, { nome, apelido: nome, communityIds: ['c1'] }),
);

const COMUNIDADES = [
  { id: 'c1', name: 'Terça Forte' },
  { id: 'c2', name: 'Domingo na Praia' },
];

function montar(extra: Partial<Parameters<typeof QuickPeladaView>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCommunityChange = vi.fn();
  render(
    <QuickPeladaView
      communities={COMUNIDADES}
      communityId="c1"
      onCommunityChange={onCommunityChange}
      roster={ELENCO}
      busy={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      {...extra}
    />,
  );
  return { onSubmit, onCommunityChange };
}

describe('pelada rápida', () => {
  it('só sorteia com o mínimo que o formato aceita', () => {
    const { onSubmit } = montar({ format: 'tournament' });
    const sortear = screen.getByRole('button', { name: /sortear/i });
    expect((sortear as HTMLButtonElement).disabled).toBe(true);

    for (const nome of ['Rafa', 'Bia', 'Gus', 'Camila', 'Thiago']) {
      fireEvent.click(screen.getByRole('checkbox', { name: nome }));
    }
    expect(screen.getByText(/falta 1 atleta: o torneio precisa de 2 times de 3/i)).toBeTruthy();
    expect((sortear as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tati' }));
    expect(screen.getByText(/6 atletas/i)).toBeTruthy();
    fireEvent.click(sortear);
    expect(onSubmit).toHaveBeenCalledWith({
      playerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      novos: [],
    });
  });

  it('no jogo livre explica que faltam atletas para três times', () => {
    montar();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Rafa' }));
    expect(
      screen.getByText(/faltam 8 atletas: o jogo livre precisa de 3 times de 3/i),
    ).toBeTruthy();
  });

  it('a busca filtra o elenco', () => {
    montar();
    fireEvent.change(screen.getByRole('searchbox', { name: /buscar no elenco/i }), {
      target: { value: 'cam' },
    });
    expect(screen.getByRole('checkbox', { name: 'Camila' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Rafa' })).toBeNull();
  });

  it('colar a lista marca quem já é do elenco e traz os novos já selecionados', () => {
    const { onSubmit } = montar({ format: 'tournament' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gus' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Camila' }));
    fireEvent.click(screen.getByRole('button', { name: /colar lista do whatsapp/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /lista colada/i }), {
      target: { value: '1. Rafa\n2. bia\n3. Joana\n4. Thiago' },
    });
    fireEvent.click(screen.getByRole('button', { name: /usar esta lista/i }));

    expect((screen.getByRole('checkbox', { name: 'Rafa' }) as HTMLInputElement).checked).toBe(true);
    const novos = screen.getByRole('list', { name: /novos na pelada/i });
    expect(within(novos).getByText('Joana')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /sortear/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      playerIds: ['p3', 'p4', 'p1', 'p2', 'p5'],
      novos: [{ name: 'Joana', level: 3, genero: 'M' }],
    });
  });

  it('com mais de uma comunidade, a pessoa escolhe onde a pelada fica', () => {
    const { onCommunityChange } = montar();
    fireEvent.change(screen.getByRole('combobox', { name: /comunidade/i }), {
      target: { value: 'c2' },
    });
    expect(onCommunityChange).toHaveBeenCalledWith('c2');
  });

  it('com uma comunidade só, não pergunta', () => {
    montar({ communities: [COMUNIDADES[0]] });
    expect(screen.queryByRole('combobox', { name: /comunidade/i })).toBeNull();
    expect(screen.getByText('Terça Forte')).toBeTruthy();
  });
});
