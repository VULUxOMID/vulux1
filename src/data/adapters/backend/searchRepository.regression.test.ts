import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_BACKEND_SNAPSHOT } from './snapshot';
import { createBackendSearchRepository } from './searchRepository';

test('search repository does not leak cached index data across viewers', () => {
  const firstRepo = createBackendSearchRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      socialUsers: [
        {
          id: 'viewer-a-user',
          username: 'Viewer A',
          avatarUrl: '',
          isOnline: false,
          status: 'offline',
        },
      ],
      conversations: [
        {
          id: 'conversation-a',
          otherUserId: 'viewer-a-user',
          unreadCount: 0,
          lastMessage: {
            id: 'message-a',
            senderId: 'viewer-a-user',
            text: 'hello from a',
            createdAt: new Date(1_000).toISOString(),
          },
        },
      ],
    },
    'viewer-a',
  );
  assert.equal(firstRepo.listIndex().conversations.length, 1);

  const secondRepo = createBackendSearchRepository(EMPTY_BACKEND_SNAPSHOT, 'viewer-b');
  assert.deepEqual(secondRepo.listIndex(), {
    users: [],
    conversations: [],
    lives: [],
  });
});
