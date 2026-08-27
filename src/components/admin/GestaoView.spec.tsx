import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GestaoView } from './GestaoView';
import type { GestaoViewModel } from '@app/screens/gestaoView/gestaoViewModel';
import type { GestaoViewIntent } from '@app/screens/gestaoView/gestaoViewIntents';

vi.mock('../../hooks/useProfilesAdmin', () => ({
  useProfilesAdmin: () => ({
    profiles: [
      { id: 'u1', email: 'admin@example.com', role: 'master', username: 'admin' },
      { id: 'u2', email: 'user@example.com', role: 'user', username: 'jogador' },
    ],
    loading: false,
    error: null,
    savingId: null,
    changeRole: vi.fn(),
  }),
}));

describe('GestaoView', () => {
  it('renders admin management heading and user roles list', () => {
    const model: GestaoViewModel = {
      currentUserId: 'u1',
      isMaster: true,
    };
    const dispatch = vi.fn();

    render(<GestaoView contract={{ model, dispatch }} />);

    expect(screen.getByRole('heading', { name: /gestão/i })).toBeDefined();
    expect(screen.getByText(/usuários & papéis/i)).toBeDefined();
    expect(screen.getAllByText(/admin@example.com/i).length).toBeGreaterThan(0);
  });
});
