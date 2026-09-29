import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeSession } from '../../test/fixtures';
import { TournamentsModule } from './TournamentsModule';

const aoVivo = makeSession('t1', { type: 'tournament', status: 'active', name: 'Copa' });

function renderModule(canManage: boolean) {
  const onNewTournament = vi.fn();
  const onOpenTournament = vi.fn();
  render(
    <TournamentsModule
      sessions={[aoVivo]}
      games={[]}
      teams={[]}
      sessionReports={[]}
      onNewTournament={onNewTournament}
      onOpenTournament={onOpenTournament}
      canManage={canManage}
    />,
  );
  return { onNewTournament, onOpenTournament };
}

describe('TournamentsModule', () => {
  it('quem nao organiza nao cria torneio nem abre ao vivo', () => {
    const { onOpenTournament } = renderModule(false);
    expect(screen.queryByRole('button', { name: /novo torneio/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ver detalhes/i }));
    expect(onOpenTournament).toHaveBeenCalledWith(aoVivo, false);
  });

  it('quem organiza cria torneio e abre ao vivo', () => {
    const { onOpenTournament } = renderModule(true);
    expect(screen.getByRole('button', { name: /novo torneio/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ver detalhes/i }));
    expect(onOpenTournament).toHaveBeenCalledWith(aoVivo, true);
  });
});
