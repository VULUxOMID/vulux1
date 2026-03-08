import assert from 'node:assert/strict';
import test from 'node:test';

import { getLiveSubscriptionViews } from './spacetime';

test('live subscription retains authoritative wallet views for refuel flows', () => {
  const views = getLiveSubscriptionViews();

  assert.ok(views.includes('my_account_state'));
  assert.ok(views.includes('my_wallet_balance'));
  assert.ok(views.includes('my_wallet_transactions'));
  assert.ok(views.includes('public_live_discovery'));
});
