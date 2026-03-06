import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_BACKEND_SNAPSHOT } from './snapshot';
import { createBackendMessagesRepository } from './messagesRepository';
import { spacetimeDb } from '../../../lib/spacetime';

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

function withMockSpacetime<T>(
  dbView: any,
  reducers: Record<string, (...args: any[]) => any> = {},
  run: () => T,
): T {
  const originalDb = Object.getOwnPropertyDescriptor(spacetimeDb, 'db');
  const originalReducers = Object.getOwnPropertyDescriptor(spacetimeDb, 'reducers');

  Object.defineProperty(spacetimeDb, 'db', {
    configurable: true,
    get: () => dbView,
  });
  Object.defineProperty(spacetimeDb, 'reducers', {
    configurable: true,
    get: () => reducers,
  });

  const restore = () => {
    if (originalDb) {
      Object.defineProperty(spacetimeDb, 'db', originalDb);
    }
    if (originalReducers) {
      Object.defineProperty(spacetimeDb, 'reducers', originalReducers);
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

function createRepo(viewerUserId: string) {
  return createBackendMessagesRepository(EMPTY_BACKEND_SNAPSHOT, null, viewerUserId);
}

test('my_conversations rows are authoritative for thread list with unread + preview', () => {
  const viewerUserId = 'viewer-1';
  const conversationRows = [
    {
      id: 'viewer-1::friend-1',
      ownerUserId: viewerUserId,
      otherUserId: 'friend-1',
      item: JSON.stringify({
        id: 'viewer-1::friend-1',
        otherUserId: 'friend-1',
        unreadCount: 3,
        lastMessage: {
          id: 'm-last',
          senderId: 'friend-1',
          text: 'hey there',
          createdAt: new Date(1_700_000_000_000).toISOString(),
          deliveredAt: 1_700_000_000_000,
        },
      }),
      updatedAt: 1_700_000_000_000,
    },
  ];

  const dbView = {
    myConversations: makeIterTable(conversationRows),
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createRepo(viewerUserId);
  const conversations = withMockSpacetime(dbView, {}, () => repo.listConversations());

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0]?.otherUserId, 'friend-1');
  assert.equal(conversations[0]?.unreadCount, 3);
  assert.equal(conversations[0]?.lastMessage.text, 'hey there');
});

test('conversation fallback remains visible while my_conversations is active but not yet hydrated', () => {
  const viewerUserId = 'viewer-hydration-1';
  const snapshot = {
    ...EMPTY_BACKEND_SNAPSHOT,
    conversations: [
      {
        id: 'viewer-hydration-1::friend-hydration-1',
        otherUserId: 'friend-hydration-1',
        unreadCount: 1,
        lastMessage: {
          id: 'fallback-1',
          senderId: 'friend-hydration-1',
          text: 'fallback message',
          createdAt: new Date(1_700_000_100_000).toISOString(),
          deliveredAt: 1_700_000_100_000,
        },
      },
    ],
  };
  const repo = createBackendMessagesRepository(snapshot, null, viewerUserId, {
    isViewRequested: (viewName) => viewName === 'my_conversations',
    isViewActive: (viewName) => viewName === 'my_conversations',
  });
  const dbView = {
    myConversations: makeIterTable([]),
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const conversations = withMockSpacetime(dbView, {}, () => repo.listConversations());
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0]?.otherUserId, 'friend-hydration-1');
  assert.equal(conversations[0]?.lastMessage.text, 'fallback message');
});

test('my_conversation_messages are room-scoped, de-duped, and identity-hydrated', () => {
  const viewerUserId = 'viewer-2';
  const threadRows = [
    {
      id: 'viewer-2::friend-2',
      ownerUserId: viewerUserId,
      otherUserId: 'friend-2',
      messages: JSON.stringify([
        {
          id: 'm-1',
          senderId: 'friend-2',
          user: 'friend-2',
          text: 'first',
          createdAt: 101,
          deliveredAt: 101,
        },
        {
          id: 'm-1',
          senderId: 'friend-2',
          user: 'friend-2',
          text: 'first',
          createdAt: 101,
          deliveredAt: 101,
          readAt: 150,
        },
        {
          id: 'm-2',
          senderId: viewerUserId,
          user: 'You',
          text: 'reply',
          createdAt: 200,
          deliveredAt: 205,
        },
      ]),
      updatedAt: 200,
    },
    {
      id: 'viewer-2::friend-3',
      ownerUserId: viewerUserId,
      otherUserId: 'friend-3',
      messages: JSON.stringify([
        {
          id: 'leak-1',
          senderId: 'friend-3',
          user: 'friend-3',
          text: 'should not leak',
          createdAt: 999,
        },
      ]),
      updatedAt: 999,
    },
  ];

  const dbView = {
    myConversationMessages: makeIterTable(threadRows),
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([
      {
        userId: 'friend-2',
        username: 'friend_two',
        displayName: 'Friend Two',
        avatarUrl: 'https://cdn.example/friend-two.png',
      },
    ]),
  };

  const repo = createRepo(viewerUserId);
  const messages = withMockSpacetime(dbView, {}, () => repo.listThreadSeedMessages('friend-2'));

  assert.deepEqual(messages.map((message) => message.id), ['m-1', 'm-2']);
  assert.equal(messages[0]?.user, 'Friend Two');
  assert.equal(messages[0]?.readAt, 150);
  assert.equal(messages[1]?.senderId, 'me');
  assert.equal(messages.find((message) => message.id === 'leak-1'), undefined);
});

test('thread fallback remains visible while my_conversation_messages is active but not yet hydrated', () => {
  const viewerUserId = 'viewer-hydration-2';
  const snapshot = {
    ...EMPTY_BACKEND_SNAPSHOT,
    threadSeedMessagesByUserId: {
      'friend-hydration-2': [
        {
          id: 'fallback-thread-1',
          senderId: 'friend-hydration-2',
          user: 'Friend Hydration',
          text: 'fallback thread message',
          createdAt: 1_700_000_200_000,
          deliveredAt: 1_700_000_200_000,
        },
      ],
    },
  };
  const repo = createBackendMessagesRepository(snapshot, null, viewerUserId, {
    isViewRequested: (viewName) => viewName === 'my_conversation_messages',
    isViewActive: (viewName) => viewName === 'my_conversation_messages',
  });
  const dbView = {
    myConversationMessages: makeIterTable([]),
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const messages = withMockSpacetime(dbView, {}, () => repo.listThreadSeedMessages('friend-hydration-2'));
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.id, 'fallback-thread-1');
  assert.equal(messages[0]?.text, 'fallback thread message');
});

test('authoritative empty thread row clears stale cache instead of replaying old messages', () => {
  const viewerUserId = 'viewer-3';
  const row = {
    id: 'viewer-3::friend-4',
    ownerUserId: viewerUserId,
    otherUserId: 'friend-4',
    messages: JSON.stringify([
      {
        id: 'stale-1',
        senderId: 'friend-4',
        user: 'friend-4',
        text: 'old',
        createdAt: 10,
      },
    ]),
    updatedAt: 10,
  };

  const rows = [row];
  const dbView = {
    myConversationMessages: makeIterTable(rows),
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createRepo(viewerUserId);
  const firstRead = withMockSpacetime(dbView, {}, () => repo.listThreadSeedMessages('friend-4'));
  assert.equal(firstRead.length, 1);

  row.messages = JSON.stringify([]);
  const secondRead = withMockSpacetime(dbView, {}, () => repo.listThreadSeedMessages('friend-4'));
  assert.deepEqual(secondRead, []);
});

test('markConversationRead dispatches reducer contract for unread clear', async () => {
  const viewerUserId = 'viewer-4';
  const calls: Array<Record<string, unknown>> = [];
  const reducers = {
    markConversationRead: async (args: Record<string, unknown>) => {
      calls.push(args);
    },
  };

  const dbView = {
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createRepo(viewerUserId);
  await withMockSpacetime(dbView, reducers, async () => {
    await repo.markConversationRead({ userId: 'friend-5' });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.readerUserId, viewerUserId);
  assert.equal(calls[0]?.otherUserId, 'friend-5');
  assert.equal(typeof calls[0]?.conversationKey, 'string');
  assert.equal(typeof calls[0]?.readAt, 'string');
});
