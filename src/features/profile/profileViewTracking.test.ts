import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import {
  PROFILE_VIEW_CLIENT_DEDUPE_WINDOW_MS,
  PROFILE_VIEW_CLIENT_STORAGE_KEY,
  buildProfileViewCooldownKey,
  normalizeProfileViewDedupeWindowMs,
  resetProfileViewTrackingStateForTests,
  trackProfileViewWithCooldown,
} from './profileViewTracking';

type MockStorageState = Record<string, string>;

function createMockStorage(initialState: MockStorageState = {}) {
  const state: MockStorageState = { ...initialState };

  return {
    state,
    storage: {
      async getItem(key: string) {
        return Object.prototype.hasOwnProperty.call(state, key) ? state[key]! : null;
      },
      async setItem(key: string, value: string) {
        state[key] = value;
      },
    },
  };
}

afterEach(() => {
  resetProfileViewTrackingStateForTests();
});

test('profile view tracking excludes self views', async () => {
  const { storage, state } = createMockStorage();
  let emitCalls = 0;

  const outcome = await trackProfileViewWithCooldown({
    viewerUserId: 'user-1',
    profileUserId: 'user-1',
    storage,
    emit: async () => {
      emitCalls += 1;
    },
  });

  assert.equal(outcome, 'self_view');
  assert.equal(emitCalls, 0);
  assert.deepEqual(state, {});
});

test('profile view tracking dedupes repeated opens inside the cooldown window', async () => {
  const { storage } = createMockStorage();
  const trackedAtMs = 1_700_000_000_000;
  let emitCalls = 0;

  const first = await trackProfileViewWithCooldown({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    occurredAtMs: trackedAtMs,
    storage,
    emit: async () => {
      emitCalls += 1;
    },
  });
  const second = await trackProfileViewWithCooldown({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    occurredAtMs: trackedAtMs + 5_000,
    storage,
    emit: async () => {
      emitCalls += 1;
    },
  });

  assert.equal(first, 'tracked');
  assert.equal(second, 'duplicate');
  assert.equal(emitCalls, 1);
});

test('profile view tracking allows the next count at the cooldown boundary', async () => {
  const { storage } = createMockStorage();
  const trackedAtMs = 1_700_000_000_000;
  let emitCalls = 0;

  await trackProfileViewWithCooldown({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    occurredAtMs: trackedAtMs,
    storage,
    emit: async () => {
      emitCalls += 1;
    },
  });

  const outcome = await trackProfileViewWithCooldown({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    occurredAtMs: trackedAtMs + PROFILE_VIEW_CLIENT_DEDUPE_WINDOW_MS,
    storage,
    emit: async () => {
      emitCalls += 1;
    },
  });

  assert.equal(outcome, 'tracked');
  assert.equal(emitCalls, 2);
});

test('profile view tracking persists the cooldown across app relaunches', async () => {
  const { storage, state } = createMockStorage();
  const trackedAtMs = 1_700_000_000_000;
  let emitCalls = 0;

  const expectedStorageSnapshot = JSON.stringify({
    [buildProfileViewCooldownKey('viewer-1', 'profile-1')]:
      trackedAtMs + PROFILE_VIEW_CLIENT_DEDUPE_WINDOW_MS,
  });

  await trackProfileViewWithCooldown({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    occurredAtMs: trackedAtMs,
    storage,
    emit: async () => {
      emitCalls += 1;
    },
  });

  assert.equal(state[PROFILE_VIEW_CLIENT_STORAGE_KEY], expectedStorageSnapshot);

  resetProfileViewTrackingStateForTests();

  const outcome = await trackProfileViewWithCooldown({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    occurredAtMs: trackedAtMs + 1_000,
    storage,
    emit: async () => {
      emitCalls += 1;
    },
  });

  assert.equal(outcome, 'duplicate');
  assert.equal(emitCalls, 1);
});

test('profile view tracking keeps duplicate concurrent opens to a single emitted event', async () => {
  const { storage } = createMockStorage();
  let emitCalls = 0;

  const [first, second] = await Promise.all([
    trackProfileViewWithCooldown({
      viewerUserId: 'viewer-1',
      profileUserId: 'profile-1',
      occurredAtMs: 1_700_000_000_000,
      storage,
      emit: async () => {
        emitCalls += 1;
      },
    }),
    trackProfileViewWithCooldown({
      viewerUserId: 'viewer-1',
      profileUserId: 'profile-1',
      occurredAtMs: 1_700_000_000_000,
      storage,
      emit: async () => {
        emitCalls += 1;
      },
    }),
  ]);

  assert.deepEqual([first, second], ['tracked', 'duplicate']);
  assert.equal(emitCalls, 1);
});

test('profile view tracking clamps invalid dedupe windows to the default', () => {
  assert.equal(normalizeProfileViewDedupeWindowMs(Number.NaN), PROFILE_VIEW_CLIENT_DEDUPE_WINDOW_MS);
  assert.equal(normalizeProfileViewDedupeWindowMs(-1), 0);
});
