import type { Player } from '@shared/types';

export type PlayerEditViewIntent =
  | { kind: 'setEditingPlayer'; player: Player | null }
  | { kind: 'setShowDeleteConfirm'; value: boolean }
  | { kind: 'back' }
  | { kind: 'save' }
  | { kind: 'delete' };
