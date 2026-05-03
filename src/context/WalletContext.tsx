import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { useAuth as useSessionAuth } from '../auth/clerkSession';

import {
  fetchAccountState as fetchBackendAccountState,
} from '../data/adapters/backend/accountState';
import {
  fetchWalletCashTransferHistory,
  fetchWalletWithdrawalHistory,
  requestWalletWithdrawal,
  sendWalletCashTransfer,
  spendCashBalance,
  spendGemsBalance,
  type WalletCashTransferRecord,
  type WalletMutationResult,
} from '../data/adapters/backend/walletMutations';
import { subscribeBackendRefresh } from '../data/adapters/backend/refreshBus';
import { subscribeRailwayDataChanges } from '../lib/railwayRuntime';
import {
  hasAuthoritativeWalletForUser,
  selectAuthoritativeWalletHistory,
  shouldRefreshWalletFromBackendEvent,
  shouldRefreshWalletFromRailwayEvent,
} from './walletHydration';

const WALLET_HYDRATION_RETRY_MS = 350;
const WALLET_HYDRATION_MAX_RETRIES = 8;
const WALLET_DIAGNOSTIC_THROTTLE_MS = 15_000;
const walletDiagnosticLastLogAt: Record<string, number> = {};

// Logging policy: diagnostics stay dev-only, throttled, and without user identifiers.
function warnWalletDiagnosticThrottled(key: string, details?: Record<string, unknown>): void {
  if (!__DEV__) {
    return;
  }

  const now = Date.now();
  const lastLoggedAt = walletDiagnosticLastLogAt[key] ?? 0;
  if (now - lastLoggedAt < WALLET_DIAGNOSTIC_THROTTLE_MS) {
    return;
  }
  walletDiagnosticLastLogAt[key] = now;

  console.warn(`[wallet][diag] ${key}`, details);
}

function toNonNegativeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return Math.max(0, asNumber);
    }
    return fallback;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return fallback;
}

export interface WithdrawalRequest {
  id: string;
  amountGems: number;
  amountRealMoney: number;
  status: 'pending' | 'processing' | 'completed' | 'declined';
  date: string;
  method: string;
  details: {
    fullName: string;
    email: string;
    phoneNumber: string;
  };
}

export type CashTransferRequest = {
  targetUserId?: string | null;
  targetHandle?: string | null;
  amountCash: number;
  note?: string | null;
  requestIdempotencyKey?: string | null;
};

