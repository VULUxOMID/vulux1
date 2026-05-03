import test from 'node:test';
import assert from 'node:assert/strict';

import { getActivityContextKey } from './activityGrouping';

test('prefers event message ids over broader live ids', () => {
  assert.equal(
    getActivityContextKey({
      liveId: 'live-1',
      eventMessageId: 'event-msg-9',
    }),
    'eventMessageId:event-msg-9',
  );
});

test('prefers message ids over room ids for chat-targeted activity', () => {
  assert.equal(
    getActivityContextKey({
      roomId: 'room-1',
      messageId: 'msg-2',
    }),
    'messageId:msg-2',
  );
});

test('uses conversation keys before broader fallback ids', () => {
  assert.equal(
    getActivityContextKey({
      conversationKey: 'user-a::user-b',
      chatId: 'chat-1',
    }),
    'conversationKey:user-a::user-b',
  );
});

test('falls back to none when no grouping metadata exists', () => {
  assert.equal(getActivityContextKey(undefined), 'none');
  assert.equal(getActivityContextKey({}), 'none');
});
