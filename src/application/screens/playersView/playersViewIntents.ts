import type { Player } from '@shared/types';

export type PlayersViewIntent =
  | { kind: 'back' }
  | { kind: 'addPlayer' }
  | { kind: 'editPlayer'; player: Player }
  | { kind: 'restoreDemoPlayers' }
  | { kind: 'addGuestPlayer'; player: Player; editDetails: boolean };
