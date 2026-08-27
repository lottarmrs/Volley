import type { CareerTotals } from '@shared/types/career';
import type { CareerStats } from './career';
import { careerStatsFromTotals } from './career';

/**
 * XS-W1-02 — explicit adapter boundary around the LEGACY career projection.
 *
 * `career_totals` plus `careerStatsFromTotals` is a legacy aggregate that C6 W9 replaces
 * with a rebuildable target projection. This module is the only place new code should read
 * it from, so W9 can swap the source without every consumer having to change.
 *
 * TWO THINGS THIS BOUNDARY EXISTS TO PRESERVE:
 *
 * 1. missing != zero. `careerStatsFromTotals(null)` returns an all-zero shape, which is
 *    indistinguishable from a real player who has genuinely played zero games. The legacy
 *    behaviour is deliberate and pinned by its own test, so it is not changed here; instead
 *    this adapter surfaces the distinction the underlying data actually supports, and new
 *    consumers get a value they cannot accidentally read as "0 games played".
 *
 * 2. facts != ratings (GINV-STAT-001). Career totals are FACTUAL: games, points, errors,
 *    highlights. Derived aggregate scores, card tiers and session ratings are subjective
 *    display projections computed elsewhere. Nothing rating-shaped may enter this module,
 *    and AF-FREEZE-009 enforces that across the whole factual pipeline rather than trusting
 *    review. (This comment deliberately avoids naming those symbols: the guard scans this
 *    file, and it caught an earlier draft that spelled them out.)
 *
 * This does NOT redesign W9. It is a seam, not a rewrite.
 */

/**
 * A career reading that keeps "we have no record" separate from "the record says zero".
 *
 * Collapsing the two is how a player who has never been captured ends up displayed as
 * someone with a 0% win rate.
 */
export type LegacyCareerProjection =
  | { readonly kind: 'unrecorded' }
  | { readonly kind: 'recorded'; readonly stats: CareerStats };

/**
 * Reads the legacy aggregate through the boundary.
 *
 * `null` totals mean the ledger has no row for this player: unknown, not zero.
 */
export function readLegacyCareerProjection(totals: CareerTotals | null): LegacyCareerProjection {
  if (!totals) return { kind: 'unrecorded' };
  return { kind: 'recorded', stats: careerStatsFromTotals(totals) };
}

/** True when the ledger has never recorded this player. */
export function isUnrecordedCareer(projection: LegacyCareerProjection): boolean {
  return projection.kind === 'unrecorded';
}

/**
 * Win rate that refuses to invent a number.
 *
 * `null` means "no basis to compute one" — either nothing recorded, or recorded with zero
 * games. A caller must decide how to render that; it must not be pre-rounded to 0%.
 */
export function careerWinRate(projection: LegacyCareerProjection): number | null {
  if (projection.kind === 'unrecorded') return null;
  if (projection.stats.gamesPlayed <= 0) return null;
  return projection.stats.winRate;
}
