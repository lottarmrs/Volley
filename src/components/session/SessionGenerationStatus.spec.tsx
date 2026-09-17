import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionGenerationStatus } from './SessionGenerationStatus';

describe('SessionGenerationStatus', () => {
  it('shows the chain stage with an indeterminate bar and no percentage', () => {
    const { container } = render(
      <SessionGenerationStatus stage="roster" progress={0} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('Confirmando o elenco…')).toBeDefined();
    expect(screen.queryByText('0%')).toBeNull();
    expect(container.querySelector('progress')?.hasAttribute('value')).toBe(false);
  });

  it('shows balancing with the percentage once the chain is done', () => {
    const { container } = render(
      <SessionGenerationStatus stage={null} progress={40} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('Equilibrando os times…')).toBeDefined();
    expect(screen.getByText('40%')).toBeDefined();
    expect(container.querySelector('progress')?.getAttribute('value')).toBe('40');
  });

  it('cancels', () => {
    const onCancel = vi.fn();
    render(<SessionGenerationStatus stage="session" progress={0} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
