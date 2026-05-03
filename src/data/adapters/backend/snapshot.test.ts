import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_BACKEND_SNAPSHOT, mergeBackendSnapshot } from './snapshot';

function makeLiveItem(id: string) {
  return {
    id,
    title: `Live ${id}`,
    viewers: 1,
    images: [],
    hosts: [],
  };
}

test('mergeBackendSnapshot preserves untouched search index categories for social-only patches', () => {
  const merged = mergeBackendSnapshot(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      searchIndex: {
        users: [],
        conversations: [
          {
            id: 'conversation-a',
            otherUserId: 'user-a',
            unreadCount: 0,
            lastMessage: {
              id: 'message-a',
              senderId: 'user-a',
              text: 'hello',
              createdAt: new Date(1_000).toISOString(),
            },
          },
        ],
        lives: [
          makeLiveItem('live-a'),
        ],
      },
    },
    {
      socialUsers: [
        {
          id: 'user-b',
          username: 'User B',
          avatarUrl: '',
          isOnline: false,
          status: 'offline',
        },
      ],
      searchIndex: {
        users: [
          {
            id: 'user-b',
            username: 'User B',
            avatarUrl: '',
            isOnline: false,
            status: 'offline',
          },
        ],
      },
    },
  );

  assert.equal(merged.searchIndex.users.length, 1);
  assert.equal(merged.searchIndex.conversations.length, 1);
  assert.equal(merged.searchIndex.lives.length, 1);
});

test('mergeBackendSnapshot preserves untouched search index categories for messages-only patches', () => {
  const merged = mergeBackendSnapshot(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      searchIndex: {
        users: [
          {
            id: 'user-a',
            username: 'User A',
            avatarUrl: '',
            isOnline: false,
            status: 'offline',
          },
        ],
        conversations: [],
        lives: [
          makeLiveItem('live-a'),
        ],
      },
    },
    {
      conversations: [
        {
          id: 'conversation-b',
          otherUserId: 'user-b',
          unreadCount: 1,
          lastMessage: {
            id: 'message-b',
            senderId: 'user-b',
            text: 'new message',
            createdAt: new Date(2_000).toISOString(),
          },
        },
      ],
      searchIndex: {
        conversations: [
          {
            id: 'conversation-b',
            otherUserId: 'user-b',
            unreadCount: 1,
            lastMessage: {
              id: 'message-b',
              senderId: 'user-b',
              text: 'new message',
              createdAt: new Date(2_000).toISOString(),
            },
          },
        ],
      },
    },
  );

  assert.equal(merged.searchIndex.users.length, 1);
  assert.equal(merged.searchIndex.conversations.length, 1);
  assert.equal(merged.searchIndex.lives.length, 1);
});
