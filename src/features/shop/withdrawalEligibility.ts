export const DEFAULT_MIN_WITHDRAWAL_GEMS = 500;

export type WithdrawalEligibility = {
  availableGems: number;
  availablePayoutUsd: number;
  availablePayoutLabel: string;
  isAuthoritative: boolean;
  canRequestWithdrawal: boolean;
  disabledReason: string | null;
};

function toNonNegativeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return 0;
}

export function getWithdrawalEligibility(input: {
  gems: number;
  walletHydrated: boolean;
  walletStateAvailable: boolean;
  minWithdrawalGems?: number;
}): WithdrawalEligibility {
  const minWithdrawalGems = input.minWithdrawalGems ?? DEFAULT_MIN_WITHDRAWAL_GEMS;
  const availableGems = toNonNegativeNumber(input.gems);
  const availablePayoutUsd = availableGems * 0.01;
  const isAuthoritative = input.walletHydrated && input.walletStateAvailable;

  if (!isAuthoritative) {
    return {
      availableGems,
      availablePayoutUsd,
      availablePayoutLabel: 'Syncing...',
      isAuthoritative,
      canRequestWithdrawal: false,
      disabledReason: 'Payout availability will unlock after your wallet finishes syncing.',
    };
  }

  if (availableGems <= 0) {
    return {
      availableGems,
      availablePayoutUsd,
      availablePayoutLabel: '$0.00',
      isAuthoritative,
      canRequestWithdrawal: false,
      disabledReason: 'You need payout-eligible Gems before you can request a withdrawal.',
    };
  }

  if (availableGems < minWithdrawalGems) {
    return {
      availableGems,
      availablePayoutUsd,
      availablePayoutLabel: `$${availablePayoutUsd.toFixed(2)}`,
      isAuthoritative,
      canRequestWithdrawal: false,
      disabledReason: `You need at least ${minWithdrawalGems} Gems available before you can request a withdrawal.`,
    };
  }

  return {
    availableGems,
    availablePayoutUsd,
    availablePayoutLabel: `$${availablePayoutUsd.toFixed(2)}`,
    isAuthoritative,
    canRequestWithdrawal: true,
    disabledReason: null,
  };
}
