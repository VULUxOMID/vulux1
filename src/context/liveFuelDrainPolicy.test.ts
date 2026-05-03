import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldDrainLiveFuel } from './liveFuelDrainPolicy';

test('drains fuel only for an active host session', () => {
  assert.equal(shouldDrainLiveFuel('LIVE_FULL', true), true);
  assert.equal(shouldDrainLiveFuel('LIVE_MINIMIZED', true), true);
  assert.equal(shouldDrainLiveFuel('LIVE_FULL', false), false);
  assert.equal(shouldDrainLiveFuel('LIVE_MINIMIZED', false), false);
  assert.equal(shouldDrainLiveFuel('LIVE_CLOSED', true), false);
});
