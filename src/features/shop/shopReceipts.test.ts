import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFailureReceipt,
  buildPendingReceipt,
  buildSuccessReceipt,
  matchesWalletTransaction,
} from './shopReceipts';
import type { WalletTransactionRecord } from '../../data/adapters/backend/walletQueries';

function makeTransaction(overrides: Partial<WalletTransactionRecord> = {}): WalletTransactionRecord {
  return {
    id: 'tx-1',
    userId: 'user-1',
    eventType: 'credit_gems_purchase',
    deltaGems: 550,
    deltaCash: 0,
    deltaFuel: 0,
    balanceBefore: { gems: 100, cash: 25, fuel: 0 },
    balanceAfter: { gems: 650, cash: 25, fuel: 0 },
    metadata: {
      purchaseToken: 'purchase-123',
      source: 'shop_buy_gems',
    },
    createdAtMs: 100,
    ...overrides,
  };
}

test('matchesWalletTransaction prefers purchase token when provided', () => {
  const transaction = makeTransaction();
  assert.equal(
    matchesWalletTransaction(transaction, {
      eventType: 'credit_gems_purchase',
      createdAfterMs: 90,
      purchaseToken: 'purchase-123',
      source: 'wrong-source',
    }),
    true,
  );
  assert.equal(
    matchesWalletTransaction(transaction, {
      eventType: 'credit_gems_purchase',
      purchaseToken: 'missing-token',
    }),
    false,
  );
});

test('matchesWalletTransaction checks source and deltas when purchase token is absent', () => {
  const transaction = makeTransaction({
    eventType: 'purchase_fuel_pack',
    deltaGems: -50,
    deltaFuel: 30,
    metadata: { source: 'shop_refuel' },
  });

  assert.equal(
    matchesWalletTransaction(transaction, {
      eventType: 'purchase_fuel_pack',
      createdAfterMs: 90,
      source: 'shop_refuel',
      deltaGems: -50,
      deltaFuel: 30,
    }),
    true,
  );
  assert.equal(
    matchesWalletTransaction(transaction, {
      eventType: 'purchase_fuel_pack',
      source: 'shop_refuel',
      deltaGems: -40,
    }),
    false,
  );
});

test('matchesWalletTransaction rejects stale rows before the current action', () => {
  const transaction = makeTransaction({ createdAtMs: 100 });
  assert.equal(
    matchesWalletTransaction(transaction, {
      eventType: 'credit_gems_purchase',
      createdAfterMs: 101,
      purchaseToken: 'purchase-123',
    }),
    false,
  );
});

test('buildSuccessReceipt exposes server balance after update', () => {
  const receipt = buildSuccessReceipt('purchase_gems', makeTransaction());
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.title, 'Purchase complete');
  assert.deepEqual(receipt.balanceAfter, {
    gems: 650,
    cash: 25,
    fuel: 0,
  });
});

test('pending and failure helpers keep receipt copy deterministic', () => {
  const pending = buildPendingReceipt('claim_reward', 'Claim pending', 'Waiting on server.');
  const failure = buildFailureReceipt('exchange_currency', 'Insufficient balance.');
  assert.equal(pending.status, 'pending');
  assert.equal(failure.status, 'failure');
  assert.equal(failure.title, 'Action failed');
  assert.equal(failure.message, 'Insufficient balance.');
});
