import test from 'node:test';
import assert from 'node:assert/strict';

import type { ActivityNotification } from './types';
import {
  getActivityNotificationAccessibilityText,
  shouldPrefixActivityActor,
} from './activityNotificationText';

const baseActivity = (): ActivityNotification => ({
  id: 'activity-1',
  type: 'activity',
  activityType: 'mention',
  createdAt: 1_000,
  read: false,
  fromUser: {
    id: 'user-1',
    name: 'Alice',
  },
  message: 'mentioned you in chat.',
});

test('prefixes actor names for mention notifications', () => {
  const item = baseActivity();
  assert.equal(shouldPrefixActivityActor(item), true);
  assert.equal(
    getActivityNotificationAccessibilityText(item),
    'Alice mentioned you in chat.',
  );
});

test('does not prefix actor names for event winner notifications', () => {
  const item: ActivityNotification = {
    ...baseActivity(),
    activityType: 'event',
    message: 'You won the event draw in Friday Live!',
  };

  assert.equal(shouldPrefixActivityActor(item), false);
  assert.equal(
    getActivityNotificationAccessibilityText(item),
    'You won the event draw in Friday Live!',
  );
});

test('includes grouped actor labels for grouped non-event activity notifications', () => {
  const item: ActivityNotification = {
    ...baseActivity(),
    groupCount: 3,
    groupedNames: ['Bob', 'Charlie'],
    message: 'liked your post.',
  };

  assert.equal(
    getActivityNotificationAccessibilityText(item),
    'Alice plus 2 liked your post.',
  );
});
