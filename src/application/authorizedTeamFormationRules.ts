import type {
  Community,
  FormationParticipant,
  Player,
  Session,
  TeamFormationRequest,
} from '@shared/types';
import type { RosterRevisionRead } from './authorizedFormationGateways';
import {
  appOk,
  conflictError,
  offlineError,
  productError,
  technicalError,
  unexpectedError,
  type AppErrorResult,
  type AppResult,
} from './appResult';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NETWORK_FAILURE = /Failed to fetch|NetworkError|Load failed|fetch failed/i;

export type FormationAuthority =
  | { readonly kind: 'local' }
  | { readonly kind: 'authorized'; readonly communityCloudId: string | null };

export function classifyFormationAuthority(
  session: Session,
  communities: readonly Community[],
): FormationAuthority {
  const community = session.communityId
    ? communities.find((item) => item.id === session.communityId)
    : undefined;
  const communityCloudId =
    community?.cloudId && UUID_PATTERN.test(community.cloudId) ? community.cloudId : null;
  if (session.authorityModel === 'target') return { kind: 'authorized', communityCloudId };
  if (!communityCloudId) return { kind: 'local' };
  if (session.cloudId) return { kind: 'local' };
  return { kind: 'authorized', communityCloudId };
}

function displayName(player: Player): string {
  return player.apelido?.trim() || player.nome;
}

export function formatPlayerNames(players: readonly Player[]): string {
  const names = players.map(displayName);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export function precheckAuthorizedSelection(
  session: Session,
  players: readonly Player[],
): AppResult<Player[]> {
  const byId = new Map(players.map((player) => [player.id, player]));
  const selected = session.selectedPlayerIds
    .map((id) => byId.get(id))
    .filter((player): player is Player => player !== undefined);

  const unsynced = selected.filter((player) => !player.cloudId);
  if (unsynced.length > 0) {
    return productError(
      'invalid_input',
      `Sincronize antes de gerar os times: ${formatPlayerNames(unsynced)} ainda não estão na nuvem.`,
    );
  }

  const communityId = session.communityId ?? '';
  const outside = selected.filter((player) => !(player.communityIds ?? []).includes(communityId));
  if (outside.length > 0) {
    return productError(
      'invalid_input',
      `${formatPlayerNames(outside)} não fazem parte desta comunidade.`,
    );
  }

  return appOk(selected);
}

export function rekeyAuthorizedRequest(
  request: TeamFormationRequest,
  roster: RosterRevisionRead,
  players: readonly Player[],
): TeamFormationRequest | null {
  const localByCloudId = new Map(
    players
      .filter((player) => player.cloudId)
      .map((player) => [(player.cloudId as string).toLowerCase(), player.id]),
  );
  const localByParticipant = new Map<string, string>();
  for (const entry of roster.entries) {
    const localId = entry.playerId ? localByCloudId.get(entry.playerId.toLowerCase()) : undefined;
    if (localId) localByParticipant.set(entry.participantId, localId);
  }

  const participants: FormationParticipant[] = [];
  for (const participant of request.participants) {
    const localId = localByParticipant.get(participant.participantId);
    if (!localId) return null;
    participants.push({ ...participant, participantId: localId });
  }
  return { ...request, participants };
}

export class AuthorizedFormationFailure extends Error {
  constructor(
    readonly step: string,
    readonly reason: unknown,
    readonly player?: Player,
  ) {
    super(step);
    this.name = 'AuthorizedFormationFailure';
  }
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message?: unknown };
    return typeof message === 'string' ? message : '';
  }
  return '';
}

export function classifyAuthorizedFormationFailure(
  failure: AuthorizedFormationFailure,
): AppErrorResult {
  const code = errorCode(failure.reason);
  const message = errorMessage(failure.reason);

  if (failure.step === 'rekey') {
    return unexpectedError(
      'Não foi possível ligar o elenco autorizado aos atletas deste aparelho. Sincronize e tente de novo.',
    );
  }
  if (
    code === 'CLOUD_UNAVAILABLE' ||
    failure.reason instanceof TypeError ||
    NETWORK_FAILURE.test(message)
  ) {
    return offlineError(
      'Sem conexão com a nuvem. Sessões de comunidade precisam de internet para gerar os times.',
    );
  }
  if (code === '42501') {
    if (failure.step.startsWith('addEntry:') && failure.player) {
      return productError(
        'permission_denied',
        `${formatPlayerNames([failure.player])} não está no elenco da comunidade na nuvem.`,
      );
    }
    return productError(
      'permission_denied',
      'Só dono, admin, moderador ou Organizador desta comunidade podem gerar os times.',
    );
  }
  if (code === '40001') {
    return conflictError('roster_revision', 'O elenco mudou em outro aparelho. Tente de novo.');
  }
  if (code === '23514' && message.includes('without live Community standing')) {
    return productError(
      'invalid_input',
      'Um atleta saiu do elenco da comunidade. Atualize a seleção e gere de novo.',
    );
  }
  if (code === '23514') {
    return productError(
      'invalid_input',
      'A sessão ou o elenco não estão prontos para formar times.',
    );
  }
  if (code === 'PGRST202' || code === '42883') {
    return technicalError(
      'A formação autorizada ainda não está disponível neste servidor.',
      failure.reason,
    );
  }
  return technicalError(
    'Não foi possível preparar os times. Verifique a conexão e tente novamente.',
    failure.reason,
  );
}
