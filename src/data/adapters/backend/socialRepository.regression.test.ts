import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_BACKEND_SNAPSHOT } from './snapshot';
import { createBackendSocialRepository } from './socialRepository';
import { railwayDb } from '../../../lib/railwayRuntime';

function makeIterTable<T>(rows: T[]) {
  return {
    iter: () => rows[Symbol.iterator](),
  };
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function' &&
    typeof (value as { finally?: unknown }).finally === 'function'
  );
}

function withMockRailway<T>(
  dbView: any,
  reducers: Record<string, (...args: any[]) => any> = {},
  run: () => T,
): T {
  const originalDb = Object.getOwnPropertyDescriptor(railwayDb, 'db');
  const originalReducers = Object.getOwnPropertyDescriptor(railwayDb, 'reducers');

  Object.defineProperty(railwayDb, 'db', {
    configurable: true,
    get: () => dbView,
  });
  Object.defineProperty(railwayDb, 'reducers', {
    configurable: true,
    get: () => reducers,
  });

  const restore = () => {
    if (originalDb) {
      Object.defineProperty(railwayDb, 'db', originalDb);
    }
    if (originalReducers) {
      Object.defineProperty(railwayDb, 'reducers', originalReducers);
    }
  };

  try {
    const result = run();
    if (isPromiseLike(result)) {
      return result.finally(restore) as T;
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test('social repository ignores friend compatibility events as roster sources', () => {
  const repo = createBackendSocialRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialUsers: [],
    },
    null,
  );

  const users = withMockRailway(
    {
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([
        {
          id: 'friend-event-1',
          createdAt: 100,
          item: JSON.stringify({
            eventType: 'friend_request',
            fromUserId: 'friend-1',
            fromUserName: 'Friend One',
            toUserId: 'viewer-1',
            toUserName: 'Viewer One',
          }),
        },
        {
          id: 'friend-event-2',
          createdAt: 200,
          item: JSON.stringify({
            eventType: 'friend_response',
            fromUserId: 'friend-2',
            fromUserName: 'Friend Two',
            toUserId: 'viewer-1',
            toUserName: 'Viewer One',
            status: 'accepted',
          }),
        },
      ]),
      livePresenceItem: makeIterTable([]),
      publicLivePresenceItem: makeIterTable([]),
      publicLiveDiscovery: makeIterTable([]),
    },
    {},
    () => repo.listUsers(),
  );

  assert.deepEqual(users, []);
});

test('social repository ignores Railway profile and chat roster rows once backend social snapshot is loaded', () => {
  const repo = createBackendSocialRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialReadLoaded: true,
      socialUsers: [
        {
          id: 'backend-user-1',
          username: 'Backend User',
          avatarUrl: '',
          isOnline: false,
          isLive: false,
          status: 'offline',
          statusText: '',
          lastSeen: '',
        },
      ],
    },
    null,
  );

  const users = withMockRailway(
    {
      publicProfileSummary: makeIterTable([
        {
          userId: 'stale-profile-1',
          username: 'Stale Profile',
        },
      ]),
      globalMessageItem: makeIterTable([
        {
          id: 'profile-event-1',
          createdAt: 100,
          item: JSON.stringify({
            eventType: 'user_profile',
            userId: 'stale-profile-2',
            username: 'Stale Event Profile',
          }),
        },
        {
          id: 'thread-event-1',
          createdAt: 200,
          item: JSON.stringify({
            eventType: 'thread_message',
            fromUserId: 'stale-thread-user',
            toUserId: 'backend-user-1',
            message: {
              id: 'stale-msg-1',
              text: 'hello',
              user: 'Stale Thread User',
            },
          }),
        },
        {
          id: 'chat-event-1',
          createdAt: 300,
          item: JSON.stringify({
            senderId: 'stale-chat-user',
            user: 'Stale Chat User',
          }),
        },
      ]),
      livePresenceItem: makeIterTable([]),
      publicLivePresenceItem: makeIterTable([]),
      publicLiveDiscovery: makeIterTable([]),
    },
    {},
    () => repo.listUsers(),
  );

  assert.deepEqual(users.map((user) => user.id), ['backend-user-1']);
});

test('social repository ignores stale social_status compatibility rows once backend social snapshot is loaded', () => {
  const repo = createBackendSocialRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialReadLoaded: true,
      socialUsers: [
        {
          id: 'backend-user-1',
          username: 'Backend User',
          avatarUrl: '',
          isOnline: false,
          isLive: false,
          status: 'offline',
          statusText: '',
          lastSeen: '',
        },
      ],
    },
    null,
  );

  const users = withMockRailway(
    {
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([
        {
          id: 'status-event-1',
          createdAt: 100,
          item: JSON.stringify({
            eventType: 'social_status',
            userId: 'backend-user-1',
            status: 'live',
            statusText: 'stale-runtime-status',
          }),
        },
      ]),
      livePresenceItem: makeIterTable([]),
      publicLivePresenceItem: makeIterTable([]),
      publicLiveDiscovery: makeIterTable([]),
    },
    {},
    () => repo.listUsers(),
  );

  assert.equal(users.length, 1);
  assert.equal(users[0]?.id, 'backend-user-1');
  assert.equal(users[0]?.status, 'offline');
  assert.equal(users[0]?.isLive, false);
  assert.equal(users[0]?.statusText, '');
});

