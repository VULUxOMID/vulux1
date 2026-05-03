import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_BACKEND_SNAPSHOT } from './snapshot';
import { createBackendFriendshipsRepository } from './friendshipsRepository';
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

test('friendships repository ignores globalMessageItem compatibility events and uses backend snapshot only', () => {
  const repo = createBackendFriendshipsRepository({
    ...EMPTY_BACKEND_SNAPSHOT,
    socialReadLoaded: false,
    acceptedFriendIds: [],
  }, 'viewer-1');

  const accepted = withMockRailway(
    {
      myFriendships: makeIterTable([]),
      globalMessageItem: makeIterTable([
        {
          id: 'friend-event-1',
          createdAt: 100,
          item: JSON.stringify({
            eventType: 'friend_response',
            pairKey: 'friend-1::viewer-1',
            fromUserId: 'friend-1',
            toUserId: 'viewer-1',
            status: 'accepted',
          }),
        },
      ]),
    },
    () => repo.listAcceptedFriendIds(),
  );

  assert.deepEqual(accepted, []);
});
