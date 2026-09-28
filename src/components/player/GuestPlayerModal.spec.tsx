import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuestPlayerModal } from './GuestPlayerModal';
import type { Player } from '../../types';

describe('GuestPlayerModal', () => {
  it('does not render when isOpen is false', () => {
    render(
      <GuestPlayerModal isOpen={false} onClose={vi.fn()} players={[]} onAddGuestPlayer={vi.fn()} />,
    );
    expect(screen.queryByText(/adicionar convidado/i)).toBeNull();
  });

  it('renders modal with default guest fields when isOpen is true', () => {
    render(
      <GuestPlayerModal isOpen={true} onClose={vi.fn()} players={[]} onAddGuestPlayer={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: /cadastrar convidado rápido/i })).toBeDefined();
    expect(screen.getByPlaceholderText(/ex: carlos convidado/i)).toBeDefined();
  });

  it('submits a new guest player when name is provided', () => {
    const handleAddGuest = vi.fn();
    const handleClose = vi.fn();

    render(
      <GuestPlayerModal
        isOpen={true}
        onClose={handleClose}
        players={[]}
        onAddGuestPlayer={handleAddGuest}
        defaultCommunityId="c1"
      />,
    );

    const nameInput = screen.getByPlaceholderText(/ex: carlos convidado/i);
    fireEvent.change(nameInput, { target: { value: 'Lucas Convidado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Masculino' }));

    const submitBtn = screen.getByRole('button', { name: /salvar convidado/i });
    fireEvent.click(submitBtn);

    expect(handleAddGuest).toHaveBeenCalledTimes(1);
    expect(handleAddGuest.mock.calls[0][0].nome).toBe('Lucas Convidado');
    expect(handleAddGuest.mock.calls[0][0].isGuest).toBe(true);
    expect(handleClose).toHaveBeenCalled();
  });
  it('sem permissao, nao oferece editar os detalhes do convidado', () => {
    render(
      <GuestPlayerModal isOpen={true} onClose={vi.fn()} players={[]} onAddGuestPlayer={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /editar detalhes/i })).toBeNull();
    expect(screen.getByRole('button', { name: /salvar convidado/i })).toBeDefined();
  });

  it('com permissao, salvar e editar detalhes pede a edicao do convidado', () => {
    const handleAddGuest = vi.fn();
    render(
      <GuestPlayerModal
        isOpen={true}
        onClose={vi.fn()}
        players={[]}
        onAddGuestPlayer={handleAddGuest}
        canEditDetails
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/ex: carlos convidado/i), {
      target: { value: 'Lucas Convidado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Feminino' }));
    fireEvent.click(screen.getByRole('button', { name: /editar detalhes/i }));

    expect(handleAddGuest).toHaveBeenCalledTimes(1);
    expect(handleAddGuest.mock.calls[0][1]).toBe(true);
  });

  it('comeca sem genero marcado e nao salva sem genero', () => {
    const handleAddGuest = vi.fn();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(
      <GuestPlayerModal
        isOpen={true}
        onClose={vi.fn()}
        players={[]}
        onAddGuestPlayer={handleAddGuest}
      />,
    );

    expect(screen.getByRole('button', { name: 'Masculino' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Feminino' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    fireEvent.change(screen.getByPlaceholderText(/ex: carlos convidado/i), {
      target: { value: 'Lucas Convidado' },
    });
    fireEvent.click(screen.getByRole('button', { name: /salvar convidado/i }));

    expect(handleAddGuest).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Escolha o gênero do convidado.');
    alertSpy.mockRestore();
  });
});
