import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import { useAuth as useSessionAuth } from '../auth/spacetimeSession';

import {
  fetchAccountState as fetchBackendAccountState,
} from '../data/adapters/backend/accountState';

function toNonNegativeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
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

  // Refs to avoid stale closures in callbacks
  const fuelRef = useRef(fuel);
  const gemsRef = useRef(gems);
  const cashRef = useRef(cash);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // Keep refs in sync with state
  useEffect(() => { fuelRef.current = fuel; }, [fuel]);
  useEffect(() => { gemsRef.current = gems; }, [gems]);
  useEffect(() => { cashRef.current = cash; }, [cash]);

  useEffect(() => {
    let active = true;

    const resetWalletState = () => {
      gemsRef.current = 0;
      cashRef.current = 0;
      fuelRef.current = 0;
      setGems(0);
      setCash(0);
      setFuel(0);
      setWithdrawalHistory([]);
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

    setWalletHydrated(false);

    const hydrateWallet = async () => {
      const accountState = await fetchBackendAccountState(
        null,
        getTokenRef.current,
        userId,
      );
      if (!active) return;

      if (!accountState) {
        setWalletHydrated(true);
        return;
      }

      const walletState =
        accountState?.wallet && typeof accountState.wallet === 'object'
          ? (accountState.wallet as Record<string, unknown>)
          : {};

      const nextGems = toNonNegativeNumber(walletState.gems);
      const nextCash = toNonNegativeNumber(walletState.cash);
      const nextFuel = toNonNegativeNumber(walletState.fuel);
      const nextWithdrawalHistory = parseWithdrawalHistory(walletState.withdrawalHistory);

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
    };
  }, [isAuthLoaded, isSignedIn, userId]);

  const warnWalletMutationBlocked = useCallback((action: string) => {
    if (__DEV__) {
      console.warn(`[wallet] blocked client-side mutation: ${action}`);
    }
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
    if (__DEV__) {
      console.warn('useWallet must be used within a WalletProvider. Using default values.');
    }
    // Return safe default values instead of throwing
    return {
      cash: 0,
      gems: 0,
      fuel: 0,
      withdrawalHistory: [],
      balance: { gems: 0, cash: 0 },
      addCash: () => {
        if (__DEV__) {
          console.warn('addCash called outside WalletProvider');
        }
      },
      addGems: () => {
        if (__DEV__) {
          console.warn('addGems called outside WalletProvider');
        }
      },
      spendCash: () => false,
      spendGems: () => false,
      exchangeGemsForCash: () => false,
      exchangeCashForGems: () => false,
      addFuel: () => {
        if (__DEV__) {
          console.warn('addFuel called outside WalletProvider');
        }
      },
      consumeFuel: () => false,
      requestWithdrawal: () => false,
      deductBalance: async () => false,
    };
  }
  return context;
}