interface WalletContextType {
  gems: number;
  cash: number;
  walletHydrated: boolean;
  walletStateAvailable: boolean;
  addGems: (amount: number) => void;
  addCash: (amount: number) => void;
  exchangeGemsForCash: (gemsAmount: number) => boolean;
  exchangeCashForGems: (cashAmount: number) => boolean;
  spendGems: (amount: number, options?: { reason?: string; source?: string }) => Promise<boolean>;
  spendCash: (amount: number, options?: { reason?: string; source?: string }) => Promise<boolean>;
  fuel: number;
  addFuel: (minutes: number) => void;
  consumeFuel: (minutes: number) => boolean;
  withdrawalHistory: WithdrawalRequest[];
  cashTransferHistory: WalletCashTransferRecord[];
  requestWithdrawal: (
    amountGems: number,
    details: WithdrawalRequest['details'],
    method: string
  ) => Promise<boolean>;
  sendCashToUser: (input: CashTransferRequest) => Promise<WalletMutationResult>;
  balance: { gems: number; cash: number };
  deductBalance: (amount: number, currency: 'gems' | 'cash') => Promise<boolean>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded: isAuthLoaded, isSignedIn, userId } = useSessionAuth();
  const [gems, setGems] = useState(0);
  const [cash, setCash] = useState(0);
  const [fuel, setFuel] = useState(0);
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalRequest[]>([]);
  const [cashTransferHistory, setCashTransferHistory] = useState<WalletCashTransferRecord[]>([]);
  const [walletHydrated, setWalletHydrated] = useState(false);
  const [walletStateAvailable, setWalletStateAvailable] = useState(false);
  const [walletRefreshNonce, setWalletRefreshNonce] = useState(0);

  // Refs to avoid stale closures in callbacks
  const fuelRef = useRef(fuel);
  const gemsRef = useRef(gems);
  const cashRef = useRef(cash);
  const withdrawalHistoryRef = useRef<WithdrawalRequest[]>([]);
  const cashTransferHistoryRef = useRef<WalletCashTransferRecord[]>([]);
  const getTokenRef = useRef(getToken);
  const walletUserIdRef = useRef<string | null>(null);
  const walletHydratedRef = useRef(walletHydrated);
  const walletStateAvailableRef = useRef(walletStateAvailable);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    walletHydratedRef.current = walletHydrated;
  }, [walletHydrated]);

  useEffect(() => {
    walletStateAvailableRef.current = walletStateAvailable;
  }, [walletStateAvailable]);

  // Keep refs in sync with state
  useEffect(() => { fuelRef.current = fuel; }, [fuel]);
  useEffect(() => { gemsRef.current = gems; }, [gems]);
  useEffect(() => { cashRef.current = cash; }, [cash]);
  useEffect(() => { withdrawalHistoryRef.current = withdrawalHistory; }, [withdrawalHistory]);
  useEffect(() => { cashTransferHistoryRef.current = cashTransferHistory; }, [cashTransferHistory]);

  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn || !userId) {
      return;
    }

    const unsubscribeDataChanges = subscribeRailwayDataChanges((event) => {
      if (shouldRefreshWalletFromRailwayEvent(event, walletHydratedRef.current)) {
        setWalletRefreshNonce((value) => value + 1);
      }
    });

    const unsubscribeBackendRefresh = subscribeBackendRefresh((event) => {
      if (shouldRefreshWalletFromBackendEvent(event, walletHydratedRef.current)) {
        setWalletRefreshNonce((value) => value + 1);
      }
    });

    return () => {
      unsubscribeBackendRefresh();
      unsubscribeDataChanges();
    };
  }, [isAuthLoaded, isSignedIn, userId]);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const resetWalletState = () => {
      walletUserIdRef.current = null;
      gemsRef.current = 0;
      cashRef.current = 0;
      fuelRef.current = 0;
      setGems(0);
      setCash(0);
      setFuel(0);
      setWithdrawalHistory([]);
      setCashTransferHistory([]);
      setWalletStateAvailable(false);
      setWalletHydrated(true);
    };

    if (!isAuthLoaded) {
      return () => {
        active = false;
      };
    }

    if (!isSignedIn || !userId) {
      resetWalletState();
      return () => {
        active = false;
      };
    }

    const hasCurrentUserWallet = hasAuthoritativeWalletForUser(
      walletUserIdRef.current,
      userId,
      walletStateAvailableRef.current,
    );

    if (!hasCurrentUserWallet) {
      setWalletHydrated(false);
      setWalletStateAvailable(false);
    }

    const hydrateWallet = async (attempt = 0) => {
      const accountState = await fetchBackendAccountState(
        null,
        getTokenRef.current,
        userId,
      );
      if (!active) return;

      const walletState =
        accountState?.wallet && typeof accountState.wallet === 'object'
          ? (accountState.wallet as Record<string, unknown>)
          : null;
      const hasWalletState = walletState !== null;

      if (!hasWalletState && attempt < WALLET_HYDRATION_MAX_RETRIES) {
        retryTimer = setTimeout(() => {
          void hydrateWallet(attempt + 1);
        }, WALLET_HYDRATION_RETRY_MS);
        return;
      }

      if (!hasWalletState) {
        warnWalletDiagnosticThrottled('hydrate_wallet_state_missing_after_retries', {
          attempt,
          refreshNonce: walletRefreshNonce,
          accountStatePresent: Boolean(accountState),
        });
      }

      if (!accountState) {
        if (
          hasAuthoritativeWalletForUser(
            walletUserIdRef.current,
            userId,
            walletStateAvailableRef.current,
          )
        ) {
          setWalletHydrated(true);
          return;
        }

        setWalletStateAvailable(false);
        setWalletHydrated(true);
        return;
      }

      if (!hasWalletState) {
        if (
          hasAuthoritativeWalletForUser(
            walletUserIdRef.current,
            userId,
            walletStateAvailableRef.current,
          )
        ) {
          setWalletHydrated(true);
          return;
        }

        setWalletStateAvailable(false);
        setWalletHydrated(true);
        return;
      }

      const priorWithdrawalHistory = selectAuthoritativeWalletHistory(
        walletUserIdRef.current,
        userId,
        walletStateAvailableRef.current,
        withdrawalHistoryRef.current,
      );
      const priorCashTransferHistory = selectAuthoritativeWalletHistory(
        walletUserIdRef.current,
        userId,
        walletStateAvailableRef.current,
        cashTransferHistoryRef.current,
      );

      walletUserIdRef.current = userId;
      setWalletStateAvailable(hasWalletState);
      const normalizedWalletState = walletState ?? {};
      const [canonicalWithdrawalHistory, canonicalCashTransferHistory] = await Promise.all([
        fetchWalletWithdrawalHistory(),
        fetchWalletCashTransferHistory(),
      ]);
      if (!active) return;

      const nextGems = toNonNegativeNumber(normalizedWalletState.gems);
      const nextCash = toNonNegativeNumber(normalizedWalletState.cash);
      const nextFuel = toNonNegativeNumber(normalizedWalletState.fuel);
      const nextWithdrawalHistory =
        canonicalWithdrawalHistory ?? priorWithdrawalHistory;
      const nextCashTransferHistory =
        canonicalCashTransferHistory ?? priorCashTransferHistory;

      gemsRef.current = nextGems;
      cashRef.current = nextCash;
      fuelRef.current = nextFuel;
      setGems(nextGems);
      setCash(nextCash);
      setFuel(nextFuel);
      setWithdrawalHistory(nextWithdrawalHistory);
      setCashTransferHistory(nextCashTransferHistory);
      setWalletHydrated(true);
    };

    void hydrateWallet();

    return () => {
      active = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [isAuthLoaded, isSignedIn, userId, walletRefreshNonce]);

  const warnWalletMutationBlocked = useCallback((action: string) => {
    warnWalletDiagnosticThrottled(`blocked_client_side_mutation:${action}`);
  }, []);

  const addGems = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    warnWalletMutationBlocked('addGems');
  }, [warnWalletMutationBlocked]);

  const addCash = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    warnWalletMutationBlocked('addCash');
  }, [warnWalletMutationBlocked]);

  const addFuel = useCallback((minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    warnWalletMutationBlocked('addFuel');
  }, [warnWalletMutationBlocked]);

  const consumeFuel = useCallback((minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return false;
    warnWalletMutationBlocked('consumeFuel');
    return false;
  }, [warnWalletMutationBlocked]);

  const exchangeGemsForCash = useCallback((gemsAmount: number) => {
    if (!Number.isFinite(gemsAmount) || gemsAmount <= 0) return false;
    warnWalletMutationBlocked('exchangeGemsForCash');
    return false;
  }, [warnWalletMutationBlocked]);

  const exchangeCashForGems = useCallback((cashAmount: number) => {
    if (!Number.isFinite(cashAmount) || cashAmount <= 0) return false;
    warnWalletMutationBlocked('exchangeCashForGems');
    return false;
  }, [warnWalletMutationBlocked]);

  const applyWalletSpendLocally = useCallback((amount: number, currency: 'gems' | 'cash') => {
    if (currency === 'cash') {
      const nextCash = Math.max(0, cashRef.current - amount);
      cashRef.current = nextCash;
      setCash(nextCash);
      return;
    }
    const nextGems = Math.max(0, gemsRef.current - amount);
    gemsRef.current = nextGems;
    setGems(nextGems);
  }, []);

  const spendGemsAuthoritatively = useCallback(async (
    amount: number,
    options?: { reason?: string; source?: string },
  ) => {
    if (!Number.isFinite(amount) || amount <= 0 || !userId) return false;
    const normalizedAmount = Math.max(0, Math.floor(amount));
    if (gemsRef.current < normalizedAmount) {
      return false;
    }
    const result = await spendGemsBalance(userId, normalizedAmount, options);
    if (!result.ok) {
      if (result.code !== 'insufficient_balance') {
        warnWalletDiagnosticThrottled('wallet_spend_gems_failed', {
          code: result.code ?? 'unknown',
        });
      }
      return false;
    }
    applyWalletSpendLocally(normalizedAmount, 'gems');
    return true;
  }, [applyWalletSpendLocally, userId]);

  const spendCashAuthoritatively = useCallback(async (
    amount: number,
    options?: { reason?: string; source?: string },
  ) => {
    if (!Number.isFinite(amount) || amount <= 0 || !userId) return false;
    const normalizedAmount = Math.max(0, Math.floor(amount));
    if (cashRef.current < normalizedAmount) {
      return false;
    }
    const result = await spendCashBalance(userId, normalizedAmount, options);
    if (!result.ok) {
      if (result.code !== 'insufficient_balance') {
        warnWalletDiagnosticThrottled('wallet_spend_cash_failed', {
          code: result.code ?? 'unknown',
        });
      }
      return false;
    }
    applyWalletSpendLocally(normalizedAmount, 'cash');
    return true;
  }, [applyWalletSpendLocally, userId]);

  const deductBalance = useCallback(async (amount: number, currency: 'gems' | 'cash') => {
    if (currency === 'gems') {
      return spendGemsAuthoritatively(amount, {
        source: 'locked_content_unlock',
        reason: 'Locked content unlock',
      });
    } else {
      return spendCashAuthoritatively(amount, {
        source: 'locked_content_unlock',
        reason: 'Locked content unlock',
      });
    }
  }, [spendCashAuthoritatively, spendGemsAuthoritatively]);

  const requestWithdrawal = useCallback(async (
    amountGems: number,
    details: WithdrawalRequest['details'],
    method: string,
  ) => {
    if (!Number.isFinite(amountGems) || amountGems <= 0) return false;

    const result = await requestWalletWithdrawal(amountGems, details, method);
    if (!result.ok) {
      warnWalletDiagnosticThrottled('wallet_withdrawal_request_failed', {
        code: result.code ?? 'unknown',
      });
      return false;
    }

    return true;
  }, []);

  const sendCashToUser = useCallback(async (input: CashTransferRequest) => {
    if (!Number.isFinite(input.amountCash) || input.amountCash <= 0) {
      return {
        ok: false,
        code: 'invalid_input',
        message: 'Amount must be greater than zero.',
      } satisfies WalletMutationResult;
    }

    if (!input.targetUserId && !input.targetHandle) {
      return {
        ok: false,
        code: 'invalid_input',
        message: 'A target user is required.',
      } satisfies WalletMutationResult;
    }

    return await sendWalletCashTransfer(input);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        gems,
        cash,
        walletHydrated,
        walletStateAvailable,
        addGems,
        addCash,
        exchangeGemsForCash,
        exchangeCashForGems,
        spendGems: spendGemsAuthoritatively,
        spendCash: spendCashAuthoritatively,
        fuel,
        addFuel,
        consumeFuel,
        withdrawalHistory,
        cashTransferHistory,
        requestWithdrawal,
        sendCashToUser,
        balance: { gems, cash },
        deductBalance
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    warnWalletDiagnosticThrottled('wallet_context_missing_provider');
    // Return safe default values instead of throwing
    return {
      cash: 0,
      gems: 0,
      fuel: 0,
      walletHydrated: false,
      walletStateAvailable: false,
      withdrawalHistory: [],
      cashTransferHistory: [],
      balance: { gems: 0, cash: 0 },
      addCash: () => {
        warnWalletDiagnosticThrottled('wallet_add_cash_outside_provider');
      },
      addGems: () => {
        warnWalletDiagnosticThrottled('wallet_add_gems_outside_provider');
      },
      spendCash: async () => false,
      spendGems: async () => false,
      exchangeGemsForCash: () => false,
      exchangeCashForGems: () => false,
      addFuel: () => {
        warnWalletDiagnosticThrottled('wallet_add_fuel_outside_provider');
      },
      consumeFuel: () => false,
      requestWithdrawal: async () => false,
      sendCashToUser: async () => ({
        ok: false,
        code: 'unavailable',
        message: 'Wallet provider is unavailable.',
      }),
      deductBalance: async () => false,
    };
  }
  return context;
}
