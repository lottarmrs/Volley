import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GuestPlayerModal } from './GuestPlayerModal';
import type { Player } from '../../types';

describe('GuestPlayerModal', () => {
  it('does not render when isOpen is false', () => {
    render(
      <GuestPlayerModal
        isOpen={false}
        onClose={vi.fn()}
        players={[]}
        onAddGuestPlayer={vi.fn()}
      />,
    );
    expect(screen.queryByText(/adicionar convidado/i)).toBeNull();
  });

  it('renders modal with default guest fields when isOpen is true', () => {
    render(
      <GuestPlayerModal
        isOpen={true}
        onClose={vi.fn()}
        players={[]}
        onAddGuestPlayer={vi.fn()}
      />,
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

    const submitBtn = screen.getByRole('button', { name: /salvar convidado/i });
    fireEvent.click(submitBtn);

    expect(handleAddGuest).toHaveBeenCalledTimes(1);
    expect(handleAddGuest.mock.calls[0][0].nome).toBe('Lucas Convidado');
    expect(handleAddGuest.mock.calls[0][0].isGuest).toBe(true);
    expect(handleClose).toHaveBeenCalled();
  });
});
