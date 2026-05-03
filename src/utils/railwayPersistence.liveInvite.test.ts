import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLiveInviteActorName } from './liveInviteIdentity';

test('resolveLiveInviteActorName prefers display name over username and auth id', () => {
  assert.equal(
    resolveLiveInviteActorName('Host Display', 'host_user', 'auth-user-1'),
    'Host Display',
  );
});

test('resolveLiveInviteActorName falls back to username when display name is blank', () => {
  assert.equal(
    resolveLiveInviteActorName('   ', 'host_user', 'auth-user-1'),
    'host_user',
  );
});

test('resolveLiveInviteActorName falls back to auth id when no friendly label exists', () => {
  assert.equal(
    resolveLiveInviteActorName('', null, 'auth-user-1'),
    'auth-user-1',
  );
});
