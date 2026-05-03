import test from 'node:test';
import assert from 'node:assert/strict';

import type { Notification } from './types';
import { countsTowardUnreadNotificationBadges } from './unreadBadgeState';

test('excludes sent friend requests from unread badge counts', () => {
  const notification: Notification = {
    id: 'friend-sent-1',
    type: 'friend_request',
    createdAt: 1_000,
    read: false,
    direction: 'sent',
    status: 'pending',
    fromUser: {
      id: 'user-2',
      name: 'Target User',
      level: 1,
    },
  };

  assert.equal(countsTowardUnreadNotificationBadges(notification), false);
});

test('keeps received friend requests in unread badge counts', () => {
  const notification: Notification = {
    id: 'friend-received-1',
    type: 'friend_request',
    createdAt: 1_000,
    read: false,
    direction: 'received',
    status: 'pending',
    fromUser: {
      id: 'user-3',
      name: 'Sender User',
      level: 2,
    },
  };

  assert.equal(countsTowardUnreadNotificationBadges(notification), true);
});

test('excludes already-read notifications', () => {
  const notification: Notification = {
    id: 'announcement-1',
    type: 'announcement',
    createdAt: 1_000,
    read: true,
    title: 'Done',
    message: 'Already read',
    sourceName: 'Ops',
    priority: 'low',
  };

  assert.equal(countsTowardUnreadNotificationBadges(notification), false);
});
