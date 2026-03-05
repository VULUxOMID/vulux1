import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readViewCallerIdentity,
  selectLegacyCallerUserId,
} from './viewIdentityResolver';

test('readViewCallerIdentity falls back from sender to identity', () => {
  assert.equal(readViewCallerIdentity({ sender: null, identity: 'identity-hex' }), 'identity-hex');
});

test('readViewCallerIdentity prefers sender when present', () => {
  assert.equal(
    readViewCallerIdentity({ sender: 'sender-hex', identity: 'identity-hex' }),
    'sender-hex',
  );
});

test('selectLegacyCallerUserId prefers user-id claims over sub when candidate exists', () => {
  const claims = {
    sub: 'clerk-user-subject',
    userId: '45d3c56c-a930-449b-9a3c-ef039f45eed7',
  };

  const selected = selectLegacyCallerUserId(
    claims,
    (candidate) => candidate === '45d3c56c-a930-449b-9a3c-ef039f45eed7',
  );

  assert.equal(selected, '45d3c56c-a930-449b-9a3c-ef039f45eed7');
});

test('selectLegacyCallerUserId uses sub only as last resort', () => {
  const claims = {
    sub: 'clerk-user-subject',
    userId: '',
  };

  const selected = selectLegacyCallerUserId(claims, () => false);

  assert.equal(selected, 'clerk-user-subject');
});

test('selectLegacyCallerUserId prefers matching persisted candidate over earlier non-matching value', () => {
  const claims = {
    userId: 'stale-user-id',
    metadata: {
      userId: '45d3c56c-a930-449b-9a3c-ef039f45eed7',
    },
    sub: 'clerk-user-subject',
  };

  const selected = selectLegacyCallerUserId(
    claims,
    (candidate) => candidate === '45d3c56c-a930-449b-9a3c-ef039f45eed7',
  );

  assert.equal(selected, '45d3c56c-a930-449b-9a3c-ef039f45eed7');
});
