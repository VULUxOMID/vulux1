type JsonRecord = Record<string, unknown>;

export const EARN_AD_WALL_REWARD_GEMS = 10;
export const EARN_AD_WALL_COOLDOWN_MS = 10_000;
export const EARN_STREAK_REWARD_GEMS = [10, 15, 25, 40, 60, 100] as const;
export const EARN_STREAK_RESET_WINDOW_MS = 24 * 60 * 60 * 1000;

export type EarnAdWallState = {
  nextClaimAtMs: number;
  lastClaimedAtMs: number;
  claimCount: number;
};

export type EarnStreakState = {
  claimedCount: number;
  cycleStartedAtMs: number;
  cycleExpiresAtMs: number;
  lastClaimedAtMs: number;
  lastRewardIndex: number;
};

export type EarnState = {
  adWall: EarnAdWallState;
  streak: EarnStreakState;
  updatedAtMs: number;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  const parsed = readNumber(value);
  if (parsed === null) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function initialAdWallState(): EarnAdWallState {
  return {
    nextClaimAtMs: 0,
    lastClaimedAtMs: 0,
    claimCount: 0,
  };
}

function initialStreakState(): EarnStreakState {
  return {
    claimedCount: 0,
    cycleStartedAtMs: 0,
    cycleExpiresAtMs: 0,
    lastClaimedAtMs: 0,
    lastRewardIndex: -1,
  };
}

function normalizeAdWallState(value: unknown): EarnAdWallState {
  const record = isRecord(value) ? value : {};
  return {
    nextClaimAtMs: toNonNegativeInt(record.nextClaimAtMs),
    lastClaimedAtMs: toNonNegativeInt(record.lastClaimedAtMs),
    claimCount: toNonNegativeInt(record.claimCount),
  };
}

function normalizeStreakState(value: unknown, nowMs: number): EarnStreakState {
  const record = isRecord(value) ? value : {};
  let claimedCount = clamp(
    toNonNegativeInt(record.claimedCount),
    0,
    EARN_STREAK_REWARD_GEMS.length,
  );
  let cycleStartedAtMs = toNonNegativeInt(record.cycleStartedAtMs);
  let cycleExpiresAtMs = toNonNegativeInt(record.cycleExpiresAtMs);
  let lastClaimedAtMs = toNonNegativeInt(record.lastClaimedAtMs);
  let lastRewardIndex = Math.floor(readNumber(record.lastRewardIndex) ?? -1);

  if (cycleStartedAtMs > 0 && cycleExpiresAtMs <= 0) {
    cycleExpiresAtMs = cycleStartedAtMs + EARN_STREAK_RESET_WINDOW_MS;
  }

  const cycleExpired = cycleExpiresAtMs > 0 && nowMs >= cycleExpiresAtMs;
  if (cycleExpired) {
    return initialStreakState();
  }

  if (claimedCount === 0) {
    cycleStartedAtMs = 0;
    cycleExpiresAtMs = 0;
    lastClaimedAtMs = 0;
    lastRewardIndex = -1;
  }

  if (claimedCount > 0) {
    lastRewardIndex = clamp(lastRewardIndex, 0, claimedCount - 1);
  }

  return {
    claimedCount,
    cycleStartedAtMs,
    cycleExpiresAtMs,
    lastClaimedAtMs,
    lastRewardIndex,
  };
}

export function readEarnStateFromAccountState(
  accountState: JsonRecord,
  nowMs: number,
): EarnState {
  const earn = isRecord(accountState.earn) ? accountState.earn : {};
  return {
    adWall: normalizeAdWallState(earn.adWall),
    streak: normalizeStreakState(earn.streak, nowMs),
    updatedAtMs: toNonNegativeInt(earn.updatedAtMs, nowMs),
  };
}

export function writeEarnStateToAccountState(
  accountState: JsonRecord,
  earnState: EarnState,
): JsonRecord {
  return {
    ...accountState,
    earn: {
      updatedAtMs: earnState.updatedAtMs,
      adWall: {
        nextClaimAtMs: earnState.adWall.nextClaimAtMs,
        lastClaimedAtMs: earnState.adWall.lastClaimedAtMs,
        claimCount: earnState.adWall.claimCount,
      },
      streak: {
        claimedCount: earnState.streak.claimedCount,
        cycleStartedAtMs: earnState.streak.cycleStartedAtMs,
        cycleExpiresAtMs: earnState.streak.cycleExpiresAtMs,
        lastClaimedAtMs: earnState.streak.lastClaimedAtMs,
        lastRewardIndex: earnState.streak.lastRewardIndex,
      },
    },
  };
}

export function claimEarnAdWallRewardState(
  earnState: EarnState,
  nowMs: number,
): EarnState {
  if (nowMs < earnState.adWall.nextClaimAtMs) {
    throw new Error('Ad reward is still cooling down.');
  }

  return {
    ...earnState,
    adWall: {
      nextClaimAtMs: nowMs + EARN_AD_WALL_COOLDOWN_MS,
      lastClaimedAtMs: nowMs,
      claimCount: earnState.adWall.claimCount + 1,
    },
    updatedAtMs: nowMs,
  };
}

export function claimEarnStreakRewardState(
  earnState: EarnState,
  rewardIndex: number,
  nowMs: number,
): {
  nextEarnState: EarnState;
  rewardGems: number;
} {
  const normalizedIndex = Math.max(0, Math.floor(rewardIndex));
  if (normalizedIndex >= EARN_STREAK_REWARD_GEMS.length) {
    throw new Error('Reward index is invalid.');
  }

  const nextExpectedIndex = earnState.streak.claimedCount;
  if (normalizedIndex < nextExpectedIndex) {
    throw new Error('Reward already claimed.');
  }
  if (normalizedIndex > nextExpectedIndex) {
    throw new Error('Reward is not unlocked yet.');
  }

  const cycleStartedAtMs =
    earnState.streak.claimedCount === 0
      ? nowMs
      : Math.max(earnState.streak.cycleStartedAtMs, 0);
  const cycleExpiresAtMs =
    cycleStartedAtMs > 0
      ? cycleStartedAtMs + EARN_STREAK_RESET_WINDOW_MS
      : nowMs + EARN_STREAK_RESET_WINDOW_MS;
  const rewardGems = EARN_STREAK_REWARD_GEMS[normalizedIndex] ?? 0;

  return {
    rewardGems,
    nextEarnState: {
      ...earnState,
      streak: {
        claimedCount: normalizedIndex + 1,
        cycleStartedAtMs,
        cycleExpiresAtMs,
        lastClaimedAtMs: nowMs,
        lastRewardIndex: normalizedIndex,
      },
      updatedAtMs: nowMs,
    },
  };
}
