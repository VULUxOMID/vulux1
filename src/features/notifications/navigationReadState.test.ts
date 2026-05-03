import test from 'node:test';
import assert from 'node:assert/strict';

import type { Notification } from './types';
import { shouldMarkNotificationReadBeforeNavigation } from './navigationReadState';

const unreadMention: Notification = {
  id: 'mention-1',
  type: 'activity',
  activityType: 'mention',
  createdAt: 1_000,
  read: false,
  fromUser: {
    id: 'user-1',
    name: 'Alice',
  },
  message: 'mentioned you',
  metadata: {
    chatId: 'global',
    messageId: 'msg-1',
  },
};

test('marks unread notification rows read before inline navigation actions', () => {
  assert.equal(
    shouldMarkNotificationReadBeforeNavigation('navigation', 'mention-1', [unreadMention]),
    true,
  );
});

test('does not force a read for already-read notification navigation', () => {
  assert.equal(
    shouldMarkNotificationReadBeforeNavigation('navigation', 'mention-1', [
      {
        ...unreadMention,
        read: true,
      },
    ]),
    false,
  );
});

test('ignores non-notification navigation actions like empty-state explore', () => {
  assert.equal(
    shouldMarkNotificationReadBeforeNavigation('navigation', '', [unreadMention]),
    false,
  );
});
