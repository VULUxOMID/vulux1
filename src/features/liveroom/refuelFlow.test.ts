import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRefuelFailureMessage,
  buildRefuelPendingReceipt,
  buildRefuelTransactionMatch,
  getRefuelActionLabel,
} from './refuelReceipt';

test('buildRefuelPendingReceipt keeps copy deterministic', () => {
  const receipt = buildRefuelPendingReceipt(120);
  assert.equal(receipt.status, 'pending');
  assert.equal(receipt.title, 'Processing refuel');
  assert.match(receipt.message, /2h fuel/i);
});

test('buildRefuelTransactionMatch matches gems refuel ledger deltas', () => {
  assert.deepEqual(
    buildRefuelTransactionMatch({
      amount: 60,
      paymentType: 'gems',
      source: 'go_live_refuel',
    }),
    {
      eventType: 'purchase_fuel_pack',
      source: 'go_live_refuel',
      deltaFuel: 60,
      deltaGems: -20,
      deltaCash: 0,
    },
  );
});

test('buildRefuelTransactionMatch matches cash refuel ledger deltas', () => {
  assert.deepEqual(
    buildRefuelTransactionMatch({
      amount: 300,
      paymentType: 'cash',
      source: 'friend_live_preview_refuel',
    }),
    {
      eventType: 'purchase_fuel_pack',
      source: 'friend_live_preview_refuel',
      deltaFuel: 300,
      deltaGems: 0,
      deltaCash: -800,
    },
  );
});

test('buildRefuelFailureMessage maps server guardrails to user-safe copy', () => {
  assert.equal(
    buildRefuelFailureMessage(
      { ok: false, code: 'insufficient_balance', message: 'insufficient balance' },
      'gems',
    ),
    'Not enough Gems to buy this fuel pack.',
  );
  assert.equal(
    buildRefuelFailureMessage(
      { ok: false, code: 'invalid_input', message: 'invalid amount' },
      'cash',
    ),
    'Choose a valid fuel pack to continue.',
  );
});

test('getRefuelActionLabel prefers wallet syncing copy over insufficient balance', () => {
  assert.equal(
    getRefuelActionLabel({
      status: 'idle',
      walletReady: false,
      canAfford: false,
      paymentType: 'gems',
      defaultLabel: 'Fill +30m',
    }),
    'Syncing wallet...',
  );
  assert.equal(
    getRefuelActionLabel({
      status: 'idle',
      walletReady: true,
      canAfford: false,
      paymentType: 'gems',
      defaultLabel: 'Fill +30m',
    }),
    'Not enough Gems',
  );
});
