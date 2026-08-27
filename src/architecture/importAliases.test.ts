import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { AppResult } from '@app/appResult';
import type { Community, CommunityMember } from '@shared/types/community';
import type { Player } from '@shared/types/player';
import type { Session } from '@shared/types/session';
import { getArchitectureFitness } from './fitnessManifest';

test('AF-TARGET-001: architecture aliases resolve through TypeScript', () => {
  const fitness = getArchitectureFitness('AF-TARGET-001');
  const result: AppResult<Session | null> = { ok: true, value: null, issues: [] };

  assert.equal(fitness.lifecycle, 'TARGET');
  assert.equal(result.ok, true);
});

test('AF-TARGET-002: common UI components live under the ui boundary', () => {
  const fitness = getArchitectureFitness('AF-TARGET-002');

  assert.equal(fitness.lifecycle, 'TARGET');
  assert.equal(existsSync('src/ui/common/ToastViewport.tsx'), true);
  assert.equal(existsSync('src/components/common/ToastViewport.tsx'), false);
});

test('AF-TARGET-003: Supabase adapters live under the infra boundary', () => {
  const fitness = getArchitectureFitness('AF-TARGET-003');

  assert.equal(fitness.lifecycle, 'TARGET');
  assert.equal(existsSync('src/infra/supabase'), true);
  assert.equal(existsSync('src/services/supabase'), false);
});

test('AF-TARGET-004: shared contracts remain in domain-specific shared modules', () => {
  const fitness = getArchitectureFitness('AF-TARGET-004');
  const community: Pick<Community, 'id' | 'name'> = {
    id: 'community-1',
    name: 'Panelinha',
  };
  const member: Pick<CommunityMember, 'communityId' | 'userId' | 'role'> = {
    communityId: community.id,
    userId: 'user-1',
    role: 'member',
  };
  const player: Pick<Player, 'id' | 'nome' | 'apelido'> = {
    id: 'player-1',
    nome: 'Matheus',
    apelido: 'Math',
  };
  const session: Pick<Session, 'id' | 'name'> = {
    id: 'session-1',
    name: 'Treino',
  };

  assert.equal(fitness.lifecycle, 'TARGET');
  assert.equal(member.communityId, community.id);
  assert.equal(session.id, 'session-1');
  assert.equal(player.id, 'player-1');
  assert.equal(existsSync('src/shared/types/community.ts'), true);
  assert.equal(existsSync('src/shared/types/player.ts'), true);
  assert.equal(existsSync('src/shared/types/session.ts'), true);
});
