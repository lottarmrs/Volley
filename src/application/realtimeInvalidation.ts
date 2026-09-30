import { queryKeys } from './queryKeys';

export type RealtimeTable =
  | 'communities'
  | 'community_members'
  | 'community_players'
  | 'players'
  | 'community_rules'
  | 'sessions'
  | 'teams'
  | 'games'
  | 'point_events'
  | 'game_reports'
  | 'session_reports';

export interface RealtimeContext {
  userId: string;
  communityCloudId: string;
}

export const REALTIME_TABLES: ReadonlyArray<{ table: RealtimeTable; filterColumn: string | null }> =
  [
    { table: 'communities', filterColumn: 'id' },
    { table: 'community_members', filterColumn: 'community_id' },
    { table: 'community_players', filterColumn: 'community_id' },
    { table: 'players', filterColumn: null },
    { table: 'community_rules', filterColumn: 'community_id' },
    { table: 'sessions', filterColumn: 'community_id' },
    { table: 'teams', filterColumn: 'community_id' },
    { table: 'games', filterColumn: 'community_id' },
    { table: 'point_events', filterColumn: 'community_id' },
    { table: 'game_reports', filterColumn: 'community_id' },
    { table: 'session_reports', filterColumn: 'community_id' },
  ];

export function invalidationKeysFor(
  table: RealtimeTable,
  { userId, communityCloudId }: RealtimeContext,
): ReadonlyArray<readonly string[]> {
  switch (table) {
    case 'communities':
      return [queryKeys.comunidades(userId)];
    case 'community_members':
      return [queryKeys.membros(communityCloudId), queryKeys.comunidades(userId)];
    case 'community_players':
    case 'players':
      return [queryKeys.atletas(userId)];
    case 'community_rules':
      return [queryKeys.regras(userId)];
    case 'sessions':
    case 'teams':
    case 'games':
    case 'point_events':
    case 'game_reports':
    case 'session_reports':
      return [queryKeys.peladas(userId)];
  }
}

export function allCommunityKeys({
  userId,
  communityCloudId,
}: RealtimeContext): ReadonlyArray<readonly string[]> {
  return [
    queryKeys.comunidades(userId),
    queryKeys.membros(communityCloudId),
    queryKeys.atletas(userId),
    queryKeys.regras(userId),
    queryKeys.peladas(userId),
  ];
}
