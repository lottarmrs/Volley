import test from 'node:test';
import assert from 'node:assert/strict';
import {
  censusFor,
  interfaceKeys,
  moduleImports,
  objectLiteralKeys,
} from './legacyExpansionPolicy';
import {
  FROZEN_BALANCE_WEIGHT_KEYS,
  FROZEN_PLAYER_BALANCE_SNAPSHOT_KEYS,
  FROZEN_SOLVER_IMPORTS,
  FROZEN_STORAGE_KEYS,
  FROZEN_TEAM_METRIC_KEYS,
  legacyExpansionRules,
} from './legacyExpansionRules';
import { architectureFitnessManifest, getArchitectureFitness } from './fitnessManifest';

/**
 * XS-W0-01 exit gate:
 *
 *   New code cannot accidentally expand the largest known legacy coupling
 *   without an explicit exception.
 *
 * Each rule asserts EXACT census equality against a frozen baseline. A failure here is not
 * automatically a bug in the new code — it means the change touches a boundary C6 is
 * actively retiring, and the review must supply the slice/authority/removal-trigger block
 * before the allowlist moves.
 */

function explain(ruleId: string, title: string): string {
  return [
    `${ruleId} — ${title}`,
    '',
    'This change alters a frozen architecture-risk surface (C6 XS-W0-01).',
    'If the change RETIRES legacy, lower the baseline in legacyExpansionRules.ts.',
    'If the change EXPANDS legacy, it needs an explicit architectural exception:',
    'record slice, owner, authority change, ADR/GINV and removal trigger in review.',
  ].join('\n');
}

for (const rule of legacyExpansionRules) {
  test(`${rule.id}: ${rule.title}`, () => {
    const observed = censusFor(rule);
    assert.deepEqual(observed, rule.baseline, explain(rule.id, rule.title));
  });
}

test('XS-W0-01: every freeze rule is registered in the fitness manifest', () => {
  for (const rule of legacyExpansionRules) {
    const fitness = getArchitectureFitness(rule.id);

    assert.equal(fitness.slice, rule.slice);
    assert.ok(fitness.owner.length > 0, `${rule.id} must declare an owner`);
    assert.ok(
      fitness.removalOrReplacementTrigger.length > 0,
      `${rule.id} must declare a removal or replacement trigger`,
    );
  }
});

test('XS-W0-01: allowlists cannot grow implicitly', () => {
  // A rule whose baseline is empty is a TARGET boundary and must stay empty. A rule with a
  // baseline is TRANSITIONAL and must name a wave that retires it.
  for (const rule of legacyExpansionRules) {
    const fitness = getArchitectureFitness(rule.id);
    const hasAllowlist = Object.keys(rule.baseline).length > 0;

    assert.equal(
      fitness.lifecycle,
      hasAllowlist ? 'TRANSITIONAL' : 'TARGET',
      `${rule.id} lifecycle must match whether it carries a legacy allowlist`,
    );
  }
});

test('AF-FREEZE-007: the broad domain localStorage key set is frozen', () => {
  const observed = objectLiteralKeys('src/storage/localStorageRepository.ts', 'STORAGE_KEYS');

  assert.deepEqual(
    observed,
    [...FROZEN_STORAGE_KEYS],
    explain('AF-FREEZE-007', 'No new broad domain localStorage key'),
  );
});

test('AF-FREEZE-008: solver objective weights cannot gain a new aggregate input', () => {
  const observed = interfaceKeys('src/shared/types/session.ts', 'BalanceWeights');

  assert.deepEqual(
    observed,
    [...FROZEN_BALANCE_WEIGHT_KEYS],
    explain('AF-FREEZE-008', 'BalanceWeights is the solver objective contract'),
  );
});

test('AF-FREEZE-008: team metrics cannot gain a new aggregate the objective could read', () => {
  const observed = interfaceKeys('src/shared/types/session.ts', 'TeamMetrics');

  assert.deepEqual(
    observed,
    [...FROZEN_TEAM_METRIC_KEYS],
    explain('AF-FREEZE-008', 'TeamMetrics feeds the solver objective'),
  );
});

test('AF-FREEZE-008: the solver dependency surface is frozen', () => {
  for (const [file, frozen] of Object.entries(FROZEN_SOLVER_IMPORTS)) {
    assert.deepEqual(
      moduleImports(file),
      [...frozen],
      explain(
        'AF-FREEZE-008',
        `${file} changed its imports. A new binding reaching Team Formation must be reviewed: ` +
          'it is the one route by which a renamed or newly computed rating can influence the ' +
          'solver without appearing in the census or the objective key sets',
      ),
    );
  }
});

test('AF-FREEZE-008: canonical Team Formation has zero Overall entry points', () => {
  const rule = legacyExpansionRules.find((item) => item.id === 'AF-FREEZE-008');
  assert.ok(rule);
  assert.deepEqual(censusFor(rule), {});

  const overallImports = Object.values(FROZEN_SOLVER_IMPORTS)
    .flat()
    .filter((binding) => /overall/i.test(binding));
  assert.deepEqual(overallImports, []);
});

test('AF-FREEZE-008: target snapshot excludes aggregate optimizer authority', () => {
  const observed = interfaceKeys('src/shared/types/session.ts', 'PlayerBalanceSnapshot');
  assert.deepEqual(observed, [...FROZEN_PLAYER_BALANCE_SNAPSHOT_KEYS]);
  assert.equal(
    observed.some((key) => /overall/i.test(key)),
    false,
  );
});

test('AF-FREEZE-008: Overall exclusion is now a target fitness contract', () => {
  const fitness = architectureFitnessManifest.find((item) => item.id === 'AF-FREEZE-008');
  assert.equal(fitness?.lifecycle, 'TARGET');
});

test('AF-FREEZE-008: Overall remains display-only outside the solver', () => {
  // Guards the inverse mistake: this slice must not be read as banning Overall globally.
  // GINV-BAL-001 forbids solver influence, not the derived display value.
  const rule = legacyExpansionRules.find((item) => item.id === 'AF-FREEZE-008');

  assert.ok(rule, 'AF-FREEZE-008 must exist');
  assert.ok(
    rule.include.every((path) => path.startsWith('src/logic/balanc')),
    'AF-FREEZE-008 must stay scoped to Team Formation solver modules',
  );
});
