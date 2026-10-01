import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { peladaNextStep } from '@app/peladaNextStep';
import { PeladaNextStepCard } from './PeladaNextStepCard';

describe('PeladaNextStepCard', () => {
  it('mostra o estado, a etapa atual e dispara o proximo passo', () => {
    const onAction = vi.fn();
    render(
      <PeladaNextStepCard
        step={peladaNextStep({
          status: 'draft',
          windowStatus: 'LOCKED',
          confirmed: 16,
          capacity: 18,
          canManage: true,
        })}
        busy={false}
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Lista fechada · 16 jogam');
    expect(screen.getByText('Lista').getAttribute('aria-current')).toBe('step');
    fireEvent.click(screen.getByRole('button', { name: 'Sortear os times' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir a lista' }));
    expect(onAction.mock.calls.map(([kind]) => kind)).toEqual(['sortear', 'reabrir_lista']);
  });

  it('enquanto grava, os botoes ficam travados', () => {
    render(
      <PeladaNextStepCard
        step={peladaNextStep({
          status: 'teams_generated',
          windowStatus: 'LOCKED',
          confirmed: 12,
          capacity: 12,
          canManage: true,
        })}
        busy
        onAction={() => {}}
      />,
    );
    expect(
      (screen.getByRole('button', { name: 'Começar a pelada' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText('Sorteio').getAttribute('aria-current')).toBe('step');
  });
});
