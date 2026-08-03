import type { Division, Player, Session } from '@shared/types';

export type SessionWizardIntent =
  | { kind: 'next' }
  | { kind: 'prev' }
  | { kind: 'cancel' }
  | { kind: 'updateSession'; patch: Partial<Session> }
  | { kind: 'togglePlayer'; id: string }
  | { kind: 'selectAllActive' }
  | { kind: 'clearSelection' }
  | { kind: 'useLastSelection' }
  | { kind: 'generateDivisions'; advanceStep?: boolean }
  | { kind: 'cancelGeneration' }
  | { kind: 'confirmDivision' }
  | { kind: 'startGeneratedTournament' }
  | { kind: 'selectDivisionIndex'; index: number }
  | { kind: 'togglePlayerLock'; playerId: string; teamIdx: number }
  | { kind: 'addPairConstraint'; p1: string; p2: string; type: 'together' | 'separated' }
  | { kind: 'removePairConstraint'; p1: string; p2: string; type: 'together' | 'separated' }
  | { kind: 'setBestDivisions'; divisions: Division[] }
  | { kind: 'addGuestPlayer'; player: Player; editDetails: boolean };
