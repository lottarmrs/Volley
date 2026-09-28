import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { paths } from '@app/appRoutes';
import type { Community } from '../../../types';
import { CommunityOverviewArea } from './CommunityOverviewArea';

const community: Community = {
  id: 'community-1',
  name: 'Vôlei de terça',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
};

function renderVazia(canManageRoster: boolean) {
  return render(
    <MemoryRouter>
      <CommunityOverviewArea
        community={community}
        players={[]}
        sessions={[]}
        games={[]}
        pointEvents={[]}
        sessionReports={[]}
        onCreateSession={vi.fn()}
        canManageRoster={canManageRoster}
      />
    </MemoryRouter>,
  );
}

describe('CommunityOverviewArea sem elenco', () => {
  it('leva quem pode montar o elenco para Convidados, nao para Pessoas', () => {
    renderVazia(true);
    const link = screen.getByRole('link', { name: /montar o elenco/i });
    expect(link.getAttribute('href')).toBe(paths.convidados(community.id));
  });
});
