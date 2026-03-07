import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MIN_WITHDRAWAL_GEMS,
  getWithdrawalEligibility,
} from './withdrawalEligibility.ts';

test('withdrawal eligibility stays disabled until wallet state is authoritative', () => {
  const result = getWithdrawalEligibility({
    gems: 1200,
    walletHydrated: false,
    walletStateAvailable: false,
  });

  assert.equal(result.isAuthoritative, false);
  assert.equal(result.canRequestWithdrawal, false);
  assert.equal(
    result.disabledReason,
    'Payout availability will unlock after your wallet finishes syncing.',
  );
  assert.equal(result.availablePayoutLabel, 'Syncing...');
});

test('withdrawal eligibility stays disabled when available payout is zero', () => {
  const result = getWithdrawalEligibility({
    gems: 0,
    walletHydrated: true,
    walletStateAvailable: true,
  });

  assert.equal(result.isAuthoritative, true);
  assert.equal(result.canRequestWithdrawal, false);
  assert.equal(
    result.disabledReason,
    'You need payout-eligible Gems before you can request a withdrawal.',
  );
  assert.equal(result.availablePayoutLabel, '$0.00');
});

test('withdrawal eligibility stays disabled below the server minimum', () => {
  const result = getWithdrawalEligibility({
    gems: DEFAULT_MIN_WITHDRAWAL_GEMS - 1,
    walletHydrated: true,
    walletStateAvailable: true,
  });

  assert.equal(result.canRequestWithdrawal, false);
  assert.equal(
    result.disabledReason,
    `You need at least ${DEFAULT_MIN_WITHDRAWAL_GEMS} Gems available before you can request a withdrawal.`,
  );
});

test('withdrawal eligibility enables once the synced wallet meets minimum payout rules', () => {
  const result = getWithdrawalEligibility({
    gems: DEFAULT_MIN_WITHDRAWAL_GEMS,
    walletHydrated: true,
    walletStateAvailable: true,
  });

  assert.equal(result.canRequestWithdrawal, true);
  assert.equal(result.disabledReason, null);
  assert.equal(result.availablePayoutLabel, '$5.00');
});
