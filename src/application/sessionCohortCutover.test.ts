import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isTargetCohortSession } from './sessionCohortCutover';

test('uma Session sem marcador continua sendo legada', () => {
  assert.equal(isTargetCohortSession({ authorityModel: undefined } as never), false);
  assert.equal(isTargetCohortSession({} as never), false);
});

test('so o marcador target muda a coorte', () => {
  assert.equal(isTargetCohortSession({ authorityModel: 'target' } as never), true);
  assert.equal(isTargetCohortSession({ authorityModel: 'legacy' } as never), false);
});
