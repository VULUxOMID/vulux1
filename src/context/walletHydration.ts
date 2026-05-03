export type WalletRefreshEvent = {
  forceFull?: boolean;
  scopes?: readonly string[] | null;
};

type UnknownRecord = Record<string, unknown>;

export type WalletBalanceLike = {
  userId: string | null;
  gems: number;
  cash: number;
  fuel: number;
} | null;

export type ResolvedAuthoritativeWallet = {
  source: 'account_state' | 'wallet_balance' | 'none';
  walletStateAvailable: boolean;
  walletState: UnknownRecord | null;
};

const WALLET_RELEVANT_SCOPES = new Set(['wallet', 'profile', 'identity']);

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null;
}

export function resolveAuthoritativeWalletState(
  accountState: UnknownRecord | null,
  walletBalance: WalletBalanceLike,
  signedInUserId: string | null | undefined,
): ResolvedAuthoritativeWallet {
  const accountWalletState = asRecord(accountState?.wallet);
  if (accountWalletState) {
    return {
      source: 'account_state',
      walletStateAvailable: true,
      walletState: accountWalletState,
    };
  }

  const walletBalanceMatchesUser = Boolean(
    walletBalance &&
      (!walletBalance.userId || !signedInUserId || walletBalance.userId === signedInUserId),
  );

  if (walletBalance && walletBalanceMatchesUser) {
    return {
      source: 'wallet_balance',
      walletStateAvailable: true,
      walletState: {
        gems: walletBalance.gems,
        cash: walletBalance.cash,
        fuel: walletBalance.fuel,
      },
    };
  }

  return {
    source: 'none',
    walletStateAvailable: false,
    walletState: null,
  };
}

export function hasAuthoritativeWalletForUser(
  walletUserId: string | null,
  signedInUserId: string | null | undefined,
  walletStateAvailable: boolean,
): boolean {
  return Boolean(
    walletStateAvailable &&
      walletUserId &&
      signedInUserId &&
      walletUserId === signedInUserId,
  );
}

export function hasAuthoritativeWallet(
  walletHydrated: boolean,
  walletStateAvailable: boolean,
): boolean {
  return walletHydrated && walletStateAvailable;
}

export function selectAuthoritativeWalletHistory<T>(
  walletUserId: string | null,
  signedInUserId: string | null | undefined,
  walletStateAvailable: boolean,
  history: T[],
): T[] {
  return hasAuthoritativeWalletForUser(walletUserId, signedInUserId, walletStateAvailable)
    ? history
    : [];
}

export function hasRelevantWalletScope(
  scopes: readonly string[] | null | undefined,
): boolean {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return false;
  }

  return scopes.some((scope) => WALLET_RELEVANT_SCOPES.has(scope));
}

export function shouldRefreshWalletFromRailwayEvent(
  event: { scopes: readonly string[] },
  walletHydrated: boolean,
): boolean {
  if (!walletHydrated) {
    return true;
  }

  return hasRelevantWalletScope(event.scopes);
}

export function shouldRefreshWalletFromBackendEvent(
  event: WalletRefreshEvent,
  walletHydrated: boolean,
): boolean {
  if (!walletHydrated || event.forceFull || !event.scopes) {
    return true;
  }

  return hasRelevantWalletScope(event.scopes);
}

export function shouldRefreshWalletFromSubscriptionActivation(params: {
  subscriptionState: 'idle' | 'subscribing' | 'active' | 'error';
  previousSubscriptionState: 'idle' | 'subscribing' | 'active' | 'error';
  walletHydrated: boolean;
  walletStateAvailable: boolean;
}): boolean {
  const becameActive =
    params.subscriptionState === 'active' &&
    params.previousSubscriptionState !== 'active';

  if (!becameActive) {
    return false;
  }

  return !params.walletHydrated || !params.walletStateAvailable;
}
