export type WalletRefreshEvent = {
  forceFull?: boolean;
  scopes?: readonly string[] | null;
};

const WALLET_RELEVANT_SCOPES = new Set(['wallet', 'profile', 'identity']);

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

export function hasRelevantWalletScope(
  scopes: readonly string[] | null | undefined,
): boolean {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return false;
  }

  return scopes.some((scope) => WALLET_RELEVANT_SCOPES.has(scope));
}

export function shouldRefreshWalletFromSpacetimeEvent(
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
