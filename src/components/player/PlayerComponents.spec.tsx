import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayerItem } from './PlayerComponents';
import type { Player } from '../../types';
import { makePlayer } from '../../test/fixtures';

// Exactly what reaches the UI for a player created together with an account:
// ensure_account_ready inserts only owner_id/user_id/name/username, so the DB
// defaults apply (attributes/forma_atual/profile/status all '{}'::jsonb,
// primary_position null) and mapDbToPlayer passes them straight through.
function accountCreatedPlayer(): Player {
  return makePlayer('565a23e5-8b3e-4a3f-bc47-1803e1f46b4d', {
    nome: 'TESTEADM',
    apelido: '',
    genero: null,
    posicaoPrincipal: null,
    // These fields are genuinely `{}` on the wire for an account-created player —
    // the DB's jsonb defaults, not a typed Player value. That's the precondition
    // under test, so the cast is the point, not a shortcut around it.
    atributos: {} as Player['atributos'],
    perfil: {} as Player['perfil'],
    formaAtual: {} as Player['formaAtual'],
    status: {} as Player['status'],
  });
}

describe('PlayerItem', () => {
  it('renders a player that has no position, attributes or form', () => {
    // Regression: calculatePositionOverall(player, null) did
    // Object.entries(POSITION_WEIGHTS[null]) and threw, so one such player took the
    // whole Atletas tab down to a black screen.
    expect(() => render(<PlayerItem player={accountCreatedPlayer()} />)).not.toThrow();
    expect(screen.getByText('TESTEADM')).toBeTruthy();
  });

  it('does not invent a gender for a player who has none', () => {
    // The card used `genero === 'M' ? 'Masculino' : 'Feminino'`, so a null gender —
    // every account-created player — was labelled Feminino.
    render(<PlayerItem player={accountCreatedPlayer()} />);

    expect(screen.queryByText(/feminino/i)).toBeNull();
    expect(screen.queryByText(/masculino/i)).toBeNull();
    expect(screen.getByText(/não informado/i)).toBeTruthy();
  });

  it('still shows a declared gender', () => {
    render(<PlayerItem player={{ ...accountCreatedPlayer(), genero: 'F' }} />);

    expect(screen.getByText(/feminino/i)).toBeTruthy();
  });

  it('never emits NaN into the DOM for an empty player', () => {
    // NaN reached the DOM as a style width and as card text, which is what produced
    // the "Received NaN for the children attribute" React warnings.
    const { container } = render(<PlayerItem player={accountCreatedPlayer()} />);

    expect(container.innerHTML).not.toMatch(/NaN/);
  });
});
