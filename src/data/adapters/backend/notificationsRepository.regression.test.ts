import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setCurrentAuthAccessTokenHandler } from '../../../auth/currentAuthAccessToken';
import { EMPTY_BACKEND_SNAPSHOT } from './snapshot';
import { createBackendNotificationsRepository } from './notificationsRepository';
import { railwayDb } from '../../../lib/railwayRuntime';

function makeIterTable<T>(rows: T[]) {
  return {
    iter: () => rows[Symbol.iterator](),
  };
}

function withMockRailway<T>(dbView: any, run: () => T): T {
  const originalDb = Object.getOwnPropertyDescriptor(railwayDb, 'db');

  Object.defineProperty(railwayDb, 'db', {
    configurable: true,
    get: () => dbView,
  });

  const restore = () => {
    if (originalDb) {
      Object.defineProperty(railwayDb, 'db', originalDb);
    }
  };

  try {
    const result = run();
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

const originalFetch = global.fetch;
const originalBackendBaseUrl = process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL;

function mockSuccessfulBackendWrite() {
  process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL = 'https://example.test';
  setCurrentAuthAccessTokenHandler(async () => 'test-token');
  global.fetch = (async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })) as typeof fetch;
}

function restoreBackendWriteMocks() {
  global.fetch = originalFetch;
  setCurrentAuthAccessTokenHandler(null);
  if (typeof originalBackendBaseUrl === 'string') {
    process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL = originalBackendBaseUrl;
    return;
  }
  delete process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL;
}

afterEach(() => {
  restoreBackendWriteMocks();
});

test('backend event notifications are authoritative once backend social snapshot is loaded', () => {
  const repo = createBackendNotificationsRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialReadLoaded: true,
      notifications: [
        {
          id: 'event-winner:event-msg-1',
          type: 'activity',
          createdAt: 1_700_000_000_200,
          read: false,
          activityType: 'event',
          message: 'You won the event draw in Friday Live!',
          metadata: {
            liveId: 'live-1',
            eventMessageId: 'event-msg-1',
            pickedAt: new Date(1_700_000_000_200).toISOString(),
            source: 'live_event_draw',
          },
        },
      ],
    },
    null,
    'viewer-1',
  );

  const notifications = withMockRailway(
    {
      myNotifications: makeIterTable([
        {
          id: 'stale-railway-event-1',
          userId: 'viewer-1',
          item: JSON.stringify({
            id: 'stale-railway-event-1',
            type: 'activity',
            activityType: 'event',
            createdAt: 1_700_000_000_100,
            read: false,
            message: 'You won the event draw in Friday Live!',
            metadata: {
              liveId: 'live-1',
              pickedAt: 1_700_000_000_100,
            },
          }),
        },
      ]),
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([]),
    },
    () => repo.listNotifications(),
  );

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.id, 'event-winner:event-msg-1');
  assert.equal(notifications[0]?.type, 'activity');
  assert.equal(notifications[0]?.activityType, 'event');
});

test('backend announcements are authoritative once backend social snapshot is loaded', () => {
  const repo = createBackendNotificationsRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialReadLoaded: true,
      notifications: [
        {
          id: 'announcement-1',
          type: 'announcement',
          createdAt: 1_700_000_000_300,
          read: false,
          title: 'Maintenance complete',
          message: 'All systems are back online.',
          sourceName: 'Vulu Ops',
          priority: 'medium',
        },
      ],
    },
    null,
    'viewer-1',
  );

  const notifications = withMockRailway(
    {
      myNotifications: makeIterTable([
        {
          id: 'stale-announcement-1',
          userId: 'viewer-1',
          item: JSON.stringify({
            id: 'stale-announcement-1',
            type: 'announcement',
            createdAt: 1_700_000_000_100,
            read: false,
            title: 'Maintenance complete',
            message: 'All systems are back online.',
            sourceName: 'Vulu Ops',
            priority: 'medium',
          }),
        },
      ]),
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([]),
    },
    () => repo.listNotifications(),
  );

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.id, 'announcement-1');
  assert.equal(notifications[0]?.type, 'announcement');
});

test('backend profile-view notifications are authoritative once backend social snapshot is loaded', () => {
  const repo = createBackendNotificationsRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialReadLoaded: true,
      notifications: [
        {
          id: 'profile-view-1',
          type: 'profile_view',
          createdAt: 1_700_000_000_400,
          read: false,
          viewer: {
            id: 'viewer-2',
            name: 'Viewer Two',
            avatar: 'https://example.com/viewer-2.png',
            level: 7,
          },
          viewCount: 3,
          lastViewed: 1_700_000_000_450,
        },
      ],
    },
    null,
    'viewer-1',
  );

  const notifications = withMockRailway(
    {
      myNotifications: makeIterTable([
        {
          id: 'stale-profile-view-1',
          userId: 'viewer-1',
          item: JSON.stringify({
            id: 'stale-profile-view-1',
            type: 'profile_view',
            createdAt: 1_700_000_000_100,
            read: false,
            viewer: {
              id: 'viewer-2',
              name: 'Viewer Two',
              avatar: 'https://example.com/stale-viewer-2.png',
              level: 1,
            },
            viewCount: 1,
            lastViewed: 1_700_000_000_100,
          }),
        },
      ]),
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([]),
    },
    () => repo.listNotifications(),
  );

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.id, 'profile-view-1');
  assert.equal(notifications[0]?.type, 'profile_view');
});

