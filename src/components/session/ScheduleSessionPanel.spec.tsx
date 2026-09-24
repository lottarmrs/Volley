import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleSessionPanel } from './ScheduleSessionPanel';

function renderPanel(overrides: Partial<Parameters<typeof ScheduleSessionPanel>[0]> = {}) {
  const onSchedule = vi.fn();
  render(
    <MemoryRouter>
      <ScheduleSessionPanel
        communityId="c-1"
        sessionId="s-1"
        isScheduled={false}
        error={null}
        onSchedule={onSchedule}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return onSchedule;
}

describe('ScheduleSessionPanel', () => {
  it('oferece marcar a pelada sem pedir atleta nenhum', () => {
    const onSchedule = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /marcar pelada/i }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it('depois de marcada, o caminho é abrir a lista', () => {
    renderPanel({ isScheduled: true });
    expect(screen.queryByRole('button', { name: /marcar pelada/i })).toBeNull();
    const link = screen.getByRole('link', { name: /lista de presença/i });
    expect(link.getAttribute('href')).toBe('/comunidades/c-1/sessoes/s-1/inscricao');
  });

  it('a recusa aparece onde a pessoa está, não num canto', () => {
    renderPanel({ error: 'Essa data já passou. Escolha hoje ou um dia à frente.' });
    expect(screen.getByRole('alert').textContent).toMatch(/já passou/i);
  });

  it('em modo compacto explica por que está ali, ao lado do erro de atletas', () => {
    renderPanel({ compact: true });
    expect(screen.getByText(/sem escolher atleta/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /marcar pelada/i })).toBeDefined();
  });

  it('sem comunidade não oferece nada: a lista é do grupo', () => {
    const { container } = render(
      <MemoryRouter>
        <ScheduleSessionPanel
          communityId={null}
          sessionId="s-1"
          isScheduled={false}
          error={null}
          onSchedule={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });
});
