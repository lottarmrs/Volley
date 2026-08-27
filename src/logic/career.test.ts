import test from 'node:test';
import assert from 'node:assert/strict';
import { careerStatsFromTotals, resolveCareer } from './career';
import type { PlayerStats } from './statistics';
import type { CareerTotals } from '../shared/types/career';

function totals(overrides: Partial<CareerTotals> = {}): CareerTotals {
  return {
    playerId: 'p1',
    sessionsPlayed: 4,
    gamesPlayed: 10,
    gamesWon: 6,
    totalPoints: 55,
    totalErrors: 9,
    totalHighlights: 3,
    lastPlayedAt: '2026-07-27T20:00:00Z',
    ...overrides,
  };
}

function localStats(): PlayerStats {
  return {
    gamesPlayed: 3,
    wins: 2,
    losses: 1,
    winRate: 66.7,
    totalPoints: 12,
    aces: 1,
    kills: 4,
    cortadas: 3,
    tips: 1,
    defenses: 2,
    blocks: 1,
    assists: 0,
    highlights: 1,
    errors: 2,
    errorsByType: {},
    balance: 10,
    pointsContribution: 25,
  };
}

test('careerStatsFromTotals derives losses and win rate', () => {
  const stats = careerStatsFromTotals(totals());

  assert.equal(stats.gamesPlayed, 10);
  assert.equal(stats.wins, 6);
  assert.equal(stats.losses, 4);
  assert.equal(stats.winRate, 60);
});

test('careerStatsFromTotals returns a zeroed shape for a player with no career', () => {
  const stats = careerStatsFromTotals(null);

  assert.equal(stats.gamesPlayed, 0);
  assert.equal(stats.winRate, 0);
  assert.ok(Number.isFinite(stats.winRate));
});

test('careerStatsFromTotals never divides by zero', () => {
  const stats = careerStatsFromTotals(totals({ gamesPlayed: 0, gamesWon: 0 }));

  assert.equal(stats.winRate, 0);
  assert.ok(Number.isFinite(stats.winRate));
});

test('resolveCareer prefers the confirmed ledger and says so', () => {
  const resolved = resolveCareer(totals(), localStats());

  assert.equal(resolved.confidence, 'confirmed');
  assert.equal(resolved.stats.gamesPlayed, 10);
});

test('resolveCareer falls back to local data and marks it provisional', () => {
  const resolved = resolveCareer(null, localStats());

  assert.equal(resolved.confidence, 'provisional');
  assert.equal(resolved.stats.gamesPlayed, 3);
  assert.equal(resolved.stats.wins, 2);
});
