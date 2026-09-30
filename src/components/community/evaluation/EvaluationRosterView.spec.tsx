import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { buildEvaluationRosterView } from '@app/evaluationRosterViewModel';
import { EvaluationRosterView } from './EvaluationRosterView';

const base = {
  playerId: 'p',
  name: 'Nome',
  nickname: null,
  position: 'ponteiro',
  hasAccount: true,
  myLastEvaluatedAt: null,
  isSelf: false,
};

function renderView(overrides: Partial<ComponentProps<typeof EvaluationRosterView>> = {}) {
  const onOpen = vi.fn();
  render(
    <MemoryRouter>
      <EvaluationRosterView
        state="ready"
        view={buildEvaluationRosterView([
          { ...base, playerId: 'a', name: 'Ana' },
          {
            ...base,
            playerId: 'b',
            name: 'Bia',
            hasAccount: false,
            myLastEvaluatedAt: '2026-09-20T10:00:00Z',
          },
        ])}
        canDesignate
        managementPath="/comunidades/c1/gestao"
        onOpen={onOpen}
        onRetry={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { onOpen };
}

describe('EvaluationRosterView', () => {
  it('mostra o progresso, os pendentes antes dos avaliados e o selo sem conta', () => {
    renderView();
    expect(screen.getByText('Você avaliou 1 de 2 atletas')).toBeTruthy();
    const itens = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(itens[0]).toContain('Ana');
    expect(itens[1]).toContain('Bia');
    expect(itens[1]).toContain('sem conta');
  });

  it('tocar num atleta abre o formulario dele', () => {
    const { onOpen } = renderView();
    fireEvent.click(screen.getByRole('button', { name: /ana/i }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('a propria ficha aparece como autoavaliacao provisoria, com o convite para designar', () => {
    renderView({
      view: buildEvaluationRosterView([{ ...base, playerId: 'eu', name: 'Eu', isSelf: true }]),
    });
    expect(screen.getByText(/autoavaliação provisória/i)).toBeTruthy();
    expect(screen.getByText(/vale até alguém avaliar você/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /deixar alguém avaliar/i }).getAttribute('href')).toBe(
      '/comunidades/c1/gestao',
    );
  });

  it('vazio e completo dizem o que aconteceu', () => {
    const { unmount } = render(
      <MemoryRouter>
        <EvaluationRosterView
          state="ready"
          view={buildEvaluationRosterView([])}
          canDesignate={false}
          managementPath="/g"
          onOpen={vi.fn()}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Ninguém no elenco ainda.')).toBeTruthy();
    unmount();

    renderView({
      view: buildEvaluationRosterView([{ ...base, myLastEvaluatedAt: '2026-09-20T10:00:00Z' }]),
    });
    expect(screen.getByText(/todos avaliados/i)).toBeTruthy();
  });

  it('sem conexao', () => {
    renderView({ state: 'offline', view: undefined });
    expect(screen.getByText('A avaliação precisa de conexão.')).toBeTruthy();
  });

  it('comunidade ainda sem copia no banco', () => {
    renderView({ state: 'not_synced', view: undefined });
    expect(screen.getByText('Ainda salvando no banco. Tente em instantes.')).toBeTruthy();
  });

  it('erro oferece tentar de novo', () => {
    const onRetry = vi.fn();
    renderView({ state: 'error', view: undefined, errorMessage: 'Falhou.', onRetry });
    expect(screen.getByRole('alert').textContent).toContain('Falhou.');
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
