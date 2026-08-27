import test from 'node:test';
import assert from 'node:assert/strict';
import type { CareerTotals } from '@shared/types/career';
import { careerStatsFromTotals } from './career';
import { careerWinRate, isUnrecordedCareer, readLegacyCareerProjection } from './careerProjection';

function totals(over: Partial<CareerTotals> = {}): CareerTotals {
  return {
    playerId: 'player-1',
    sessionsPlayed: 4,
    gamesPlayed: 10,
    gamesWon: 6,
    totalPoints: 120,
    totalErrors: 8,
    totalHighlights: 3,
    lastPlayedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

// ── missing != zero ────────────────────────────────────────────────────────

test('an unrecorded career is not the same as a career of zeros', () => {
  // The distinction the underlying data actually supports: a null ledger row means the
  // player was never captured, which is not the same claim as "played and won nothing".
  const unrecorded = readLegacyCareerProjection(null);
  const recordedZero = readLegacyCareerProjection(
    totals({ sessionsPlayed: 0, gamesPlayed: 0, gamesWon: 0, totalPoints: 0 }),
  );

  assert.equal(unrecorded.kind, 'unrecorded');
  assert.equal(recordedZero.kind, 'recorded');
  assert.notDeepEqual(unrecorded, recordedZero);
  assert.equal(isUnrecordedCareer(unrecorded), true);
  assert.equal(isUnrecordedCareer(recordedZero), false);
});

test('the boundary does not expose a fabricated stats object for an unrecorded player', () => {
  const projection = readLegacyCareerProjection(null);

  // There is deliberately no `stats` to read. A caller cannot accidentally render
  // "0 games, 0%" for someone the ledger has never seen.
  assert.equal('stats' in projection, false);
});

test('win rate is null when there is no basis to compute one', () => {
  // Two different "no answer" cases, both of which the legacy shape reports as the number 0.
  assert.equal(careerWinRate(readLegacyCareerProjection(null)), null);
  assert.equal(
    careerWinRate(readLegacyCareerProjection(totals({ gamesPlayed: 0, gamesWon: 0 }))),
    null,
  );
});

test('win rate is reported when games actually exist', () => {
  assert.equal(careerWinRate(readLegacyCareerProjection(totals())), 60);
});

test('the legacy projection still collapses missing into zero, which is why the boundary exists', () => {
  // Pins the CURRENT legacy behaviour rather than changing it. XS-W1-02 must not redesign
  // W9, so careerStatsFromTotals keeps returning a zeroed shape and its own test still
  // passes; the boundary above is what new consumers use instead.
  const legacy = careerStatsFromTotals(null);
  const legacyRealZero = careerStatsFromTotals(
    totals({
      sessionsPlayed: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      totalPoints: 0,
      totalErrors: 0,
      totalHighlights: 0,
    }),
  );

  assert.deepEqual(
    legacy,
    legacyRealZero,
    'legacy shape cannot tell unrecorded from zero; if this now differs the legacy ' +
      'projection changed and the boundary should be revisited',
  );
});

// ── facts != ratings ───────────────────────────────────────────────────────

test('the projection exposes only factual fields', () => {
  const projection = readLegacyCareerProjection(totals());
  assert.equal(projection.kind, 'recorded');
  if (projection.kind !== 'recorded') return;

  // GINV-STAT-001: no subjective value may ride along with the facts.
  assert.deepEqual(Object.keys(projection.stats).sort(), [
    'errors',
    'gamesPlayed',
    'highlights',
    'losses',
    'totalPoints',
    'winRate',
    'wins',
  ]);
});

test('recorded totals pass through without derivation surprises', () => {
  const projection = readLegacyCareerProjection(totals({ gamesPlayed: 10, gamesWon: 6 }));
  assert.equal(projection.kind, 'recorded');
  if (projection.kind !== 'recorded') return;

  assert.equal(projection.stats.gamesPlayed, 10);
  assert.equal(projection.stats.wins, 6);
  assert.equal(projection.stats.losses, 4);
});
