import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StarRating, getStarLabelText } from './StarRating';

describe('StarRating', () => {
  it('formats rating labels correctly', () => {
    expect(getStarLabelText(0)).toBe('Não Avaliado');
    expect(getStarLabelText(1)).toBe('Iniciante / Recreativo');
    expect(getStarLabelText(3)).toBe('Regular / Mediano');
    expect(getStarLabelText(5)).toBe('Destaque / Nível Seleção');
  });

  it('renders rating stars with active value label', () => {
    render(<StarRating value={4} />);
    expect(screen.getByText('Avançado')).toBeDefined();
  });

  it('triggers onChange when star is clicked', () => {
    const handleChange = vi.fn();
    render(<StarRating value={3} onChange={handleChange} />);
    
    const stars = screen.getAllByRole('button');
    expect(stars).toHaveLength(5);
    
    fireEvent.click(stars[4]); // 5th star
    expect(handleChange).toHaveBeenCalled();
  });
});
