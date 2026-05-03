import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasAuthoritativeWallet,
  hasAuthoritativeWalletForUser,
  hasRelevantWalletScope,
  selectAuthoritativeWalletHistory,
  shouldRefreshWalletFromBackendEvent,
  shouldRefreshWalletFromRailwayEvent,
} from './walletHydration';

test('hasRelevantWalletScope matches wallet account-state lifecycle scopes', () => {
  assert.equal(hasRelevantWalletScope(['messages']), false);
  assert.equal(hasRelevantWalletScope(['profile']), true);
  assert.equal(hasRelevantWalletScope(['identity']), true);
  assert.equal(hasRelevantWalletScope(['wallet']), true);
});

test('shouldRefreshWalletFromRailwayEvent refreshes until hydration succeeds', () => {
  assert.equal(
    shouldRefreshWalletFromRailwayEvent({ scopes: ['messages'] }, false),
    true,
  );
  assert.equal(
    shouldRefreshWalletFromRailwayEvent({ scopes: ['messages'] }, true),
    false,
  );
  assert.equal(
    shouldRefreshWalletFromRailwayEvent({ scopes: ['profile'] }, true),
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

test('selectAuthoritativeWalletHistory clears stale history after account switch', () => {
  assert.deepEqual(
    selectAuthoritativeWalletHistory(
      'user-1',
      'user-1',
      true,
      [{ id: 'history-1' }],
    ),
    [{ id: 'history-1' }],
  );
  assert.deepEqual(
    selectAuthoritativeWalletHistory(
      'user-1',
      'user-2',
      true,
      [{ id: 'history-1' }],
    ),
    [],
  );
});
