import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProfileIdentityMap } from './liveProfileIdentity';

test('runtime user_profile rows do not override authoritative backend identities', () => {
  const identities = buildProfileIdentityMap({
    queriesEnabled: true,
    authoritativeUserIds: ['backend-user-1'],
    globalRows: [
      {
        id: 'profile-1',
        createdAt: 100,
        item: JSON.stringify({
          eventType: 'user_profile',
          userId: 'backend-user-1',
          displayName: 'Stale Runtime Name',
          username: 'stale-runtime-name',
          avatarUrl: 'https://example.com/stale.png',
        }),
      },
      {
        id: 'profile-2',
        createdAt: 200,
        item: JSON.stringify({
          eventType: 'user_profile',
          userId: 'runtime-only-1',
          displayName: 'Runtime Only Name',
          username: 'runtime-only-name',
          avatarUrl: 'https://example.com/runtime.png',
        }),
      },
    ],
    myProfileRows: [],
    currentUserId: 'viewer-1',
  });

  assert.equal(identities.has('backend-user-1'), false);
  assert.deepEqual(identities.get('runtime-only-1'), {
    displayName: 'Runtime Only Name',
    username: 'runtime-only-name',
    avatarUrl: 'https://example.com/runtime.png',
  });
});

test('myProfile identity still applies for the current user', () => {
  const identities = buildProfileIdentityMap({
    queriesEnabled: true,
    authoritativeUserIds: ['viewer-1'],
    globalRows: [
      {
        id: 'profile-1',
        createdAt: 100,
        item: JSON.stringify({
          eventType: 'user_profile',
          userId: 'viewer-1',
          displayName: 'Stale Runtime Self',
          username: 'stale-self',
        }),
      },
    ],
    myProfileRows: [
      {
        userId: 'viewer-1',
        profile: JSON.stringify({
          displayName: 'Fresh Self',
          username: 'fresh-self',
          photos: [{ uri: 'https://example.com/fresh-self.png' }],
        }),
      },
    ],
    currentUserId: 'viewer-1',
  });

  assert.deepEqual(identities.get('viewer-1'), {
    displayName: 'Fresh Self',
    username: 'fresh-self',
    avatarUrl: 'https://example.com/fresh-self.png',
  });
});