test('notification repository ignores railway notification rows when backend snapshot is absent', () => {
  const repo = createBackendNotificationsRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialReadLoaded: false,
      notifications: [],
    },
    null,
    'viewer-1',
  );

  const notifications = withMockRailway(
    {
      myNotifications: makeIterTable([
        {
          id: 'stale-activity-1',
          userId: 'viewer-1',
          item: JSON.stringify({
            id: 'stale-activity-1',
            type: 'activity',
            createdAt: 1_700_000_000_100,
            read: false,
            activityType: 'event',
            message: 'stale activity',
          }),
        },
        {
          id: 'stale-profile-view-2',
          userId: 'viewer-1',
          item: JSON.stringify({
            id: 'stale-profile-view-2',
            type: 'profile_view',
            createdAt: 1_700_000_000_101,
            read: false,
            viewer: {
              id: 'viewer-2',
              name: 'Viewer Two',
              level: 1,
            },
            viewCount: 1,
            lastViewed: 1_700_000_000_101,
          }),
        },
        {
          id: 'stale-announcement-2',
          userId: 'viewer-1',
          item: JSON.stringify({
            id: 'stale-announcement-2',
            type: 'announcement',
            createdAt: 1_700_000_000_102,
            read: false,
            title: 'Stale announcement',
            message: 'old message',
            sourceName: 'Ops',
            priority: 'medium',
          }),
        },
      ]),
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([]),
    },
    () => repo.listNotifications(),
  );

  assert.deepEqual(notifications, []);
});

test('markRead applies optimistic read state to backend activity notifications', async () => {
  mockSuccessfulBackendWrite();
  const repo = createBackendNotificationsRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialReadLoaded: true,
      notifications: [
        {
          id: 'activity-read-overlay-1',
          type: 'activity',
          createdAt: 1_700_000_100_000,
          read: false,
          activityType: 'live_invite',
          fromUser: {
            id: 'host-1',
            name: 'Host One',
          },
          message: 'invited you to join their live.',
          metadata: {
            liveId: 'live-1',
          },
        },
      ],
    },
    null,
    'viewer-1',
  );

  await repo.markRead({ notificationId: 'activity-read-overlay-1' });

  const notifications = withMockRailway(
    {
      myNotifications: makeIterTable([]),
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([]),
    },
    () => repo.listNotifications(),
  );

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.id, 'activity-read-overlay-1');
  assert.equal(notifications[0]?.read, true);
});

test('markAllRead applies optimistic read state to loaded backend notifications', async () => {
  mockSuccessfulBackendWrite();
  const repo = createBackendNotificationsRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialReadLoaded: true,
      notifications: [
        {
          id: 'activity-mark-all-1',
          type: 'activity',
          createdAt: 1_700_000_200_000,
          read: false,
          activityType: 'event',
          message: 'You won the event draw in Friday Live!',
          metadata: {
            liveId: 'live-1',
            eventMessageId: 'event-msg-1',
          },
        },
        {
          id: 'announcement-mark-all-1',
          type: 'announcement',
          createdAt: 1_700_000_200_100,
          read: false,
          title: 'Maintenance complete',
          message: 'All systems are back online.',
          sourceName: 'Vulu Ops',
          priority: 'medium',
        },
        {
          id: 'profile-view-mark-all-1',
          type: 'profile_view',
          createdAt: 1_700_000_200_200,
          read: false,
          viewer: {
            id: 'viewer-2',
            name: 'Viewer Two',
            level: 3,
          },
          viewCount: 2,
          lastViewed: 1_700_000_200_250,
        },
      ],
    },
    null,
    'viewer-1',
  );

  await repo.markAllRead();

  const notifications = withMockRailway(
    {
      myNotifications: makeIterTable([]),
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([]),
    },
    () => repo.listNotifications(),
  );

  assert.equal(notifications.length, 3);
  assert.ok(notifications.every((notification) => notification.read));
  assert.deepEqual(
    notifications.map((notification) => notification.id).sort(),
    [
      'activity-mark-all-1',
      'announcement-mark-all-1',
      'profile-view-mark-all-1',
    ],
  );
});

test('optimistic read state stays scoped to the current viewer', async () => {
  const snapshot = {
    ...EMPTY_BACKEND_SNAPSHOT,
    socialReadLoaded: false,
    notifications: [
      {
        id: 'shared-notification-1',
        type: 'activity' as const,
        createdAt: 1_700_000_300_000,
        read: false,
        activityType: 'event' as const,
        message: 'Shared notification',
      },
    ],
  };
  const viewerOneRepo = createBackendNotificationsRepository(snapshot, null, 'viewer-1');
  const viewerTwoRepo = createBackendNotificationsRepository(snapshot, null, 'viewer-2');

  await viewerOneRepo.markRead({ notificationId: 'shared-notification-1' });

  assert.equal(viewerOneRepo.listNotifications()[0]?.read, true);
  assert.equal(viewerTwoRepo.listNotifications()[0]?.read, false);
});

test('optimistic delete state stays scoped to the current viewer', async () => {
  const snapshot = {
    ...EMPTY_BACKEND_SNAPSHOT,
    socialReadLoaded: false,
    notifications: [
      {
        id: 'shared-notification-2',
        type: 'activity' as const,
        createdAt: 1_700_000_300_100,
        read: false,
        activityType: 'event' as const,
        message: 'Shared notification',
      },
    ],
  };
  const viewerOneRepo = createBackendNotificationsRepository(snapshot, null, 'viewer-1');
  const viewerTwoRepo = createBackendNotificationsRepository(snapshot, null, 'viewer-2');

  await viewerOneRepo.deleteNotification({ notificationId: 'shared-notification-2' });

  assert.equal(viewerOneRepo.listNotifications().length, 0);
  assert.equal(viewerTwoRepo.listNotifications().length, 1);
  assert.equal(viewerTwoRepo.listNotifications()[0]?.id, 'shared-notification-2');
});
