import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { LocalSyncPayload } from '@infra/supabase/syncService';
import type { Session } from '@shared/types/session';
import { mapSessionToDb, scopeOperationalFetch } from '@infra/supabase/operationalCloudService';
import { getArchitectureFitness } from './fitnessManifest';

/**
 * Transitional architecture tests are intentionally different from target fitness tests.
 *
 * They document a Current→Target dependency that C6 still needs to retire safely. A passing
 * test here does NOT mean the legacy contract is desirable; it means the migration assumption
 * is still explicit. Each assertion must have a removal trigger in fitnessManifest.ts.
 */

test('AF-TRANS-001: generic sync remains an explicit W13 strangler target', () => {
  const fitness = getArchitectureFitness('AF-TRANS-001');
  const payload: Pick<LocalSyncPayload, 'players'> = { players: [] };

  assert.equal(fitness.lifecycle, 'TRANSITIONAL');
  assert.deepEqual(payload.players, []);
  assert.equal(existsSync('src/infra/supabase/syncService.ts'), true);
});

test('AF-TRANS-002: legacy Session ID arrays remain explicit until W3/W6/W14 retirement', () => {
  const fitness = getArchitectureFitness('AF-TRANS-002');
  const session: Pick<Session, 'id' | 'name' | 'selectedPlayerIds' | 'teamIds'> = {
    id: 'legacy-session-1',
    name: 'Treino legado',
    selectedPlayerIds: ['player-1'],
    teamIds: [],
  };

  assert.equal(fitness.lifecycle, 'TRANSITIONAL');
  assert.deepEqual(session.selectedPlayerIds, ['player-1']);
  assert.deepEqual(session.teamIds, []);
});

test('AF-TARGET-005: generic sync keeps legacy Session roots explicit', () => {
  const fitness = getArchitectureFitness('AF-TARGET-005');
  const payload: Pick<LocalSyncPayload, 'sessions' | 'teams' | 'games'> = {
    sessions: [],
    teams: [],
    games: [],
  };
  const mapped = mapSessionToDb(
    {
      id: 'legacy-session-1',
      name: 'Treino legado',
      date: '2026-08-29',
      status: 'active',
      selectedPlayerIds: [],
      teamIds: [],
      createdAt: '2026-08-29T20:00:00.000Z',
      updatedAt: '2026-08-29T20:00:00.000Z',
    },
    'owner-1',
  );
  const filters: Array<[string, string]> = [];
  const sessionQuery = {
    eq(column: string, value: string) {
      filters.push([column, value]);
      return this;
    },
  };

  assert.equal(fitness.lifecycle, 'TARGET');
  assert.deepEqual(payload, { sessions: [], teams: [], games: [] });
  assert.equal(mapped.authority_model, 'legacy');
  scopeOperationalFetch('sessions', sessionQuery);
  assert.deepEqual(filters, [['authority_model', 'legacy']]);
});
