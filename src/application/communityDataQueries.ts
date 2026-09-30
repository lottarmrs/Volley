import type { Community, CommunityRules, Player, PlayerEvaluation } from '@shared/types';
import { applyEvaluationAggregate } from '@logic/playerEvaluations';
import { communityCloudService } from '@infra/supabase/communityCloudService';
import { playerCloudService } from '@infra/supabase/playerCloudService';
import {
  communityPlayerCloudService,
  type CommunityPlayerDb,
} from '@infra/supabase/communityPlayerCloudService';
import { playerEvaluationCloudService } from '@infra/supabase/playerEvaluationCloudService';
import { communityRulesCloudService } from '@infra/supabase/communityRulesCloudService';

const norm = (value: string | undefined | null) => (value ?? '').toLowerCase();

export function assembleRoster(input: {
  players: Player[];
  relations: Pick<CommunityPlayerDb, 'community_id' | 'player_id' | 'active'>[];
  evaluations: PlayerEvaluation[];
  ownerId?: string;
  communities?: Community[];
}): Player[] {
  const communityAppIds = new Map(
    (input.communities ?? []).map((community) => [
      norm(community.cloudId || community.id),
      community.id,
    ]),
  );
  const memberships: Record<string, string[]> = {};
  for (const relation of input.relations) {
    if (!relation.player_id || !relation.community_id || !relation.active) continue;
    const key = norm(relation.player_id);
    memberships[key] = memberships[key] || [];
    memberships[key].push(
      communityAppIds.get(norm(relation.community_id)) ?? relation.community_id,
    );
  }
  return input.players.map((player) => {
    const keys = new Set([norm(player.id), norm(player.cloudId)].filter(Boolean));
    const communityIds = [...keys].flatMap((key) => memberships[key] ?? []);
    const evaluations = input.evaluations.filter((evaluation) =>
      keys.has(norm(evaluation.playerId)),
    );
    return applyEvaluationAggregate({ ...player, communityIds }, evaluations, input.ownerId);
  });
}

export function fetchMyCommunities(): Promise<Community[]> {
  return communityCloudService.fetchAll();
}

export async function fetchRoster(ownerId: string, communities?: Community[]): Promise<Player[]> {
  const [players, relations, evaluations] = await Promise.all([
    playerCloudService.fetchAll(),
    communityPlayerCloudService.fetchAll(),
    playerEvaluationCloudService.fetchAll(),
  ]);
  return assembleRoster({ players, relations, evaluations, ownerId, communities });
}

export function fetchRules(): Promise<CommunityRules[]> {
  return communityRulesCloudService.fetchAll();
}
