import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EARN_AD_WALL_COOLDOWN_MS,
  EARN_STREAK_RESET_WINDOW_MS,
  claimEarnAdWallRewardState,
  claimEarnStreakRewardState,
  readEarnStateFromAccountState,
  writeEarnStateToAccountState,
} from './earnRewards';

test('claimEarnAdWallRewardState records cooldown and claim count', () => {
  const initial = readEarnStateFromAccountState({}, 1_000);
  const next = claimEarnAdWallRewardState(initial, 1_000);

  assert.equal(next.adWall.claimCount, 1);
  assert.equal(next.adWall.lastClaimedAtMs, 1_000);
  assert.equal(next.adWall.nextClaimAtMs, 1_000 + EARN_AD_WALL_COOLDOWN_MS);
});

test('claimEarnAdWallRewardState blocks repeated claims during cooldown', () => {
  const initial = claimEarnAdWallRewardState(readEarnStateFromAccountState({}, 1_000), 1_000);

  assert.throws(
    () => claimEarnAdWallRewardState(initial, 1_001),
    /cooling down/i,
  );
});

test('claimEarnStreakRewardState advances claims in order', () => {
  const initial = readEarnStateFromAccountState({}, 5_000);
  const first = claimEarnStreakRewardState(initial, 0, 5_000);
  const second = claimEarnStreakRewardState(first.nextEarnState, 1, 7_000);

  assert.equal(first.rewardGems, 10);
  assert.equal(second.rewardGems, 15);
  assert.equal(second.nextEarnState.streak.claimedCount, 2);
  assert.equal(second.nextEarnState.streak.lastRewardIndex, 1);
  assert.equal(second.nextEarnState.streak.cycleExpiresAtMs, 5_000 + EARN_STREAK_RESET_WINDOW_MS);
});

test('claimEarnStreakRewardState rejects duplicate or skipped rewards', () => {
  const first = claimEarnStreakRewardState(readEarnStateFromAccountState({}, 10_000), 0, 10_000);

  assert.throws(
    () => claimEarnStreakRewardState(first.nextEarnState, 0, 10_100),
    /already claimed/i,
  );
  assert.throws(
    () => claimEarnStreakRewardState(first.nextEarnState, 2, 10_100),
    /not unlocked/i,
  );
});

test('readEarnStateFromAccountState resets expired streak cycles', () => {
  const withState = writeEarnStateToAccountState({}, {
    adWall: {
      nextClaimAtMs: 0,
      lastClaimedAtMs: 0,
      claimCount: 0,
    },
    streak: {
      claimedCount: 3,
      cycleStartedAtMs: 1_000,
      cycleExpiresAtMs: 2_000,
      lastClaimedAtMs: 1_500,
      lastRewardIndex: 2,
    },
    updatedAtMs: 1_500,
  });

  const normalized = readEarnStateFromAccountState(withState, 2_001);

  assert.equal(normalized.streak.claimedCount, 0);
  assert.equal(normalized.streak.lastRewardIndex, -1);
  assert.equal(normalized.streak.cycleExpiresAtMs, 0);
});
