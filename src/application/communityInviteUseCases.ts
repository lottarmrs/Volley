import { paths } from './appRoutes';
import type { CommunityJoinPreview } from './communityMembershipUseCases';

export type CommunityInviteState =
  | { kind: 'loading' }
  | { kind: 'canRequest'; community: CommunityJoinPreview }
  | { kind: 'pending'; community: CommunityJoinPreview }
  | { kind: 'alreadyMember'; community: CommunityJoinPreview; to: string }
  | { kind: 'blocked'; community: CommunityJoinPreview }
  | { kind: 'invalid'; message: string };

const CODIGO_INVALIDO = 'Este convite não vale mais. Peça um link novo para quem te chamou.';

export function resolveCommunityInviteState(input: {
  loading: boolean;
  preview: CommunityJoinPreview | null;
  error: string | null;
  justRequested?: boolean;
  sessionId?: string | null;
}): CommunityInviteState {
  if (input.loading) return { kind: 'loading' };

  if (!input.preview) {
    return { kind: 'invalid', message: input.error ?? CODIGO_INVALIDO };
  }

  const community = input.preview;

  if (community.myStatus === 'active') {
    return {
      kind: 'alreadyMember',
      community,
      to: input.sessionId
        ? paths.inscricao(community.id, input.sessionId)
        : paths.comunidade(community.id),
    };
  }

  if (input.justRequested || community.myStatus === 'pending') {
    return { kind: 'pending', community };
  }

  // Recusado ou suspenso: pedir de novo pelo mesmo codigo nao resolve, e
  // oferecer o botao so produziria a mesma recusa.
  if (community.myStatus) {
    return { kind: 'blocked', community };
  }

  return { kind: 'canRequest', community };
}

export function buildInviteShareUrl(input: {
  origin: string;
  code: string | null | undefined;
  sessionId?: string | null;
}): string | null {
  const codigo = input.code?.trim().toUpperCase();
  if (!codigo) return null;

  const base = `${input.origin.replace(/\/$/, '')}/convite/${codigo}`;
  return input.sessionId ? `${base}?pelada=${input.sessionId}` : base;
}
