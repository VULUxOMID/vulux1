import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasAuthoritativeWallet,
  hasAuthoritativeWalletForUser,
  hasRelevantWalletScope,
  resolveAuthoritativeWalletState,
  shouldRefreshWalletFromBackendEvent,
  shouldRefreshWalletFromSpacetimeEvent,
} from './walletHydration';

test('hasRelevantWalletScope matches wallet account-state lifecycle scopes', () => {
  assert.equal(hasRelevantWalletScope(['messages']), false);
  assert.equal(hasRelevantWalletScope(['profile']), true);
  assert.equal(hasRelevantWalletScope(['identity']), true);
  assert.equal(hasRelevantWalletScope(['wallet']), true);
});

test('shouldRefreshWalletFromSpacetimeEvent refreshes until hydration succeeds', () => {
  assert.equal(
    shouldRefreshWalletFromSpacetimeEvent({ scopes: ['messages'] }, false),
    true,
  );
  assert.equal(
    shouldRefreshWalletFromSpacetimeEvent({ scopes: ['messages'] }, true),
    false,
  );
  assert.equal(
    shouldRefreshWalletFromSpacetimeEvent({ scopes: ['profile'] }, true),
    true,
  );
});

test('shouldRefreshWalletFromBackendEvent honors force-full and relevant scopes', () => {
  assert.equal(
    shouldRefreshWalletFromBackendEvent({ scopes: ['messages'] }, false),
    true,
  );
  assert.equal(
    shouldRefreshWalletFromBackendEvent({ forceFull: true, scopes: ['messages'] }, true),
    true,
  );
  assert.equal(
    shouldRefreshWalletFromBackendEvent({ scopes: ['wallet'] }, true),
    true,
  );
  assert.equal(
    shouldRefreshWalletFromBackendEvent({ scopes: ['messages'] }, true),
    false,
  );
});

test('hasAuthoritativeWalletForUser rejects stale values after account switch', () => {
  assert.equal(
    hasAuthoritativeWalletForUser(
      '45d3c56c-a930-449b-9a3c-ef039f45eed7',
      '45d3c56c-a930-449b-9a3c-ef039f45eed7',
      true,
    ),
    true,
  );
  assert.equal(
    hasAuthoritativeWalletForUser(
      '45d3c56c-a930-449b-9a3c-ef039f45eed7',
      '03b1f623-c367-4bd7-ab4f-2f4edaf2958d',
      true,
    ),
    false,
  );
});

test('hasAuthoritativeWallet only exposes balances after hydration completes', () => {
  assert.equal(hasAuthoritativeWallet(false, false), false);
  assert.equal(hasAuthoritativeWallet(false, true), false);
  assert.equal(hasAuthoritativeWallet(true, false), false);
  assert.equal(hasAuthoritativeWallet(true, true), true);
});

test('resolveAuthoritativeWalletState prefers account state wallet when present', () => {
  const resolved = resolveAuthoritativeWalletState(
    {
      wallet: {
        gems: 2121,
        cash: 2001,
        fuel: 0,
      },
    },
    {
      userId: '45d3c56c-a930-449b-9a3c-ef039f45eed7',
      gems: 999,
      cash: 888,
      fuel: 7,
    },
    '45d3c56c-a930-449b-9a3c-ef039f45eed7',
  );

  assert.deepEqual(resolved, {
    source: 'account_state',
    walletStateAvailable: true,
    walletState: {
      gems: 2121,
      cash: 2001,
      fuel: 0,
    },
  });
});

test('resolveAuthoritativeWalletState falls back to my_wallet_balance for the signed-in user', () => {
  const resolved = resolveAuthoritativeWalletState(
    null,
    {
      userId: '45d3c56c-a930-449b-9a3c-ef039f45eed7',
      gems: 2121,
      cash: 2001,
      fuel: 0,
    },
    '45d3c56c-a930-449b-9a3c-ef039f45eed7',
  );

  assert.deepEqual(resolved, {
    source: 'wallet_balance',
    walletStateAvailable: true,
    walletState: {
      gems: 2121,
      cash: 2001,
      fuel: 0,
    },
  });
});

test('resolveAuthoritativeWalletState rejects wallet balance rows for a different user', () => {
  const resolved = resolveAuthoritativeWalletState(
    null,
    {
      userId: '03b1f623-c367-4bd7-ab4f-2f4edaf2958d',
      gems: 2000,
      cash: 2000,
      fuel: 0,
    },
    '45d3c56c-a930-449b-9a3c-ef039f45eed7',
  );

  assert.deepEqual(resolved, {
    source: 'none',
    walletStateAvailable: false,
    walletState: null,
  });
});
