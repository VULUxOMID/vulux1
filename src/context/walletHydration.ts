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
  // Once hydration is complete, treat the wallet as authoritative even when
  // the backend did not return wallet state.  This prevents the UI from
  // showing a permanent loading placeholder ("--") after all retries are
  // exhausted.  The values will default to 0 when the backend has no data.
  return walletHydrated;
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
