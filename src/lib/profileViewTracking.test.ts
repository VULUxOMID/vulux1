import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFILE_VIEW_CLIENT_DEFAULT_DEDUPE_WINDOW_MS,
  buildProfileViewEventId,
  evaluateProfileViewClientDecision,
} from './profileViewTracking';

test('profile view tracking: self-view is excluded on the client', () => {
  const decision = evaluateProfileViewClientDecision({
    viewerUserId: 'user-1',
    profileUserId: 'user-1',
    openedAtMs: 10_000,
  });

  assert.equal(decision.shouldTrack, false);
  assert.equal(decision.dropReason, 'self_view_excluded');
});

test('profile view tracking: repeat open inside dedupe window is dropped on the client', () => {
  const firstOpenAtMs = 10_000;
  const decision = evaluateProfileViewClientDecision({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    openedAtMs: firstOpenAtMs + PROFILE_VIEW_CLIENT_DEFAULT_DEDUPE_WINDOW_MS - 1,
    lastTrackedAtMs: firstOpenAtMs,
  });

  assert.equal(decision.shouldTrack, false);
  assert.equal(decision.dropReason, 'within_dedupe_window');
});

test('profile view tracking: cooldown boundary allows a new client event', () => {
  const firstOpenAtMs = 10_000;
  const decision = evaluateProfileViewClientDecision({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    openedAtMs: firstOpenAtMs + PROFILE_VIEW_CLIENT_DEFAULT_DEDUPE_WINDOW_MS,
    lastTrackedAtMs: firstOpenAtMs,
  });

  assert.equal(decision.shouldTrack, true);
  assert.equal(decision.dropReason, null);
});

test('profile view tracking: stable event id is reused for the same modal open', () => {
  const first = buildProfileViewEventId({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    openedAtMs: 12_345,
  });
  const second = buildProfileViewEventId({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    openedAtMs: 12_345,
  });
  const third = buildProfileViewEventId({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    openedAtMs: 12_346,
  });

  assert.equal(first, second);
  assert.notEqual(first, third);
});
