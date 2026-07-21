import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { AppResult } from '@app/appResult';
import type { LocalSyncPayload } from '@infra/supabase/syncService';
import type { Community, CommunityMember } from '@shared/types/community';
import type { Player } from '@shared/types/player';
import type { Session } from '@shared/types/session';

test('architecture aliases resolve through TypeScript', () => {
  const result: AppResult<Session | null> = { ok: true, value: null, issues: [] };

  assert.equal(result.ok, true);
});

test('common UI components live under the ui boundary', () => {
  assert.equal(existsSync('src/ui/common/ToastViewport.tsx'), true);
  assert.equal(existsSync('src/components/common/ToastViewport.tsx'), false);
});

test('supabase services live under the infra boundary', () => {
  const payload: Pick<LocalSyncPayload, 'players'> = { players: [] };

  assert.deepEqual(payload.players, []);
  assert.equal(existsSync('src/infra/supabase/syncService.ts'), true);
  assert.equal(existsSync('src/services/supabase/syncService.ts'), false);
});

test('community types live under shared type modules with barrel compatibility', () => {
  const community: Pick<Community, 'id' | 'name'> = { id: 'community-1', name: 'Panelinha' };
  const member: Pick<CommunityMember, 'communityId' | 'userId' | 'role'> = {
    communityId: community.id,
    userId: 'user-1',
    role: 'member',
  };

  assert.equal(member.communityId, community.id);
  assert.equal(existsSync('src/shared/types/community.ts'), true);
});

test('core product contracts live under domain-specific shared type modules', () => {
  const player: Pick<Player, 'id' | 'nome' | 'apelido'> = {
    id: 'player-1',
    nome: 'Matheus',
    apelido: 'Math',
  };
  const session: Pick<Session, 'id' | 'name' | 'selectedPlayerIds' | 'teamIds'> = {
    id: 'session-1',
    name: 'Treino',
    selectedPlayerIds: [player.id],
    teamIds: [],
  };

  assert.deepEqual(session.selectedPlayerIds, [player.id]);
  assert.equal(existsSync('src/shared/types/player.ts'), true);
  assert.equal(existsSync('src/shared/types/session.ts'), true);
});
