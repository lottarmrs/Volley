import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { CommunityAreaTabs } from '../../components/community/areas/CommunityAreaTabs';

describe('CommunityAreaTabs', () => {
  it('desenha uma aba por subárea, com link e a ativa marcada', () => {
    render(
      <MemoryRouter initialEntries={['/comunidades/c1/gestao/regras']}>
        <Routes>
          <Route
            path="/comunidades/:communityId/gestao/regras"
            element={
              <CommunityAreaTabs
                items={[
                  { to: '/comunidades/c1/gestao', label: 'Membros', active: false },
                  { to: '/comunidades/c1/gestao/regras', label: 'Regras', active: true },
                  { to: '/comunidades/c1/gestao/dados', label: 'Dados', active: false },
                ]}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    const abas = screen.getAllByRole('tab');
    expect(abas.map((aba) => aba.textContent)).toEqual(['Membros', 'Regras', 'Dados']);
    expect(abas[1].getAttribute('aria-selected')).toBe('true');
    expect(abas[0].getAttribute('href')).toBe('/comunidades/c1/gestao');
  });
});
