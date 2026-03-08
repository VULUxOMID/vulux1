import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePublicIdentityFields } from './publicIdentity';

test('resolvePublicIdentityFields prefers explicit profile identity', () => {
  const resolved = resolvePublicIdentityFields(
    'user-1',
    { username: 'misa', displayName: 'MisaChan', avatarUrl: 'https://cdn/avatar.png' },
    {},
    { userDisplayName: 'Fallback' },
  );

  assert.deepEqual(resolved, {
    username: 'misa',
    displayName: 'MisaChan',
    avatarUrl: 'https://cdn/avatar.png',
  });
});

test('resolvePublicIdentityFields falls back to user display name when public summary is missing', () => {
  const resolved = resolvePublicIdentityFields(
    '835d631d-0abe-421d-a1a6-5c5e422d3b7b',
    {},
    {},
    { userDisplayName: 'authqa+1772725966866.83b2525a' },
  );

  assert.equal(resolved.displayName, 'authqa+1772725966866.83b2525a');
  assert.equal(resolved.username, 'authqa+1772725966866.83b2525a');
  assert.equal(resolved.avatarUrl, '');
});

test('resolvePublicIdentityFields prefers public summary username over raw user id', () => {
  const resolved = resolvePublicIdentityFields(
    'user-2',
    {},
    {},
    { summaryUsername: 'misa' },
  );

  assert.equal(resolved.displayName, 'misa');
  assert.equal(resolved.username, 'misa');
});
