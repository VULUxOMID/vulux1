import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSignUpProfileParts } from './signUpProfile';

test('buildSignUpProfileParts normalizes username and splits display name', () => {
  const result = buildSignUpProfileParts({
    username: '  Mi Sa  ',
    displayName: '  Misa   Chan  ',
  });

  assert.ok(!('error' in result));
  assert.equal(result.username, 'mi_sa');
  assert.equal(result.displayName, 'Misa Chan');
  assert.equal(result.firstName, 'Misa');
  assert.equal(result.lastName, 'Chan');
});

test('buildSignUpProfileParts rejects invalid usernames', () => {
  const result = buildSignUpProfileParts({
    username: 'Mi*Sa',
    displayName: 'Misachan',
  });

  assert.deepEqual(result, {
    error: 'Usernames can use lowercase letters, numbers, periods, and underscores only.',
  });
});

test('buildSignUpProfileParts requires display name', () => {
  const result = buildSignUpProfileParts({
    username: 'misa',
    displayName: '   ',
  });

  assert.deepEqual(result, {
    error: 'Pick a display name to create your account.',
  });
});
