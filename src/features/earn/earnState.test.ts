import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EARN_AD_WALL_COOLDOWN_MS,
  EARN_STREAK_RESET_WINDOW_MS,
  formatEarnDuration,
  readEarnSnapshot,
} from './earnState';

test('readEarnSnapshot exposes ready ad-wall state by default', () => {
  const snapshot = readEarnSnapshot({}, 1_000);

  assert.equal(snapshot.adWall.canClaim, true);
  assert.equal(snapshot.adWall.status, 'ready');
  assert.equal(snapshot.streak.claimedCount, 0);
  assert.equal(snapshot.streak.nextRewardAmount, 10);
});

test('readEarnSnapshot derives ad-wall cooldown from persisted state', () => {
  const snapshot = readEarnSnapshot(
    {
      earn: {
        adWall: {
          claimCount: 2,
          lastClaimedAtMs: 5_000,
          nextClaimAtMs: 5_000 + EARN_AD_WALL_COOLDOWN_MS,
        },
      },
    },
    5_100,
  );

  assert.equal(snapshot.adWall.canClaim, false);
  assert.equal(snapshot.adWall.status, 'cooldown');
  assert.equal(snapshot.adWall.remainingMs, EARN_AD_WALL_COOLDOWN_MS - 100);
});

test('readEarnSnapshot resets expired streak cycles', () => {
  const snapshot = readEarnSnapshot(
    {
      earn: {
        streak: {
          claimedCount: 4,
          cycleStartedAtMs: 1_000,
          cycleExpiresAtMs: 2_000,
        },
      },
    },
    2_001,
  );

  assert.equal(snapshot.streak.claimedCount, 0);
  assert.equal(snapshot.streak.nextRewardIndex, 0);
  assert.equal(snapshot.streak.cycleExpiresAtMs, null);
});

test('readEarnSnapshot marks streak rewards by current progress', () => {
  const snapshot = readEarnSnapshot(
    {
      earn: {
        streak: {
          claimedCount: 2,
          cycleStartedAtMs: 10_000,
          cycleExpiresAtMs: 10_000 + EARN_STREAK_RESET_WINDOW_MS,
        },
      },
    },
    12_000,
  );

  assert.equal(snapshot.streak.rewards[0]?.status, 'claimed');
  assert.equal(snapshot.streak.rewards[1]?.status, 'claimed');
  assert.equal(snapshot.streak.rewards[2]?.status, 'ready');
  assert.equal(snapshot.streak.nextRewardAmount, 25);
});

test('formatEarnDuration keeps countdown copy deterministic', () => {
  assert.equal(formatEarnDuration(900), '1s');
  assert.equal(formatEarnDuration(61_000), '1m 01s');
});
