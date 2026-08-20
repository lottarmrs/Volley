import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickStartView } from './QuickStartView';

describe('QuickStartView', () => {
  it('renders initial list input form', () => {
    render(<QuickStartView onSortear={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /quem vai jogar hoje\?/i })).toBeDefined();
    expect(screen.getByLabelText('Lista de atletas')).toBeDefined();
  });

  it('moves to triage screen when valid player list is entered', () => {
    render(<QuickStartView onSortear={vi.fn()} />);

    const textarea = screen.getByLabelText('Lista de atletas');
    fireEvent.change(textarea, { target: { value: '1. Rafa\n2. Bia\n3. Gustavo\n4. Camila' } });

    const continueBtn = screen.getByRole('button', { name: /continuar/i });
    fireEvent.click(continueBtn);

    expect(screen.getByRole('heading', { name: /como cada um joga\?/i })).toBeDefined();
    expect(screen.getByText('Rafa')).toBeDefined();
    expect(screen.getByText('Bia')).toBeDefined();
  });

  it('displays correct counts of men and women', () => {
    render(<QuickStartView onSortear={vi.fn()} />);

    const textarea = screen.getByLabelText('Lista de atletas');
    fireEvent.change(textarea, { target: { value: 'Rafa\nBia\nGustavo\nCamila' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // Default entries are 'M', so 4 homens 0 mulheres initially
    expect(screen.getByText(/4 homens/i)).toBeDefined();

    // Toggle Bia to 'F'
    const femaleButtons = screen.getAllByRole('button', { name: /marcar bia como mulher/i });
    fireEvent.click(femaleButtons[0]);

    expect(screen.getByText(/3 homens/i)).toBeDefined();
    expect(screen.getByText(/1 mulher/i)).toBeDefined();
  });

  it('calls onSortear when sortear button is clicked', () => {
    const handleSortear = vi.fn();
    render(<QuickStartView onSortear={handleSortear} />);

    const textarea = screen.getByLabelText('Lista de atletas');
    fireEvent.change(textarea, { target: { value: 'Rafa\nBia\nGustavo\nCamila' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    const sortearBtn = screen.getByRole('button', { name: /sortear/i });
    fireEvent.click(sortearBtn);

    expect(handleSortear).toHaveBeenCalledTimes(1);
    expect(handleSortear.mock.calls[0][0]).toHaveLength(4);
  });
});
