import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { useAuth as useSessionAuth } from '../auth/spacetimeSession';

import {
  fetchAccountState as fetchBackendAccountState,
} from '../data/adapters/backend/accountState';
import { subscribeBackendRefresh } from '../data/adapters/backend/refreshBus';
import { subscribeSpacetimeDataChanges } from '../lib/spacetime';
import {
  fetchMyWalletBalance,
} from '../data/adapters/backend/walletQueries';
import {
  hasAuthoritativeWalletForUser,
  resolveAuthoritativeWalletState,
  shouldRefreshWalletFromBackendEvent,
  shouldRefreshWalletFromSpacetimeEvent,
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

function toWithdrawalStatus(value: unknown): WithdrawalRequest['status'] {
  if (value === 'pending' || value === 'processing' || value === 'completed' || value === 'declined') {
    return value;
  }
  return 'pending';
}

function parseWithdrawalHistory(value: unknown): WithdrawalRequest[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Record<string, unknown>;
      const details =
        item.details && typeof item.details === 'object'
          ? (item.details as Record<string, unknown>)
          : {};

      const id =
        typeof item.id === 'string' && item.id.trim().length > 0
          ? item.id
          : `withdrawal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      return {
        id,
        amountGems: toNonNegativeNumber(item.amountGems),
        amountRealMoney: toNonNegativeNumber(item.amountRealMoney),
        status: toWithdrawalStatus(item.status),
        date:
          typeof item.date === 'string' && item.date.trim().length > 0
            ? item.date
            : new Date().toISOString(),
        method:
          typeof item.method === 'string' && item.method.trim().length > 0
            ? item.method
            : 'Unknown',
        details: {
          fullName:
            typeof details.fullName === 'string' ? details.fullName : '',
          email: typeof details.email === 'string' ? details.email : '',
          phoneNumber:
            typeof details.phoneNumber === 'string' ? details.phoneNumber : '',
        },
      };
    })
    .filter((item): item is WithdrawalRequest => Boolean(item));
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

interface WalletContextType {
  gems: number;
  cash: number;
  walletHydrated: boolean;
  walletStateAvailable: boolean;
  addGems: (amount: number) => void;
  addCash: (amount: number) => void;
  exchangeGemsForCash: (gemsAmount: number) => boolean;
  exchangeCashForGems: (cashAmount: number) => boolean;
  spendGems: (amount: number) => boolean;
  spendCash: (amount: number) => boolean;
  fuel: number;
  addFuel: (minutes: number) => void;
  consumeFuel: (minutes: number) => boolean;
  withdrawalHistory: WithdrawalRequest[];
  requestWithdrawal: (amountGems: number, details: WithdrawalRequest['details'], method: string) => boolean;
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
  const [walletHydrated, setWalletHydrated] = useState(false);
  const [walletStateAvailable, setWalletStateAvailable] = useState(false);
  const [walletRefreshNonce, setWalletRefreshNonce] = useState(0);

  // Refs to avoid stale closures in callbacks
  const fuelRef = useRef(fuel);
  const gemsRef = useRef(gems);
  const cashRef = useRef(cash);
  const getTokenRef = useRef(getToken);
  const walletUserIdRef = useRef<string | null>(null);
  const walletHydratedRef = useRef(walletHydrated);
  const walletStateAvailableRef = useRef(walletStateAvailable);
  const withdrawalHistoryRef = useRef<WithdrawalRequest[]>(withdrawalHistory);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    walletHydratedRef.current = walletHydrated;
  }, [walletHydrated]);

  useEffect(() => {
    walletStateAvailableRef.current = walletStateAvailable;
  }, [walletStateAvailable]);

  useEffect(() => {
    withdrawalHistoryRef.current = withdrawalHistory;
  }, [withdrawalHistory]);

  // Keep refs in sync with state
  useEffect(() => { fuelRef.current = fuel; }, [fuel]);
  useEffect(() => { gemsRef.current = gems; }, [gems]);
  useEffect(() => { cashRef.current = cash; }, [cash]);

  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn || !userId) {
      return;
    }

    const unsubscribeDataChanges = subscribeSpacetimeDataChanges((event) => {
      if (shouldRefreshWalletFromSpacetimeEvent(event, walletHydratedRef.current)) {
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

      const walletBalance = fetchMyWalletBalance();
      const resolvedWalletState = resolveAuthoritativeWalletState(
        accountState,
        walletBalance,
        userId,
      );
      const walletState = resolvedWalletState.walletState;
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

      walletUserIdRef.current = userId;
      setWalletStateAvailable(resolvedWalletState.walletStateAvailable);
      const normalizedWalletState = walletState ?? {};

      const nextGems = toNonNegativeNumber(normalizedWalletState.gems);
      const nextCash = toNonNegativeNumber(normalizedWalletState.cash);
      const nextFuel = toNonNegativeNumber(normalizedWalletState.fuel);
      const nextWithdrawalHistory =
        resolvedWalletState.source === 'account_state'
          ? parseWithdrawalHistory(normalizedWalletState.withdrawalHistory)
          : withdrawalHistoryRef.current;

      gemsRef.current = nextGems;
      cashRef.current = nextCash;
      fuelRef.current = nextFuel;
      setGems(nextGems);
      setCash(nextCash);
      setFuel(nextFuel);
      setWithdrawalHistory(nextWithdrawalHistory);
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

  const spendGems = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    warnWalletMutationBlocked('spendGems');
    return false;
  }, [warnWalletMutationBlocked]);

  const spendCash = useCallback((amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    warnWalletMutationBlocked('spendCash');
    return false;
  }, [warnWalletMutationBlocked]);

  const deductBalance = useCallback(async (amount: number, currency: 'gems' | 'cash') => {
    if (currency === 'gems') {
      return spendGems(amount);
    } else {
      return spendCash(amount);
    }
  }, [spendGems, spendCash]);

  const requestWithdrawal = useCallback((amountGems: number, details: WithdrawalRequest['details'], method: string) => {
    if (!Number.isFinite(amountGems) || amountGems <= 0) return false;
    void details;
    void method;
    warnWalletMutationBlocked('requestWithdrawal');
    return false;
  }, [warnWalletMutationBlocked]);

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
        spendGems,
        spendCash,
        fuel,
        addFuel,
        consumeFuel,
        withdrawalHistory,
        requestWithdrawal,
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
      balance: { gems: 0, cash: 0 },
      addCash: () => {
        warnWalletDiagnosticThrottled('wallet_add_cash_outside_provider');
      },
      addGems: () => {
        warnWalletDiagnosticThrottled('wallet_add_gems_outside_provider');
      },
      spendCash: () => false,
      spendGems: () => false,
      exchangeGemsForCash: () => false,
      exchangeCashForGems: () => false,
      addFuel: () => {
        warnWalletDiagnosticThrottled('wallet_add_fuel_outside_provider');
      },
      consumeFuel: () => false,
      requestWithdrawal: () => false,
      deductBalance: async () => false,
    };
  }
  return context;
}
