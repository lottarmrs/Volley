import type { Player, PlayerLinkProposal } from '../types';

export type AccountPlayerLinkState =
  | 'disabled'
  | 'anonymous'
  | 'checking'
  | 'linked'
  | 'pending'
  | 'check_failed'
  | 'ready';

export interface AccountPlayerLinkViewModel {
  state: AccountPlayerLinkState;
  linkedPlayer: Player | null;
  pendingProposal: PlayerLinkProposal | null;
  pendingPlayer: Player | null;
  availablePlayers: Player[];
  canRequestLink: boolean;
  canCancelPending: boolean;
}

export interface AccountPlayerLinkViewModelInput {
  user: { id: string } | null;
  isSupabaseConfigured: boolean;
  syncLoading: boolean;
  checkingLinkedPlayer: boolean;
  linkedPlayerCheckFailed: boolean;
  players: Player[];
  linkProposals: PlayerLinkProposal[];
  cloudLinkedPlayer: Player | null;
  cloudPendingProposal: PlayerLinkProposal | null;
}

export function buildAccountPlayerLinkViewModel(
  input: AccountPlayerLinkViewModelInput,
): AccountPlayerLinkViewModel {
  const availablePlayers = input.players.filter(
    (player) => !player.userId && !player.isGuest && player.ativo,
  );

  if (!input.isSupabaseConfigured) {
    return baseViewModel('disabled', availablePlayers);
  }

  if (!input.user) {
    return baseViewModel('anonymous', availablePlayers);
  }

  if (input.checkingLinkedPlayer || input.syncLoading) {
    return baseViewModel('checking', availablePlayers);
  }

  const localLinkedPlayer =
    input.players.find((player) => player.userId === input.user?.id) ?? null;
  const linkedPlayer = localLinkedPlayer ?? input.cloudLinkedPlayer;

  if (linkedPlayer) {
    return {
      ...baseViewModel('linked', availablePlayers),
      linkedPlayer,
    };
  }

  const localPendingProposal =
    input.linkProposals.find(
      (proposal) => proposal.userId === input.user?.id && proposal.status === 'pending',
    ) ?? null;
  const pendingProposal = localPendingProposal ?? input.cloudPendingProposal;

  if (pendingProposal) {
    const pendingPlayer =
      input.players.find(
        (player) =>
          player.id === pendingProposal.playerId ||
          (!!player.cloudId &&
            !!pendingProposal.playerCloudId &&
            player.cloudId === pendingProposal.playerCloudId),
      ) ?? null;

    return {
      ...baseViewModel('pending', availablePlayers),
      pendingProposal,
      pendingPlayer,
      canCancelPending: true,
    };
  }

  if (input.linkedPlayerCheckFailed) {
    return baseViewModel('check_failed', availablePlayers);
  }

  return {
    ...baseViewModel('ready', availablePlayers),
    canRequestLink: availablePlayers.length > 0,
  };
}

function baseViewModel(
  state: AccountPlayerLinkState,
  availablePlayers: Player[],
): AccountPlayerLinkViewModel {
  return {
    state,
    linkedPlayer: null,
    pendingProposal: null,
    pendingPlayer: null,
    availablePlayers,
    canRequestLink: false,
    canCancelPending: false,
  };
}
