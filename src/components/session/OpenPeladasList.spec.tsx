import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Session } from '@shared/types';
import { makeSession } from '../../test/fixtures';
import { OpenPeladasList } from './OpenPeladasList';

const ONTEM = makeSession('s1', {
  communityId: 'c1',
  name: 'Inimigos · ter 30/09',
  date: '2026-09-30',
  status: 'draft',
} as Partial<Session>);
const ROLANDO = makeSession('s2', {
  communityId: 'c1',
  name: 'Inimigos · qua 01/10',
  date: '2026-10-01',
  status: 'active',
} as Partial<Session>);

describe('peladas em aberto', () => {
  it('lista cada uma com a situação e leva para a tela da pelada', () => {
    render(
      <MemoryRouter>
        <OpenPeladasList communityId="c1" sessions={[ONTEM, ROLANDO]} today="2026-10-01" />
      </MemoryRouter>,
    );
    const lista = screen.getByRole('list', { name: /em aberto/i });
    const links = within(lista).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/comunidades/c1/sessoes/s1/inscricao',
      '/comunidades/c1/sessoes/s2/inscricao',
    ]);
    expect(within(links[0]).getByText(/passou da data/i)).toBeTruthy();
    expect(within(links[1]).getByText(/rolando agora/i)).toBeTruthy();
  });

  it('sem nada em aberto, não ocupa espaço', () => {
    const { container } = render(
      <MemoryRouter>
        <OpenPeladasList communityId="c1" sessions={[]} today="2026-10-01" />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });
});
