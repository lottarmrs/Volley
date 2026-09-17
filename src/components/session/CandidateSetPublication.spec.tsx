import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateSetPublication } from './CandidateSetPublication';

describe('CandidateSetPublication', () => {
  it('publishes when idle', () => {
    const onPublish = vi.fn();
    render(<CandidateSetPublication state="idle" error={null} onPublish={onPublish} />);
    fireEvent.click(screen.getByRole('button', { name: /Publicar/ }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('disables the button while publishing', () => {
    render(<CandidateSetPublication state="publishing" error={null} onPublish={vi.fn()} />);
    expect((screen.getByRole('button', { name: /Publicando/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('shows published without a button', () => {
    render(<CandidateSetPublication state="published" error={null} onPublish={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('Publicado');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the error and keeps the button to try again', () => {
    const onPublish = vi.fn();
    render(
      <CandidateSetPublication
        state="error"
        error="O elenco mudou em outro aparelho. Tente de novo."
        onPublish={onPublish}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'O elenco mudou em outro aparelho. Tente de novo.',
    );
    fireEvent.click(screen.getByRole('button', { name: /Publicar/ }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });
});
