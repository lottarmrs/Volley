import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDbToCareerEvent, mapDbToCareerTotals } from './careerCloudService';

test('mapDbToCareerEvent converts snake_case rows and defaults payload', () => {
  const event = mapDbToCareerEvent({
    id: 'e1',
    player_id: 'p1',
    community_id: null,
    session_id: 's1',
    type: 'session_played',
    occurred_at: '2026-07-27T20:00:00Z',
    payload: { points: 12, games_won: 2 },
    contract_version: 1,
  });

  assert.equal(event.playerId, 'p1');
  assert.equal(event.sessionId, 's1');
  assert.equal(event.communityId, null);
  assert.equal(event.payload.points, 12);
  assert.equal(event.contractVersion, 1);
});

test('mapDbToCareerTotals coerces null aggregates to zero', () => {
  // The view uses coalesce, but a player with no row at all doesn't appear in the view —
  // the mapper must not turn absence into NaN.
  const totals = mapDbToCareerTotals({
    player_id: 'p1',
    sessions_played: 3,
    games_played: 9,
    games_won: 5,
    total_points: 40,
    total_errors: 7,
    total_highlights: 2,
    last_played_at: '2026-07-27T20:00:00Z',
  });

  assert.equal(totals.sessionsPlayed, 3);
  assert.equal(totals.gamesWon, 5);
  assert.equal(totals.totalPoints, 40);
  assert.ok(Number.isFinite(totals.totalErrors));
});
