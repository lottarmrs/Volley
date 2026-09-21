import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { GuardedLink, UnsavedGuardHost } from './GuardedLink';
import { useUnsavedGuard } from '../community/unsavedGuard';

function Formulario({ dirty, save }: { dirty: boolean; save: () => void }) {
  useUnsavedGuard({ dirty, save, label: 'Regras' });
  return <p>formulário</p>;
}

function Tela({ dirty, save }: { dirty: boolean; save: () => void }) {
  return (
    <MemoryRouter initialEntries={['/a']}>
      <UnsavedGuardHost>
        <GuardedLink to="/b">Ir para B</GuardedLink>
        <Routes>
          <Route path="/a" element={<Formulario dirty={dirty} save={save} />} />
          <Route path="/b" element={<p>destino</p>} />
        </Routes>
      </UnsavedGuardHost>
    </MemoryRouter>
  );
}

describe('GuardedLink', () => {
  it('navega direto quando não há alteração pendente', () => {
    render(<Tela dirty={false} save={vi.fn()} />);
    fireEvent.click(screen.getByRole('link', { name: 'Ir para B' }));
    expect(screen.getByText('destino')).toBeDefined();
  });

  it('pergunta antes de sair, nomeando onde está o trabalho', () => {
    render(<Tela dirty save={vi.fn()} />);
    fireEvent.click(screen.getByRole('link', { name: 'Ir para B' }));
    expect(screen.getByRole('dialog').textContent).toContain('Regras');
    expect(screen.queryByText('destino')).toBeNull();
  });

  it('salvar guarda o rascunho e segue', () => {
    const save = vi.fn();
    render(<Tela dirty save={save} />);
    fireEvent.click(screen.getByRole('link', { name: 'Ir para B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e sair' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByText('destino')).toBeDefined();
  });

  it('descartar segue sem salvar, e cancelar fica onde está', () => {
    const save = vi.fn();
    const { unmount } = render(<Tela dirty save={save} />);
    fireEvent.click(screen.getByRole('link', { name: 'Ir para B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair sem salvar' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('destino')).toBeDefined();
    unmount();

    render(<Tela dirty save={save} />);
    fireEvent.click(screen.getByRole('link', { name: 'Ir para B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.queryByText('destino')).toBeNull();
    expect(screen.getByText('formulário')).toBeDefined();
  });
});
