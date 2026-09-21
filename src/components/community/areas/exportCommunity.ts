import { getCommunityPlayers, getCommunitySessions } from '@logic/community';
import type { Community, Player, Session } from '../../../types';

export function exportCommunity(community: Community, players: Player[], sessions: Session[]) {
  const payload = {
    community,
    players: getCommunityPlayers(community.id, players),
    sessions: getCommunitySessions(community.id, sessions),
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${community.name.toLowerCase().replace(/\s+/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