test('social repository writes status changes through setSocialStatus without sendGlobalMessage fallback', async () => {
  const repo = createBackendSocialRepository(EMPTY_BACKEND_SNAPSHOT, null);
  const setSocialStatusCalls: Array<Record<string, unknown>> = [];
  const sendGlobalMessageCalls: Array<Record<string, unknown>> = [];

  await withMockRailway(
    {
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([]),
      livePresenceItem: makeIterTable([]),
      publicLivePresenceItem: makeIterTable([]),
      publicLiveDiscovery: makeIterTable([]),
    },
    {
      async setSocialStatus(payload: Record<string, unknown>) {
        setSocialStatusCalls.push(payload);
      },
      async sendGlobalMessage(payload: Record<string, unknown>) {
        sendGlobalMessageCalls.push(payload);
      },
    },
    () =>
      repo.updateUserStatus({
        userId: 'viewer-1',
        status: 'busy',
        statusText: 'Heads down',
      }),
  );

  assert.equal(setSocialStatusCalls.length, 1);
  assert.equal(sendGlobalMessageCalls.length, 0);
  assert.equal(setSocialStatusCalls[0]?.userId, 'viewer-1');
  assert.equal(setSocialStatusCalls[0]?.status, 'busy');
  assert.equal(setSocialStatusCalls[0]?.statusText, 'Heads down');
});

test('social repository writes live status changes through setSocialStatus without sendGlobalMessage fallback', async () => {
  const repo = createBackendSocialRepository(EMPTY_BACKEND_SNAPSHOT, null);
  const setSocialStatusCalls: Array<Record<string, unknown>> = [];
  const sendGlobalMessageCalls: Array<Record<string, unknown>> = [];

  await withMockRailway(
    {
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([]),
      livePresenceItem: makeIterTable([]),
      publicLivePresenceItem: makeIterTable([]),
      publicLiveDiscovery: makeIterTable([]),
    },
    {
      async setSocialStatus(payload: Record<string, unknown>) {
        setSocialStatusCalls.push(payload);
      },
      async sendGlobalMessage(payload: Record<string, unknown>) {
        sendGlobalMessageCalls.push(payload);
      },
    },
    () =>
      repo.setUserLive({
        userId: 'viewer-1',
        isLive: true,
      }),
  );

  assert.equal(setSocialStatusCalls.length, 1);
  assert.equal(sendGlobalMessageCalls.length, 0);
  assert.equal(setSocialStatusCalls[0]?.userId, 'viewer-1');
  assert.equal(setSocialStatusCalls[0]?.status, 'live');
  assert.equal(setSocialStatusCalls[0]?.statusText, null);
  assert.equal(setSocialStatusCalls[0]?.lastSeen, null);
});

test('social repository does not leak social users across repository instances', () => {
  const firstRepo = createBackendSocialRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialUsers: [
        {
          id: 'viewer-a-user',
          username: 'Viewer A User',
          avatarUrl: '',
          isOnline: false,
          isLive: false,
          status: 'offline',
          statusText: '',
          lastSeen: '',
        },
      ],
    },
    null,
  );
  assert.equal(firstRepo.listUsers().length, 1);

  const secondRepo = createBackendSocialRepository(EMPTY_BACKEND_SNAPSHOT, null);
  const users = withMockRailway(
    {
      publicProfileSummary: makeIterTable([]),
      globalMessageItem: makeIterTable([]),
      livePresenceItem: makeIterTable([]),
      publicLivePresenceItem: makeIterTable([]),
      publicLiveDiscovery: makeIterTable([]),
    },
    {},
    () => secondRepo.listUsers(),
  );
  assert.deepEqual(users, []);
});

test('social repository rejects backend-authoritative status writes when backend persistence fails', async () => {
  const repo = createBackendSocialRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialReadLoaded: true,
    },
    {
      get: async () => {
        throw new Error('not implemented');
      },
      post: async () => {
        throw new Error('backend status write failed');
      },
      del: async () => {
        throw new Error('not implemented');
      },
      setAuth: () => {},
      clearAuth: () => {},
    },
  );

  await assert.rejects(
    withMockRailway(
      {
        publicProfileSummary: makeIterTable([]),
        globalMessageItem: makeIterTable([]),
        livePresenceItem: makeIterTable([]),
        publicLivePresenceItem: makeIterTable([]),
        publicLiveDiscovery: makeIterTable([]),
      },
      {
        async setSocialStatus() {
          return undefined;
        },
      },
      () =>
        repo.updateUserStatus({
          userId: 'viewer-1',
          status: 'online',
        }),
    ),
    /backend status write failed/i,
  );
});
