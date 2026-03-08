import test from 'node:test';
import assert from 'node:assert/strict';

import { EMPTY_BACKEND_SNAPSHOT } from './snapshot';
import { createBackendLeaderboardRepository } from './leaderboardRepository';
import { spacetimeDb } from '../../../lib/spacetime';

function makeIterTable<T>(rows: T[]) {
  return {
    iter: () => rows[Symbol.iterator](),
  };
}

function withMockSpacetime<T>(dbView: any, run: () => T): T {
  const originalDb = Object.getOwnPropertyDescriptor(spacetimeDb, 'db');

  Object.defineProperty(spacetimeDb, 'db', {
    configurable: true,
    get: () => dbView,
  });

  try {
    return run();
  } finally {
    if (originalDb) {
      Object.defineProperty(spacetimeDb, 'db', originalDb);
    }
  }
}

test('authoritative public_leaderboard rows render even when snapshot rows are empty', () => {
  const dbView = {
    publicLeaderboard: makeIterTable([
      { userId: 'host-user', score: 5000, gold: 5000, gems: 0 },
      { userId: 'viewer-user', score: 3000, gold: 3000, gems: 0 },
    ]),
    publicProfileSummary: makeIterTable([
      { userId: 'host-user', username: 'host_alpha', avatarUrl: 'https://cdn.example/host.png' },
      { userId: 'viewer-user', username: 'viewer_beta', avatarUrl: 'https://cdn.example/viewer.png' },
    ]),
  };

  const repo = createBackendLeaderboardRepository(EMPTY_BACKEND_SNAPSHOT, 'host-user');
  const items = withMockSpacetime(dbView, () => repo.listLeaderboardItems());

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => ({
      id: item.id,
      rank: item.rank,
      username: item.username,
      cashAmount: item.cashAmount,
      isCurrentUser: item.isCurrentUser,
    })),
    [
      {
        id: 'host-user',
        rank: 1,
        username: 'host_alpha',
        cashAmount: 5000,
        isCurrentUser: true,
      },
      {
        id: 'viewer-user',
        rank: 2,
        username: 'viewer_beta',
        cashAmount: 3000,
        isCurrentUser: false,
      },
    ],
  );
});

test('snapshot rows remain the fallback until authoritative public_leaderboard hydrates', () => {
  const repo = createBackendLeaderboardRepository(
    {
      ...EMPTY_BACKEND_SNAPSHOT,
      leaderboardItems: [
        {
          id: 'host-user',
          rank: 1,
          displayName: 'Host User',
          username: 'host_alpha',
          avatarUrl: '',
          cashAmount: 5000,
          isCurrentUser: true,
        },
        {
          id: 'viewer-user',
          rank: 2,
          displayName: 'Viewer User',
          username: 'viewer_beta',
          avatarUrl: '',
          cashAmount: 3000,
          isCurrentUser: false,
        },
      ],
    },
    'host-user',
  );

  const items = withMockSpacetime(
    {
      publicLeaderboard: makeIterTable([]),
      publicProfileSummary: makeIterTable([]),
    },
    () => repo.listLeaderboardItems({ includeCurrentUser: false }),
  );

  assert.deepEqual(items.map((item) => item.id), ['viewer-user']);
  assert.equal(items[0]?.username, 'viewer_beta');
});


test('authoritative public_leaderboard row identity fields override raw user-id fallback', () => {
  const repo = createBackendLeaderboardRepository(EMPTY_BACKEND_SNAPSHOT, null);
  const [row] = withMockSpacetime(
    {
      publicLeaderboard: makeIterTable([
        {
          userId: '835d631d-0abe-421d-a1a6-5c5e422d3b7b',
          username: 'authqa+1772725966866.83b2525a',
          displayName: 'authqa+1772725966866.83b2525a',
          avatarUrl: '',
          score: 5500,
          gold: 5500,
          gems: 0,
        },
      ]),
      publicProfileSummary: makeIterTable([]),
    },
    () => repo.listLeaderboardItems(),
  );

  assert.equal(row?.username, 'authqa+1772725966866.83b2525a');
  assert.equal(row?.displayName, 'authqa+1772725966866.83b2525a');
});
