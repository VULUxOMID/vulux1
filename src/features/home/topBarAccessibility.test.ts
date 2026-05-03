import test from 'node:test';
import assert from 'node:assert/strict';

import { getHomeCashPillAccessibilityLabel } from './topBarAccessibility';

test('describes the cash balance when wallet data is authoritative', () => {
  assert.equal(
    getHomeCashPillAccessibilityLabel({
      cashLabel: '1.2k',
      hasAuthoritativeWallet: true,
    }),
    'Cash balance, 1.2k',
  );
});

test('falls back when wallet data is unavailable', () => {
  assert.equal(
    getHomeCashPillAccessibilityLabel({
      cashLabel: '--',
      hasAuthoritativeWallet: false,
    }),
    'Cash balance unavailable',
  );
});
