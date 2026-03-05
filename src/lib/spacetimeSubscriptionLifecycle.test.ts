import test from 'node:test';
import assert from 'node:assert/strict';

import { planScopedSubscriptionTeardown } from './spacetimeSubscriptionLifecycle';

test('teardown unsubscribes active subscriptions during resubscribe', () => {
  const plan = planScopedSubscriptionTeardown({
    reason: 'resubscribe',
    isActive: true,
    isEnded: false,
  });
  assert.equal(plan, 'unsubscribe_now');
});

test('teardown defers pending subscriptions during resubscribe churn', () => {
  const plan = planScopedSubscriptionTeardown({
    reason: 'resubscribe',
    isActive: false,
    isEnded: false,
  });
  assert.equal(plan, 'defer_until_applied');
});

test('teardown skips unsubscribe for disconnect-driven cleanup', () => {
  for (const reason of ['disconnect', 'connect_error', 'manual_disconnect', 'recovery:zero_rows']) {
    const plan = planScopedSubscriptionTeardown({
      reason,
      isActive: true,
      isEnded: false,
    });
    assert.equal(plan, 'skip');
  }
});

test('teardown skips ended handles regardless of reason', () => {
  const plan = planScopedSubscriptionTeardown({
    reason: 'resubscribe',
    isActive: true,
    isEnded: true,
  });
  assert.equal(plan, 'skip');
});
