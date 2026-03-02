import { spacetimeDb } from '../../../lib/spacetime';
import { requestBackendRefresh } from './refreshBus';

export type WalletMutationResult = {
  ok: boolean;
  code?:
    | 'unauthorized'
    | 'insufficient_balance'
    | 'insufficient_fuel'
    | 'invalid_input'
    | 'unavailable'
    | 'unknown';
  message?: string;
};

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown wallet mutation error';
  }
}

function classifyWalletError(message: string): WalletMutationResult['code'] {
  const normalized = message.toLowerCase();
  if (normalized.includes('unauthorized')) return 'unauthorized';
  if (normalized.includes('insufficient fuel')) return 'insufficient_fuel';
  if (normalized.includes('insufficient')) return 'insufficient_balance';
  if (
    normalized.includes('must be') ||
    normalized.includes('invalid') ||
    normalized.includes('unsupported') ||
    normalized.includes('required')
  ) {
    return 'invalid_input';
  }
  if (normalized.includes('unavailable')) return 'unavailable';
  return 'unknown';
}

async function callWalletReducer(
  reducerName: string,
  args: Record<string, unknown>,
  refreshReason: string,
): Promise<WalletMutationResult> {
  try {
    const reducers = spacetimeDb.reducers as any;
    const reducer = reducers?.[reducerName];
    if (typeof reducer !== 'function') {
      return {
        ok: false,
        code: 'unavailable',
        message: `Reducer "${reducerName}" is unavailable.`,
      };
    }

    await reducer(args);
    requestBackendRefresh({
      scopes: ['wallet'],
      source: 'manual',
      reason: refreshReason,
    });

    return { ok: true };
  } catch (error) {
    const message = describeError(error);
    if (__DEV__) {
      console.warn('[wallet] reducer mutation failed', {
        reducerName,
        message,
      });
    }

    return {
      ok: false,
      code: classifyWalletError(message),
      message,
    };
  }
}

export async function purchaseFuelPack(
  userId: string,
  fuelAmount: number,
  paymentCurrency: 'gems' | 'cash',
  source = 'client_refuel',
): Promise<WalletMutationResult> {
  return callWalletReducer(
    'purchaseFuelPack',
    {
      userId,
      fuelAmount: Math.max(0, Math.floor(fuelAmount)),
      paymentCurrency,
      source,
    },
    'wallet_purchase_fuel_pack',
  );
}

export async function spendFuelTick(
  userId: string,
  fuelToSpend = 1,
  reason = 'live_tick',
): Promise<WalletMutationResult> {
  return callWalletReducer(
    'spendFuel',
    {
      userId,
      fuelToSpend: Math.max(0, Math.floor(fuelToSpend)),
      reason,
    },
    'wallet_spend_fuel_tick',
  );
}

export async function claimAdReward(
  userId: string,
  source = 'shop_watch_ad',
): Promise<WalletMutationResult> {
  return callWalletReducer(
    'claimAdReward',
    {
      userId,
      source,
    },
    'wallet_claim_ad_reward',
  );
}

export async function creditGemsPurchase(
  userId: string,
  gemsToCredit: number,
  purchaseToken: string,
  priceLabel?: string,
  source = 'shop_purchase',
): Promise<WalletMutationResult> {
  return callWalletReducer(
    'creditGemsPurchase',
    {
      userId,
      gemsToCredit: Math.max(0, Math.floor(gemsToCredit)),
      purchaseToken,
      priceLabel,
      source,
    },
    'wallet_credit_gems_purchase',
  );
}

export async function convertGemsToCash(
  userId: string,
  gemsToConvert: number,
): Promise<WalletMutationResult> {
  return callWalletReducer(
    'convertGemsToCash',
    {
      userId,
      gemsToConvert: Math.max(0, Math.floor(gemsToConvert)),
    },
    'wallet_convert_gems_to_cash',
  );
}

export async function convertCashToGems(
  userId: string,
  cashToConvert: number,
): Promise<WalletMutationResult> {
  return callWalletReducer(
    'convertCashToGems',
    {
      userId,
      cashToConvert: Math.max(0, Math.floor(cashToConvert)),
    },
    'wallet_convert_cash_to_gems',
  );
}

