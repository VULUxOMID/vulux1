import assert from 'node:assert/strict';
import test from 'node:test';

import { getFuelDisplayCapacity, MAX_FUEL_MINUTES } from './types';

test('getFuelDisplayCapacity keeps legacy baseline for low balances', () => {
  assert.equal(getFuelDisplayCapacity(0), MAX_FUEL_MINUTES);
  assert.equal(getFuelDisplayCapacity(300), MAX_FUEL_MINUTES);
  assert.equal(getFuelDisplayCapacity(600), MAX_FUEL_MINUTES);
});

test('getFuelDisplayCapacity expands for balances above the legacy baseline', () => {
  assert.equal(getFuelDisplayCapacity(601), 700);
  assert.equal(getFuelDisplayCapacity(949), 1000);
  assert.equal(getFuelDisplayCapacity(1000), 1000);
  assert.equal(getFuelDisplayCapacity(1001), 1100);
});
