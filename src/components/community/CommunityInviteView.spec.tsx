import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { CommunityInviteState } from '@app/communityInviteUseCases';
import { CommunityInviteView } from './CommunityInviteView';

const grupo = {
  id: 'c-1',
  name: 'Terça Forte',
  description: null,
  memberCount: 18,
  myStatus: null,
};

function renderView(state: CommunityInviteState, onRequest = vi.fn()) {
  render(
    <MemoryRouter>
      <CommunityInviteView state={state} busy={false} onRequest={onRequest} />
    </MemoryRouter>,
  );
  return onRequest;
}

describe('CommunityInviteView', () => {
  it('carregando mostra a forma do cartão, não um texto solto', () => {
    render(
      <MemoryRouter>
        <CommunityInviteView state={{ kind: 'loading' }} busy={false} onRequest={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('o nome do grupo é a primeira coisa: responde "é o racha certo?"', () => {
    renderView({ kind: 'canRequest', community: grupo });
    expect(screen.getByRole('heading', { name: /terça forte/i })).toBeDefined();
    expect(screen.getByText(/18/)).toBeDefined();
  });

  it('pedir entrada é um toque', () => {
    const onRequest = renderView({ kind: 'canRequest', community: grupo });
    fireEvent.click(screen.getByRole('button', { name: /pedir para entrar/i }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('não promete vaga na pelada, porque a lista tem ordem de chegada', () => {
    renderView({ kind: 'canRequest', community: grupo });
    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/sua vaga está garantida|vaga garantida/i);
  });

  it('pendente diz quem resolve, e não repete o botão', () => {
    renderView({ kind: 'pending', community: { ...grupo, myStatus: 'pending' } });
    expect(screen.getByText(/aprova/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /pedir para entrar/i })).toBeNull();
  });

  it('quem já é do grupo recebe o caminho, não um convite', () => {
    renderView({
      kind: 'alreadyMember',
      community: { ...grupo, myStatus: 'active' },
      to: '/comunidades/c-1/sessoes/s-9/inscricao',
    });
    const link = screen.getByRole('link', { name: /ir para a pelada|abrir/i });
    expect(link.getAttribute('href')).toBe('/comunidades/c-1/sessoes/s-9/inscricao');
  });

  it('recusado ou suspenso não ganha botão que produziria a mesma recusa', () => {
    renderView({ kind: 'blocked', community: { ...grupo, myStatus: 'rejected' } });
    expect(screen.queryByRole('button', { name: /pedir para entrar/i })).toBeNull();
    expect(screen.getByText(/quem administra/i)).toBeDefined();
  });

  it('código inválido tem saída, não beco', () => {
    renderView({ kind: 'invalid', message: 'Este convite não vale mais.' });
    expect(screen.getByText(/não vale mais/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /minhas comunidades|voltar/i })).toBeDefined();
  });

  it('não disputa o h1 com o cabeçalho do app', () => {
    renderView({ kind: 'canRequest', community: grupo });
    expect(document.querySelectorAll('h1').length).toBe(0);
    expect(screen.getByRole('heading', { level: 2, name: /terça forte/i })).toBeDefined();
  });
});
