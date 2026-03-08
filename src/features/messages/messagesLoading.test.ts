import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldShowMessagesLoading } from './messagesLoading';

test('shows loading when foreground sync is enabled and no conversations are available yet', () => {
  assert.equal(shouldShowMessagesLoading(false, true, false), true);
});

test('does not show loading when fallback conversations already exist', () => {
  assert.equal(shouldShowMessagesLoading(true, true, false), false);
});

test('does not show loading once the conversations view is active', () => {
  assert.equal(shouldShowMessagesLoading(false, true, true), false);
});

test('does not show loading when foreground sync is disabled', () => {
  assert.equal(shouldShowMessagesLoading(false, false, false), false);
});
