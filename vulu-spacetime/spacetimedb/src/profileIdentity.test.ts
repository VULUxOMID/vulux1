import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveProfileIdentityFields } from './profileIdentity';

test('empty payload identity fields preserve existing profile identity', () => {
  const resolved = resolveProfileIdentityFields(
    {
      username: '',
      displayName: '',
      name: '',
    },
    {
      username: 'omid',
      displayName: 'Omid',
      name: 'Omid',
    },
    {},
  );

  assert.deepEqual(resolved, {
    username: 'omid',
    displayName: 'Omid',
    name: 'Omid',
  });
});

test('partial payload keeps existing display name when incoming value is empty', () => {
  const resolved = resolveProfileIdentityFields(
    {
      username: '',
      displayName: '',
    },
    {
      username: 'misa',
      displayName: 'Misachan',
      name: 'Misachan',
    },
    {
      username: 'misa',
    },
  );

  assert.deepEqual(resolved, {
    username: 'misa',
    displayName: 'Misachan',
    name: 'Misachan',
  });
});

test('new profile creation still uses real incoming identity fields', () => {
  const resolved = resolveProfileIdentityFields(
    {
      username: 'dog',
      displayName: 'Pudong',
      name: 'Pudong',
    },
    {},
    {},
  );

  assert.deepEqual(resolved, {
    username: 'dog',
    displayName: 'Pudong',
    name: 'Pudong',
  });
});

test('social fallback uses existing profile identity instead of userId-style fallback', () => {
  const resolved = resolveProfileIdentityFields(
    {},
    {
      username: 'vulu.studio',
      displayName: 'Vulu Studio',
      name: 'Vulu Studio',
    },
    {
      username: '',
    },
  );

  assert.equal(resolved.username, 'vulu.studio');
  assert.equal(resolved.displayName, 'Vulu Studio');
  assert.equal(resolved.name, 'Vulu Studio');
});
