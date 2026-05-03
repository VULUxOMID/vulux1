import test from 'node:test';
import assert from 'node:assert/strict';

import type { Notification } from './types';
import { getUnreadProfileViewNotificationIds } from './profileViewReadState';

test('collects only unread profile-view notification ids', () => {
  const notifications: Notification[] = [
    {
      id: 'profile-view-1',
      type: 'profile_view',
      createdAt: 1_000,
      read: false,
      viewer: {
        id: 'viewer-1',
        name: 'Viewer One',
        level: 1,
      },
      viewCount: 1,
      lastViewed: 1_100,
    },
    {
      id: 'profile-view-2',
      type: 'profile_view',
      createdAt: 2_000,
      read: true,
      viewer: {
        id: 'viewer-2',
        name: 'Viewer Two',
        level: 2,
      },
      viewCount: 2,
      lastViewed: 2_100,
    },
    {
      id: 'activity-1',
      type: 'activity',
      createdAt: 3_000,
      read: false,
      activityType: 'event',
      message: 'You won the event draw!',
    },
  ];

  assert.deepEqual(getUnreadProfileViewNotificationIds(notifications), ['profile-view-1']);
});
