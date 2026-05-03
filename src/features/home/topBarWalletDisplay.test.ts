import assert from 'node:assert/strict';
import test from 'node:test';

import { getTopBarWalletChipState } from './topBarWalletDisplay';

test('getTopBarWalletChipState uses authoritative values when wallet is ready', () => {
  assert.deepEqual(
    getTopBarWalletChipState({
      cash: 3456,
      fuel: 91,
      showAuthoritativeWallet: true,
    }),
    {
      cashLabel: '3.5k',
    },
  );
});

test('getTopBarWalletChipState avoids raw placeholder dashes during hydration', () => {
  assert.deepEqual(
    getTopBarWalletChipState({
      cash: 0,
      fuel: 0,
      showAuthoritativeWallet: false,
    }),
    {
      cashLabel: '0',
      fuelLabelOverride: '0s',
    },
  );
});

test('getTopBarWalletChipState preserves valid cached numeric values during non-authoritative states', () => {
  assert.deepEqual(
    getTopBarWalletChipState({
      cash: 125,
      fuel: 42,
      showAuthoritativeWallet: false,
    }),
    {
      cashLabel: '125',
      fuelLabelOverride: '42s',
    },
  );
});
