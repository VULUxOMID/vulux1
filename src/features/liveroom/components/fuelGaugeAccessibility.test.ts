import test from 'node:test';
import assert from 'node:assert/strict';

import { getFuelGaugeAccessibilityLabel } from './fuelGaugeAccessibility';

test('describes placeholder fuel state', () => {
  assert.equal(
    getFuelGaugeAccessibilityLabel({
      displayLabel: '--',
      isPlaceholder: true,
      isLow: false,
      isEmpty: false,
      isDraining: false,
    }),
    'Fuel unavailable',
  );
});

test('describes low and draining fuel state', () => {
  assert.equal(
    getFuelGaugeAccessibilityLabel({
      displayLabel: '9m 5s',
      isPlaceholder: false,
      isLow: true,
      isEmpty: false,
      isDraining: true,
    }),
    'Fuel, 9m 5s remaining, low fuel, currently draining',
  );
});

test('describes empty fuel state', () => {
  assert.equal(
    getFuelGaugeAccessibilityLabel({
      displayLabel: '0s',
      isPlaceholder: false,
      isLow: true,
      isEmpty: true,
      isDraining: false,
    }),
    'Fuel, 0s remaining, empty',
  );
});
