import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Community } from '@shared/types';
import { buildPlayersViewContract } from '@app/screens/playersView/playersViewContract';
import { makePlayer } from '../../test/fixtures';
import { PlayersView } from './PlayersView';

const community = { id: 'c1', name: 'Panelinha' } as Community;

function renderView(players = [makePlayer('p1', { nome: 'Ana Souza', communityIds: ['c1'] })]) {
  const onBack = vi.fn();
  render(
    <PlayersView
      contract={buildPlayersViewContract({
        roster: { community },
        players,
        communities: [community],
        games: [],
        pointEvents: [],
        teams: [],
        sessions: [],
        onBack,
      })}
    />,
  );
  return { onBack };
}

describe('PlayersView', () => {
  it('Pessoas so le: nao oferece cadastrar, convidado nem adicionar pelo nome', () => {
    renderView();

    expect(screen.queryByRole('button', { name: /cadastrar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /convidado/i })).toBeNull();
    expect(screen.queryByLabelText(/novo atleta/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /adicionar atleta/i })).toBeNull();
  });

  it('tocar num atleta com conta abre a carta VUT', () => {
    const { onBack } = renderView([
      makePlayer('p1', { nome: 'Ana Souza', communityIds: ['c1'], userId: 'u-ana' }),
    ]);

    fireEvent.click(screen.getByText('Ana Souza'));

    expect(screen.getByRole('button', { name: /fechar o card do atleta/i })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('tocar num convidado tambem abre a carta VUT', () => {
    renderView([makePlayer('p2', { nome: 'Bruno Lima', communityIds: ['c1'], userId: undefined })]);

    fireEvent.click(screen.getByText('Bruno Lima'));

    expect(screen.getByRole('button', { name: /fechar o card do atleta/i })).toBeTruthy();
  });

  it('elenco vazio nao oferece cadastrar', () => {
    renderView([]);

    expect(screen.getByText(/o elenco começa aqui/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /cadastrar/i })).toBeNull();
  });
});
