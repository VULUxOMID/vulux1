import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldPersistProfileView } from './profileViewEligibility';

test('allows non-self profile view attempts', () => {
  assert.equal(
    shouldPersistProfileView({
      viewerUserId: 'viewer-1',
      profileUserId: 'profile-2',
    }),
    true,
  );
});

test('blocks self preview profile view attempts by matching ids', () => {
  assert.equal(
    shouldPersistProfileView({
      viewerUserId: 'viewer-1',
      profileUserId: 'viewer-1',
    }),
    false,
  );
});

test('blocks explicit self-preview modal opens', () => {
  assert.equal(
    shouldPersistProfileView({
      viewerUserId: 'viewer-1',
      profileUserId: 'profile-2',
      isSelfPreview: true,
    }),
    false,
  );
});

test('blocks attempts with missing viewer or profile ids', () => {
  assert.equal(
    shouldPersistProfileView({
      viewerUserId: '',
      profileUserId: 'profile-2',
    }),
    false,
  );
  assert.equal(
    shouldPersistProfileView({
      viewerUserId: 'viewer-1',
      profileUserId: '',
    }),
    false,
  );
});
