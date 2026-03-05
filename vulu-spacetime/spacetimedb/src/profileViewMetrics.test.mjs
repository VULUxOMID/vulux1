import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFILE_VIEW_DEFAULT_DEDUPE_WINDOW_MS,
  evaluateProfileViewDecision,
  normalizeProfileViewDedupeWindowMs,
} from './profileViewMetrics.ts';

test('profile view: self-view is excluded', () => {
  const decision = evaluateProfileViewDecision({
    viewerUserId: 'user-1',
    profileUserId: 'user-1',
    nowMs: 1_000,
    occurredAtMs: 1_000,
    cutoverAtMs: 0,
    dedupeWindowMs: PROFILE_VIEW_DEFAULT_DEDUPE_WINDOW_MS,
    lastCountedAtMs: null,
  });

  assert.equal(decision.counted, false);
  assert.equal(decision.dropReason, 'self_view_excluded');
});

test('profile view: repeat open inside dedupe window is dropped', () => {
  const decision = evaluateProfileViewDecision({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    nowMs: 10_000,
    occurredAtMs: 10_000,
    cutoverAtMs: 0,
    dedupeWindowMs: 30 * 60 * 1000,
    lastCountedAtMs: 9_000,
  });

  assert.equal(decision.counted, false);
  assert.equal(decision.dropReason, 'within_dedupe_window');
});

test('profile view: repeat open after dedupe window is counted', () => {
  const decision = evaluateProfileViewDecision({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    nowMs: 1_900_000,
    occurredAtMs: 1_900_000,
    cutoverAtMs: 0,
    dedupeWindowMs: 30 * 60 * 1000,
    lastCountedAtMs: 1_000,
  });

  assert.equal(decision.counted, true);
  assert.equal(decision.dropReason, null);
});

test('profile view: pre-cutover events are dropped', () => {
  const decision = evaluateProfileViewDecision({
    viewerUserId: 'viewer-1',
    profileUserId: 'profile-1',
    nowMs: 10_000,
    occurredAtMs: 5_000,
    cutoverAtMs: 8_000,
    dedupeWindowMs: PROFILE_VIEW_DEFAULT_DEDUPE_WINDOW_MS,
    lastCountedAtMs: null,
  });

  assert.equal(decision.counted, false);
  assert.equal(decision.dropReason, 'before_metric_cutover');
});

test('profile view: dedupe window normalization clamps invalid values', () => {
  assert.equal(
    normalizeProfileViewDedupeWindowMs(-5),
    PROFILE_VIEW_DEFAULT_DEDUPE_WINDOW_MS,
  );
  assert.equal(
    normalizeProfileViewDedupeWindowMs(0),
    PROFILE_VIEW_DEFAULT_DEDUPE_WINDOW_MS,
  );
  assert.equal(
    normalizeProfileViewDedupeWindowMs('3600000'),
    3_600_000,
  );
});
