import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CareerTimeline } from './CareerTimeline';
import type { CareerEvent } from '../../shared/types/career';

function milestone(slug: string, at: string): CareerEvent {
  return {
    id: `e-${slug}`,
    playerId: 'p1',
    communityId: null,
    sessionId: null,
    type: 'milestone',
    occurredAt: at,
    payload: { slug },
    contractVersion: 1,
  };
}

describe('CareerTimeline', () => {
  it('lists milestones newest first', () => {
    render(
      <CareerTimeline
        events={[
          milestone('first_session', '2026-01-01T00:00:00Z'),
          milestone('first_win', '2026-02-01T00:00:00Z'),
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/primeira vitoria/i);
    expect(items[1].textContent).toMatch(/primeira sessao/i);
  });

  it('renders an empty state instead of crashing with no career', () => {
    render(<CareerTimeline events={[]} />);
    expect(screen.getByText(/nenhum marco/i)).toBeTruthy();
  });

  it('ignores session rollups, showing only milestones', () => {
    const rollup: CareerEvent = {
      id: 'e-s1', playerId: 'p1', communityId: null, sessionId: 's1',
      type: 'session_played', occurredAt: '2026-03-01T00:00:00Z',
      payload: { points: 10 }, contractVersion: 1,
    };
    render(<CareerTimeline events={[rollup, milestone('first_win', '2026-02-01T00:00:00Z')]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
