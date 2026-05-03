import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_BACKEND_SNAPSHOT } from './snapshot';
import { createBackendMessagesRepository } from './messagesRepository';
import type { BackendHttpClient } from './httpClient';
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

function createRepo(
  viewerUserId: string,
  snapshot = EMPTY_BACKEND_SNAPSHOT,
  client: BackendHttpClient | null = null,
) {
  return createBackendMessagesRepository(snapshot, client, viewerUserId);
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
  const conversations = withMockRailway(dbView, {}, () => repo.listConversations());

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0]?.otherUserId, 'friend-1');
  assert.equal(conversations[0]?.unreadCount, 3);
  assert.equal(conversations[0]?.lastMessage.text, 'hey there');
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
  const messages = withMockRailway(dbView, {}, () => repo.listThreadSeedMessages('friend-2'));

  assert.deepEqual(messages.map((message) => message.id), ['m-1', 'm-2']);
  assert.equal(messages[0]?.user, 'Friend Two');
  assert.equal(messages[0]?.readAt, 150);
  assert.equal(messages[1]?.senderId, 'me');
  assert.equal(messages.find((message) => message.id === 'leak-1'), undefined);
});

test('backend conversations are authoritative when messages snapshot is loaded', () => {
  const viewerUserId = 'viewer-backend-1';
  const snapshot = {
    ...EMPTY_BACKEND_SNAPSHOT,
    messagesReadLoaded: true,
    conversations: [
      {
        id: 'viewer-backend-1::friend-backend-1',
        otherUserId: 'friend-backend-1',
        unreadCount: 1,
        lastMessage: {
          id: 'backend-last',
          senderId: 'friend-backend-1',
          text: 'backend wins',
          createdAt: new Date(1_700_000_100_000).toISOString(),
          deliveredAt: 1_700_000_100_000,
        },
      },
    ],
  };
  const dbView = {
    myConversations: makeIterTable([
      {
        id: 'viewer-backend-1::friend-stale',
        ownerUserId: viewerUserId,
        otherUserId: 'friend-stale',
        item: JSON.stringify({
          id: 'viewer-backend-1::friend-stale',
          otherUserId: 'friend-stale',
          unreadCount: 9,
          lastMessage: {
            id: 'stale-last',
            senderId: 'friend-stale',
            text: 'stale railway row',
            createdAt: new Date(1_699_999_000_000).toISOString(),
          },
        }),
      },
    ]),
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createRepo(viewerUserId, snapshot);
  const conversations = withMockRailway(dbView, {}, () => repo.listConversations());

  assert.deepEqual(conversations.map((conversation) => conversation.otherUserId), [
    'friend-backend-1',
  ]);
  assert.equal(conversations[0]?.lastMessage.text, 'backend wins');
});

test('backend thread messages are authoritative when messages snapshot is loaded', () => {
  const viewerUserId = 'viewer-backend-2';
  const snapshot = {
    ...EMPTY_BACKEND_SNAPSHOT,
    messagesReadLoaded: true,
    socialUsers: [
      {
        id: 'friend-backend-2',
        username: 'Friend Backend Two',
        avatarUrl: '',
        isOnline: false,
      },
    ],
    threadSeedMessagesByUserId: {
      'friend-backend-2': [
        {
          id: 'backend-thread-1',
          senderId: 'friend-backend-2',
          user: 'friend-backend-2',
          text: 'backend thread wins',
          createdAt: 120,
          deliveredAt: 120,
        },
      ],
    },
  };
  const dbView = {
    myConversationMessages: makeIterTable([
      {
        id: 'viewer-backend-2::friend-backend-2',
        ownerUserId: viewerUserId,
        otherUserId: 'friend-backend-2',
        messages: JSON.stringify([
          {
            id: 'stale-thread-1',
            senderId: 'friend-backend-2',
            user: 'friend-backend-2',
            text: 'stale railway thread row',
            createdAt: 10,
          },
        ]),
      },
    ]),
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createRepo(viewerUserId, snapshot);
  const messages = withMockRailway(dbView, {}, () => repo.listThreadSeedMessages('friend-backend-2'));

  assert.deepEqual(messages.map((message) => message.id), ['backend-thread-1']);
  assert.equal(messages[0]?.text, 'backend thread wins');
  assert.equal(messages[0]?.user, 'Friend Backend Two');
});

test('backend social snapshot identity is authoritative for global chat labels when social data is loaded', () => {
  const viewerUserId = 'viewer-backend-global-1';
  const snapshot = {
    ...EMPTY_BACKEND_SNAPSHOT,
    socialReadLoaded: true,
    socialUsers: [
      {
        id: 'friend-backend-global-1',
        username: 'Backend Global Friend',
        avatarUrl: '',
        isOnline: true,
        isLive: false,
        status: 'online' as const,
        statusText: '',
        lastSeen: '',
      },
    ],
  };
  const dbView = {
    globalMessageItem: makeIterTable([
      {
        id: 'stale-profile-event-1',
        createdAt: 50,
        item: JSON.stringify({
          eventType: 'user_profile',
          userId: 'friend-backend-global-1',
          username: 'Stale Runtime Name',
        }),
      },
      {
        id: 'global-msg-1',
        roomId: 'global',
        createdAt: 100,
        item: JSON.stringify({
          id: 'global-msg-1',
          eventType: 'global_chat_message',
          senderId: 'friend-backend-global-1',
          user: 'friend-backend-global-1',
          text: 'hello global',
          createdAt: 100,
        }),
      },
    ]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createRepo(viewerUserId, snapshot);
  const messages = withMockRailway(dbView, {}, () =>
    repo.listGlobalMessages({ roomId: 'global', limit: 20 }),
  );

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.id, 'global-msg-1');
  assert.equal(messages[0]?.user, 'Backend Global Friend');
  assert.equal(messages[0]?.text, 'hello global');
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
  const firstRead = withMockRailway(dbView, {}, () => repo.listThreadSeedMessages('friend-4'));
  assert.equal(firstRead.length, 1);

  row.messages = JSON.stringify([]);
  const secondRead = withMockRailway(dbView, {}, () => repo.listThreadSeedMessages('friend-4'));
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
  await withMockRailway(dbView, reducers, async () => {
    await repo.markConversationRead({ userId: 'friend-5' });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.readerUserId, viewerUserId);
  assert.equal(calls[0]?.otherUserId, 'friend-5');
  assert.equal(typeof calls[0]?.conversationKey, 'string');
  assert.equal(typeof calls[0]?.readAt, 'string');
});

test('markConversationRead writes backend durability after railway reducer succeeds', async () => {
  const viewerUserId = 'viewer-4b';
  const reducerCalls: Array<Record<string, unknown>> = [];
  const backendCalls: Array<{ path: string; body: unknown }> = [];
  const reducers = {
    markConversationRead: async (args: Record<string, unknown>) => {
      reducerCalls.push(args);
    },
  };
  const client: BackendHttpClient = {
    setAuth() {},
    clearAuth() {},
    get: async <T>() => ({} as T),
    post: async <T>(path: string, body?: unknown) => {
      backendCalls.push({ path, body });
      return {} as T;
    },
    del: async <T>() => ({} as T),
  };

  const dbView = {
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createBackendMessagesRepository(EMPTY_BACKEND_SNAPSHOT, client, viewerUserId);
  await withMockRailway(dbView, reducers, async () => {
    await repo.markConversationRead({ userId: 'friend-5b' });
  });

  assert.equal(reducerCalls.length, 1);
  assert.equal(backendCalls.length, 1);
  assert.equal(backendCalls[0]?.path, '/api/messages/read');
  assert.deepEqual(backendCalls[0]?.body, {
    conversationKey: 'friend-5b::viewer-4b',
    readerUserId: 'viewer-4b',
    otherUserId: 'friend-5b',
    readAt: Number(reducerCalls[0]?.readAt),
    source: 'conversation_read',
  });
});

test('markConversationRead still writes backend durability when railway reducer fails', async () => {
  const viewerUserId = 'viewer-4c';
  const backendCalls: Array<{ path: string; body: unknown }> = [];
  const reducers = {
    markConversationRead: async () => {
      throw new Error('railway unavailable');
    },
  };
  const client: BackendHttpClient = {
    setAuth() {},
    clearAuth() {},
    get: async <T>() => ({} as T),
    post: async <T>(path: string, body?: unknown) => {
      backendCalls.push({ path, body });
      return {} as T;
    },
    del: async <T>() => ({} as T),
  };

  const dbView = {
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createBackendMessagesRepository(EMPTY_BACKEND_SNAPSHOT, client, viewerUserId);
  await withMockRailway(dbView, reducers, async () => {
    await repo.markConversationRead({ userId: 'friend-5c' });
  });

  assert.equal(backendCalls.length, 1);
  assert.equal(backendCalls[0]?.path, '/api/messages/read');
  assert.equal((backendCalls[0]?.body as { conversationKey?: string }).conversationKey, 'friend-5c::viewer-4c');
});

test('sendThreadMessage writes backend-owned reply notification after railway send', async () => {
  const viewerUserId = 'viewer-5';
  const reducerCalls: Array<Record<string, unknown>> = [];
  const backendCalls: Array<{ path: string; body: unknown }> = [];
  const reducers = {
    sendThreadMessage: async (args: Record<string, unknown>) => {
      reducerCalls.push(args);
    },
  };
  const client: BackendHttpClient = {
    setAuth() {},
    clearAuth() {},
    get: async <T>() => ({ } as T),
    post: async <T>(path: string, body?: unknown) => {
      backendCalls.push({ path, body });
      return {} as T;
    },
    del: async <T>() => ({ } as T),
  };
  const dbView = {
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createBackendMessagesRepository(EMPTY_BACKEND_SNAPSHOT, client, viewerUserId);
  await withMockRailway(dbView, reducers, async () => {
    await repo.sendThreadMessage({
      userId: 'friend-6',
      message: {
        id: 'msg-1',
        senderId: viewerUserId,
        user: 'Viewer Five',
        text: 'hello there',
        createdAt: 1_700_000_123_456,
        replyTo: {
          id: 'msg-0',
          user: 'Friend Six',
          text: 'earlier',
          senderId: 'friend-6',
        },
      },
    });
  });

  assert.equal(reducerCalls.length, 1);
  assert.equal(backendCalls.length, 2);
  assert.equal(backendCalls[0]?.path, '/api/messages/thread');
  assert.deepEqual(backendCalls[0]?.body, {
    id: 'msg-1',
    conversationKey: 'friend-6::viewer-5',
    fromUserId: 'viewer-5',
    toUserId: 'friend-6',
    message: {
      id: 'msg-1',
      senderId: 'viewer-5',
      user: 'Viewer Five',
      text: 'hello there',
      createdAt: 1_700_000_123_456,
      replyTo: {
        id: 'msg-0',
        user: 'Friend Six',
        text: 'earlier',
        senderId: 'friend-6',
      },
    },
    createdAt: 1_700_000_123_456,
    source: 'thread_message',
  });
  assert.equal(backendCalls[1]?.path, '/api/social/thread-reply');
  assert.deepEqual(backendCalls[1]?.body, {
    id: 'thread-reply:msg-1',
    conversationKey: 'friend-6::viewer-5',
    messageId: 'msg-1',
    targetUserId: 'friend-6',
    fromUserId: 'viewer-5',
    fromUserName: 'Viewer Five',
    messageText: 'hello there',
    createdAt: 1_700_000_123_456,
    replyToMessageId: 'msg-0',
    source: 'thread_message',
  });
});

test('sendThreadMessage still writes backend durability when railway transport fails', async () => {
  const viewerUserId = 'viewer-5b';
  const backendCalls: Array<{ path: string; body: unknown }> = [];
  const reducers = {
    sendThreadMessage: async () => {
      throw new Error('railway unavailable');
    },
  };
  const client: BackendHttpClient = {
    setAuth() {},
    clearAuth() {},
    get: async <T>() => ({} as T),
    post: async <T>(path: string, body?: unknown) => {
      backendCalls.push({ path, body });
      return {} as T;
    },
    del: async <T>() => ({} as T),
  };
  const dbView = {
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createBackendMessagesRepository(EMPTY_BACKEND_SNAPSHOT, client, viewerUserId);
  await withMockRailway(dbView, reducers, async () => {
    await repo.sendThreadMessage({
      userId: 'friend-6b',
      message: {
        id: 'msg-1b',
        senderId: viewerUserId,
        user: 'Viewer Five B',
        text: 'hello durable',
        createdAt: 1_700_000_123_999,
      },
    });
  });

  assert.equal(backendCalls.length, 2);
  assert.equal(backendCalls[0]?.path, '/api/messages/thread');
  assert.equal(backendCalls[1]?.path, '/api/social/thread-reply');
});

test('sendThreadMessage writes backend-owned mention notifications after railway send', async () => {
  const viewerUserId = 'viewer-6';
  const reducerCalls: Array<Record<string, unknown>> = [];
  const backendCalls: Array<{ path: string; body: unknown }> = [];
  const reducers = {
    sendThreadMessage: async (args: Record<string, unknown>) => {
      reducerCalls.push(args);
    },
  };
  const client: BackendHttpClient = {
    setAuth() {},
    clearAuth() {},
    get: async <T>() => ({} as T),
    post: async <T>(path: string, body?: unknown) => {
      backendCalls.push({ path, body });
      return {} as T;
    },
    del: async <T>() => ({} as T),
  };
  const dbView = {
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createBackendMessagesRepository(EMPTY_BACKEND_SNAPSHOT, client, viewerUserId);
  await withMockRailway(dbView, reducers, async () => {
    await repo.sendThreadMessage({
      userId: 'friend-7',
      message: {
        id: 'msg-mention-1',
        senderId: viewerUserId,
        user: 'Viewer Six',
        text: 'hello @friend.seven and @friend_seven',
        createdAt: 1_700_000_223_456,
      },
    });
  });

  assert.equal(reducerCalls.length, 1);
  assert.equal(backendCalls.length, 3);
  assert.equal(backendCalls[0]?.path, '/api/messages/thread');
  assert.deepEqual(backendCalls[0]?.body, {
    id: 'msg-mention-1',
    conversationKey: 'friend-7::viewer-6',
    fromUserId: 'viewer-6',
    toUserId: 'friend-7',
    message: {
      id: 'msg-mention-1',
      senderId: 'viewer-6',
      user: 'Viewer Six',
      text: 'hello @friend.seven and @friend_seven',
      createdAt: 1_700_000_223_456,
    },
    createdAt: 1_700_000_223_456,
    source: 'thread_message',
  });
  assert.equal(backendCalls[2]?.path, '/api/social/mention');
  assert.deepEqual(backendCalls[2]?.body, {
    id: 'mention:msg-mention-1',
    messageId: 'msg-mention-1',
    handles: ['friend.seven', 'friend_seven'],
    messageText: 'hello @friend.seven and @friend_seven',
    fromUserName: 'Viewer Six',
    createdAt: 1_700_000_223_456,
    conversationKey: 'friend-7::viewer-6',
    roomId: null,
    source: 'thread_message',
  });
});

test('sendThreadMessage writes backend-owned money-received notifications for cash messages', async () => {
  const viewerUserId = 'viewer-cash-1';
  const reducerCalls: Array<Record<string, unknown>> = [];
  const backendCalls: Array<{ path: string; body: unknown }> = [];
  const reducers = {
    sendThreadMessage: async (args: Record<string, unknown>) => {
      reducerCalls.push(args);
    },
  };
  const client: BackendHttpClient = {
    setAuth() {},
    clearAuth() {},
    get: async <T>() => ({} as T),
    post: async <T>(path: string, body?: unknown) => {
      backendCalls.push({ path, body });
      return {} as T;
    },
    del: async <T>() => ({} as T),
  };
  const dbView = {
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createBackendMessagesRepository(EMPTY_BACKEND_SNAPSHOT, client, viewerUserId);
  await withMockRailway(dbView, reducers, async () => {
    await repo.sendThreadMessage({
      userId: 'friend-cash-1',
      message: {
        id: 'msg-cash-1',
        senderId: viewerUserId,
        user: 'Viewer Cash',
        text: 'Sent $25 cash',
        createdAt: 1_700_000_323_456,
        type: 'cash',
        amount: 25,
      },
    });
  });

  assert.equal(reducerCalls.length, 1);
  assert.equal(backendCalls.length, 3);
  assert.equal(backendCalls[0]?.path, '/api/messages/thread');
  assert.equal(backendCalls[1]?.path, '/api/social/thread-reply');
  assert.equal(backendCalls[2]?.path, '/api/social/money-received');
  assert.deepEqual(backendCalls[2]?.body, {
    id: 'money-received:msg-cash-1',
    conversationKey: 'friend-cash-1::viewer-cash-1',
    messageId: 'msg-cash-1',
    targetUserId: 'friend-cash-1',
    fromUserId: 'viewer-cash-1',
    fromUserName: 'Viewer Cash',
    amount: 25,
    createdAt: 1_700_000_323_456,
    source: 'cash_message',
  });
});

test('sendGlobalMessage writes backend-owned mention notifications after railway send', async () => {
  const viewerUserId = 'viewer-7';
  const reducerCalls: Array<Record<string, unknown>> = [];
  const backendCalls: Array<{ path: string; body: unknown }> = [];
  const reducers = {
    sendGlobalMessage: async (args: Record<string, unknown>) => {
      reducerCalls.push(args);
    },
  };
  const client: BackendHttpClient = {
    setAuth() {},
    clearAuth() {},
    get: async <T>() => ({} as T),
    post: async <T>(path: string, body?: unknown) => {
      backendCalls.push({ path, body });
      return {} as T;
    },
    del: async <T>() => ({} as T),
  };
  const dbView = {
    globalMessageItem: makeIterTable([]),
    publicProfileSummary: makeIterTable([]),
  };

  const repo = createBackendMessagesRepository(EMPTY_BACKEND_SNAPSHOT, client, viewerUserId);
  await withMockRailway(dbView, reducers, async () => {
    await repo.sendGlobalMessage({
      clientMessageId: 'global-mention-1',
      roomId: 'global',
      message: {
        id: 'global-mention-1',
        senderId: viewerUserId,
        user: 'Viewer Seven',
        text: 'hey @friend_eight',
        createdAt: 1_700_000_323_456,
      },
    });
  });

  assert.equal(reducerCalls.length, 1);
  assert.equal(backendCalls.length, 1);
  assert.equal(backendCalls[0]?.path, '/api/social/mention');
  assert.deepEqual(backendCalls[0]?.body, {
    id: 'mention:global-mention-1',
    messageId: 'global-mention-1',
    handles: ['friend_eight'],
    messageText: 'hey @friend_eight',
    fromUserName: 'Viewer Seven',
    createdAt: 1_700_000_323_456,
    conversationKey: null,
    roomId: 'global',
    source: 'global_message',
  });
});

test('listMentionUsers falls back to backend social users when legacy mention list is empty', () => {
  const repo = createBackendMessagesRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialUsers: [
        {
          id: 'social-user-1',
          username: 'friend.one',
          avatarUrl: '',
          isOnline: true,
          isLive: false,
          status: 'online',
          statusText: '',
          lastSeen: '',
        },
        {
          id: 'social-user-2',
          username: 'friend_two',
          avatarUrl: '',
          isOnline: false,
          isLive: false,
          status: 'offline',
          statusText: '',
          lastSeen: '',
        },
      ],
      mentionUsers: [],
    },
    null,
    'viewer-8',
  );

  const mentionUsers = repo.listMentionUsers({ limit: 10 });

  assert.deepEqual(mentionUsers, [
    { id: 'social-user-1', name: 'friend.one' },
    { id: 'social-user-2', name: 'friend_two' },
  ]);
});
