type UnknownRecord = Record<string, unknown>;

export const EARN_AD_WALL_REWARD_GEMS = 10;
export const EARN_AD_WALL_COOLDOWN_MS = 10_000;
export const EARN_STREAK_RESET_WINDOW_MS = 24 * 60 * 60 * 1000;
export const EARN_STREAK_REWARDS = [
  { amount: 10, label: 'Starter' },
  { amount: 15, label: '1.5x' },
  { amount: 25, label: '2.5x' },
  { amount: 40, label: '4.0x' },
  { amount: 60, label: '6.0x' },
  { amount: 100, label: 'Ultra' },
] as const;

export type EarnCardStatus = 'ready' | 'cooldown' | 'complete';

export type EarnSnapshot = {
  adWall: {
    rewardGems: number;
    claimCount: number;
    lastClaimedAtMs: number | null;
    nextClaimAtMs: number | null;
    remainingMs: number;
    canClaim: boolean;
    status: EarnCardStatus;
  };
  streak: {
    claimedCount: number;
    cycleStartedAtMs: number | null;
    cycleExpiresAtMs: number | null;
    remainingMs: number;
    isComplete: boolean;
    nextRewardIndex: number | null;
    nextRewardAmount: number | null;
    rewards: Array<{
      index: number;
      amount: number;
      label: string;
      status: 'claimed' | 'ready' | 'locked';
    }>;
  };
  updatedAtMs: number | null;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
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

function maybeTimestamp(value: unknown): number | null {
  const parsed = toNonNegativeInt(value, -1);
  return parsed >= 0 ? parsed : null;
}

function normalizeStreakState(earn: UnknownRecord, nowMs: number) {
  const streak = asRecord(earn.streak);
  let claimedCount = Math.max(
    0,
    Math.min(EARN_STREAK_REWARDS.length, toNonNegativeInt(streak.claimedCount)),
  );
  let cycleStartedAtMs = toNonNegativeInt(streak.cycleStartedAtMs);
  let cycleExpiresAtMs = toNonNegativeInt(streak.cycleExpiresAtMs);

  if (cycleStartedAtMs > 0 && cycleExpiresAtMs <= 0) {
    cycleExpiresAtMs = cycleStartedAtMs + EARN_STREAK_RESET_WINDOW_MS;
  }

  if (cycleExpiresAtMs > 0 && nowMs >= cycleExpiresAtMs) {
    claimedCount = 0;
    cycleStartedAtMs = 0;
    cycleExpiresAtMs = 0;
  }

  const nextReward = EARN_STREAK_REWARDS[claimedCount] ?? null;
  const isComplete = claimedCount >= EARN_STREAK_REWARDS.length;
  const remainingMs = cycleExpiresAtMs > 0 ? Math.max(0, cycleExpiresAtMs - nowMs) : 0;

  return {
    claimedCount,
    cycleStartedAtMs: cycleStartedAtMs > 0 ? cycleStartedAtMs : null,
    cycleExpiresAtMs: cycleExpiresAtMs > 0 ? cycleExpiresAtMs : null,
    remainingMs,
    isComplete,
    nextRewardIndex: nextReward ? claimedCount : null,
    nextRewardAmount: nextReward?.amount ?? null,
    rewards: EARN_STREAK_REWARDS.map((reward, index) => ({
      index,
      amount: reward.amount,
      label: reward.label,
      status:
        index < claimedCount
          ? 'claimed'
          : index === claimedCount && !isComplete
            ? 'ready'
            : 'locked',
    })),
  } as EarnSnapshot['streak'];
}

export function readEarnSnapshot(accountState: unknown, nowMs = Date.now()): EarnSnapshot {
  const state = asRecord(accountState);
  const earn = asRecord(state.earn);
  const adWall = asRecord(earn.adWall);

  const nextClaimAtMs = maybeTimestamp(adWall.nextClaimAtMs);
  const lastClaimedAtMs = maybeTimestamp(adWall.lastClaimedAtMs);
  const remainingMs = nextClaimAtMs ? Math.max(0, nextClaimAtMs - nowMs) : 0;
  const canClaim = remainingMs === 0;

  return {
    adWall: {
      rewardGems: EARN_AD_WALL_REWARD_GEMS,
      claimCount: toNonNegativeInt(adWall.claimCount),
      lastClaimedAtMs,
      nextClaimAtMs,
      remainingMs,
      canClaim,
      status: canClaim ? 'ready' : 'cooldown',
    },
    streak: normalizeStreakState(earn, nowMs),
    updatedAtMs: maybeTimestamp(earn.updatedAtMs),
  };
}

export function formatEarnDuration(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}
