import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Community } from '@shared/types';
import { buildPlayersViewContract } from '@app/screens/playersView/playersViewContract';
import { makePlayer } from '../../test/fixtures';
import { PlayersView } from './PlayersView';

const community = { id: 'c1', name: 'Panelinha' } as Community;

function renderView(
  players = [makePlayer('p1', { nome: 'Ana Souza', communityIds: ['c1'] })],
  roster: { canEvaluate?: boolean; currentUserId?: string | null; cloudId?: string } = {},
) {
  const onBack = vi.fn();
  render(
    <PlayersView
      contract={buildPlayersViewContract({
        roster: {
          community: roster.cloudId ? { ...community, cloudId: roster.cloudId } : community,
          canEvaluate: roster.canEvaluate,
          currentUserId: roster.currentUserId,
        },
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

  describe('aba Avaliação na carta', () => {
    const atleta = makePlayer('p1', {
      nome: 'Ana Souza',
      communityIds: ['c1'],
      cloudId: 'cp1',
      userId: 'u-ana',
    });

    function abrir() {
      fireEvent.click(screen.getByText('Ana Souza'));
    }

    it('quem avalia ve a aba na carta de outro', () => {
      renderView([atleta], { canEvaluate: true, currentUserId: 'u-outro', cloudId: 'cc1' });
      abrir();
      expect(screen.queryAllByRole('button', { name: /avaliação/i }).length).toBeGreaterThan(0);
    });

    it('o proprio atleta ve a aba na carta dele', () => {
      renderView([atleta], { canEvaluate: false, currentUserId: 'u-ana', cloudId: 'cc1' });
      abrir();
      expect(screen.queryAllByRole('button', { name: /avaliação/i }).length).toBeGreaterThan(0);
    });

    it('outro membro nao ve a aba', () => {
      renderView([atleta], { canEvaluate: false, currentUserId: 'u-outro', cloudId: 'cc1' });
      abrir();
      expect(screen.queryAllByRole('button', { name: /avaliação/i })).toHaveLength(0);
    });
  });
});
