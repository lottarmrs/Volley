import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Community } from '../../../types';
import { CommunityDataArea } from './CommunityDataArea';

const community: Community = {
  id: 'community-1',
  name: 'Vôlei de terça',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
};

function renderArea(overrides: Partial<ComponentProps<typeof CommunityDataArea>> = {}) {
  return render(
    <CommunityDataArea
      community={community}
      players={[]}
      sessions={[]}
      onUpdateCommunity={vi.fn(() => true)}
      onDeleteCommunity={vi.fn()}
      onDuplicateCommunity={vi.fn()}
      onClearCommunityHistory={vi.fn()}
      canEditRules={false}
      canDeleteCommunity={false}
      canClearHistory={false}
      {...overrides}
    />,
  );
}

describe('CommunityDataArea', () => {
  it('esconde exportar e duplicar de quem nao pode exportar', () => {
    renderArea({ canExportCommunity: false });

    expect(screen.queryByRole('button', { name: /exportar comunidade/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /duplicar comunidade/i })).toBeNull();
  });

  it('mostra exportar e duplicar para quem pode', () => {
    renderArea({ canExportCommunity: true });

    expect(screen.getByRole('button', { name: /exportar comunidade/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /duplicar comunidade/i })).toBeTruthy();
  });

  it('duplicar copia so a comunidade, sem atletas', () => {
    const onDuplicateCommunity = vi.fn();
    renderArea({ canExportCommunity: true, onDuplicateCommunity });

    fireEvent.click(screen.getByRole('button', { name: /duplicar comunidade/i }));

    expect(onDuplicateCommunity).toHaveBeenCalledWith('community-1');
    expect(onDuplicateCommunity.mock.calls[0]).toHaveLength(1);
    expect(screen.queryByText(/com atletas/i)).toBeNull();
  });

  it('sem a permissao declarada, nao exporta', () => {
    renderArea();

    expect(screen.queryByRole('button', { name: /exportar comunidade/i })).toBeNull();
  });
});
