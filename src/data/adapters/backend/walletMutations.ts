import { readCurrentAuthAccessToken } from '../../../auth/currentAuthAccessToken';
import { getConfiguredBackendBaseUrl } from '../../../config/backendBaseUrl';
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

export type WalletWithdrawalRequest = {
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
};

export type WalletCashTransferRecord = {
  id: string;
  direction: 'sent' | 'received';
  amountCash: number;
  note: string;
  createdAt: string;
  otherUserId: string | null;
  otherAuthUserId: string | null;
  otherHandle: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

function normalizeWalletErrorCode(value: unknown, message: string): WalletMutationResult['code'] {
  if (
    value === 'unauthorized' ||
    value === 'insufficient_balance' ||
    value === 'insufficient_fuel' ||
    value === 'invalid_input' ||
    value === 'unavailable' ||
    value === 'unknown'
  ) {
    return value;
  }

  return classifyWalletError(message);
}

function isQaWalletMutationsDisabled(): boolean {
  return process.env.EXPO_PUBLIC_QA_DISABLE_WALLET_MUTATIONS?.trim() === '1';
}

async function callWalletReducer(
  mutation: string,
  body: Record<string, unknown>,
  refreshReason: string,
): Promise<WalletMutationResult> {
  if (isQaWalletMutationsDisabled()) {
    return { ok: true };
  }

  const baseUrl = getConfiguredBackendBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'Wallet backend is not configured.',
    };
  }

  const token = await readCurrentAuthAccessToken();
  if (!token) {
    return {
      ok: false,
      code: 'unauthorized',
      message: 'Wallet mutation requires an authenticated session.',
    };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/wallet/mutate`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mutation,
        ...body,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { code?: unknown; message?: unknown }
      | null;

    if (!response.ok) {
      const message =
        typeof payload?.message === 'string' && payload.message.trim().length > 0
          ? payload.message
          : `Wallet mutation failed (${response.status})`;
      const code = normalizeWalletErrorCode(payload?.code, message);

      return {
        ok: false,
        code,
        message,
      };
    }

    requestBackendRefresh({
      scopes: ['wallet'],
      source: 'manual',
      reason: refreshReason,
    });

    return { ok: true };
  } catch (error) {
    const message = describeError(error);
    if (__DEV__) {
      console.warn('[wallet] backend mutation failed', {
        mutation,
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

function normalizeWithdrawalStatus(value: unknown): WalletWithdrawalRequest['status'] {
  return value === 'pending' || value === 'processing' || value === 'completed' || value === 'declined'
    ? value
    : 'pending';
}

function normalizeWalletWithdrawalRequest(value: unknown): WalletWithdrawalRequest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Record<string, unknown>;
  const details =
    item.details && typeof item.details === 'object'
      ? (item.details as Record<string, unknown>)
      : {};

  const id = typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : null;
  if (!id) {
    return null;
  }

  return {
    id,
    amountGems: typeof item.amountGems === 'number' && Number.isFinite(item.amountGems) ? item.amountGems : 0,
    amountRealMoney:
      typeof item.amountRealMoney === 'number' && Number.isFinite(item.amountRealMoney)
        ? item.amountRealMoney
        : 0,
    status: normalizeWithdrawalStatus(item.status),
    date:
      typeof item.date === 'string' && item.date.trim().length > 0
        ? item.date
        : new Date(0).toISOString(),
    method:
      typeof item.method === 'string' && item.method.trim().length > 0 ? item.method : 'Unknown',
    details: {
      fullName: typeof details.fullName === 'string' ? details.fullName : '',
      email: typeof details.email === 'string' ? details.email : '',
      phoneNumber: typeof details.phoneNumber === 'string' ? details.phoneNumber : '',
    },
  };
}

function normalizeWalletCashTransferRecord(value: unknown): WalletCashTransferRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Record<string, unknown>;
  const direction = item.direction === 'received' ? 'received' : 'sent';
  const id = typeof item.id === 'string' && item.id.trim().length > 0 ? item.id : null;
  if (!id) {
    return null;
  }

  return {
    id,
    direction,
    amountCash:
      typeof item.amountCash === 'number' && Number.isFinite(item.amountCash)
        ? Math.max(0, Math.floor(item.amountCash))
        : 0,
    note: typeof item.note === 'string' ? item.note : '',
    createdAt:
      typeof item.createdAt === 'string' && item.createdAt.trim().length > 0
        ? item.createdAt
        : new Date(0).toISOString(),
    otherUserId:
      typeof item.otherUserId === 'string' && item.otherUserId.trim().length > 0
        ? item.otherUserId
        : null,
    otherAuthUserId:
      typeof item.otherAuthUserId === 'string' && item.otherAuthUserId.trim().length > 0
        ? item.otherAuthUserId
        : null,
    otherHandle:
      typeof item.otherHandle === 'string' && item.otherHandle.trim().length > 0
        ? item.otherHandle
        : 'unknown',
  };
}

export async function purchaseFuelPack(
  userId: string,
  fuelAmount: number,
  paymentCurrency: 'gems' | 'cash',
  source = 'client_refuel',
): Promise<WalletMutationResult> {
  return callWalletReducer(
    'purchase_fuel_pack',
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
    'spend_fuel',
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
    'claim_ad_reward',
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
    'credit_gems_purchase',
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
    'convert_gems_to_cash',
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
    'convert_cash_to_gems',
    {
      userId,
      cashToConvert: Math.max(0, Math.floor(cashToConvert)),
    },
    'wallet_convert_cash_to_gems',
  );
}

export async function spendCashBalance(
  userId: string,
  cashToSpend: number,
  options?: {
    reason?: string;
    source?: string;
  },
): Promise<WalletMutationResult> {
  return callWalletReducer(
    'spend_cash',
    {
      userId,
      cashToSpend: Math.max(0, Math.floor(cashToSpend)),
      reason: options?.reason ?? null,
      source: options?.source ?? 'client_spend_cash',
    },
    'wallet_spend_cash',
  );
}

export async function spendGemsBalance(
  userId: string,
  gemsToSpend: number,
  options?: {
    reason?: string;
    source?: string;
  },
): Promise<WalletMutationResult> {
  return callWalletReducer(
    'spend_gems',
    {
      userId,
      gemsToSpend: Math.max(0, Math.floor(gemsToSpend)),
      reason: options?.reason ?? null,
      source: options?.source ?? 'client_spend_gems',
    },
    'wallet_spend_gems',
  );
}

export async function fetchWalletWithdrawalHistory(): Promise<WalletWithdrawalRequest[] | null> {
  const baseUrl = getConfiguredBackendBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const token = await readCurrentAuthAccessToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/wallet/withdrawals`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const message =
        isRecord(payload) && typeof payload.error === 'string'
          ? payload.error
          : `Wallet withdrawal read failed (${response.status})`;
      throw new Error(message);
    }

    const items = isRecord(payload) && Array.isArray(payload.requests) ? payload.requests : [];
    return items
      .map((entry: unknown) => normalizeWalletWithdrawalRequest(entry))
      .filter((entry: WalletWithdrawalRequest | null): entry is WalletWithdrawalRequest => Boolean(entry));
  } catch (error) {
    if (__DEV__) {
      console.warn('[wallet] withdrawal history fetch failed', {
        message: describeError(error),
      });
    }
    return null;
  }
}

export async function fetchWalletCashTransferHistory(
  limit = 20,
): Promise<WalletCashTransferRecord[] | null> {
  const baseUrl = getConfiguredBackendBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const token = await readCurrentAuthAccessToken();
  if (!token) {
    return null;
  }

  try {
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}/api/wallet/transfers`);
    url.searchParams.set('limit', String(Math.max(1, Math.floor(limit))));
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const message =
        isRecord(payload) && typeof payload.error === 'string'
          ? payload.error
          : `Wallet transfer read failed (${response.status})`;
      throw new Error(message);
    }

    const items = isRecord(payload) && Array.isArray(payload.transfers) ? payload.transfers : [];
    return items
      .map((entry: unknown) => normalizeWalletCashTransferRecord(entry))
      .filter((entry: WalletCashTransferRecord | null): entry is WalletCashTransferRecord => Boolean(entry));
  } catch (error) {
    if (__DEV__) {
      console.warn('[wallet] cash transfer history fetch failed', {
        message: describeError(error),
      });
    }
    return null;
  }
}

export async function requestWalletWithdrawal(
  amountGems: number,
  details: WalletWithdrawalRequest['details'],
  method: string,
): Promise<WalletMutationResult> {
  const baseUrl = getConfiguredBackendBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'Wallet backend is not configured.',
    };
  }

  const token = await readCurrentAuthAccessToken();
  if (!token) {
    return {
      ok: false,
      code: 'unauthorized',
      message: 'Wallet withdrawal requires an authenticated session.',
    };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/wallet/withdrawals`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amountGems: Math.max(0, Math.floor(amountGems)),
        method,
        details,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { code?: unknown; message?: unknown }
      | null;

    if (!response.ok) {
      const message =
        typeof payload?.message === 'string' && payload.message.trim().length > 0
          ? payload.message
          : `Wallet withdrawal failed (${response.status})`;
      return {
        ok: false,
        code: normalizeWalletErrorCode(payload?.code, message),
        message,
      };
    }

    requestBackendRefresh({
      scopes: ['wallet'],
      source: 'manual',
      reason: 'wallet_request_withdrawal',
    });

    return { ok: true };
  } catch (error) {
    const message = describeError(error);
    if (__DEV__) {
      console.warn('[wallet] withdrawal request failed', {
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

export async function sendWalletCashTransfer(input: {
  targetUserId?: string | null;
  targetHandle?: string | null;
  amountCash: number;
  note?: string | null;
  requestIdempotencyKey?: string | null;
}): Promise<WalletMutationResult & { transfer?: WalletCashTransferRecord | null }> {
  const baseUrl = getConfiguredBackendBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'Wallet backend is not configured.',
    };
  }

  const token = await readCurrentAuthAccessToken();
  if (!token) {
    return {
      ok: false,
      code: 'unauthorized',
      message: 'Cash transfer requires an authenticated session.',
    };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/wallet/transfers`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetUserId: input.targetUserId ?? null,
        targetHandle: input.targetHandle ?? null,
        amountCash: Math.max(0, Math.floor(input.amountCash)),
        note: input.note ?? null,
        requestIdempotencyKey: input.requestIdempotencyKey ?? null,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { code?: unknown; message?: unknown; transfer?: unknown }
      | null;

    if (!response.ok) {
      const message =
        typeof payload?.message === 'string' && payload.message.trim().length > 0
          ? payload.message
          : `Cash transfer failed (${response.status})`;
      return {
        ok: false,
        code: normalizeWalletErrorCode(payload?.code, message),
        message,
      };
    }

    requestBackendRefresh({
      scopes: ['wallet'],
      source: 'manual',
      reason: 'wallet_send_cash_transfer',
    });

    return {
      ok: true,
      transfer: normalizeWalletCashTransferRecord(payload?.transfer),
    };
  } catch (error) {
    const message = describeError(error);
    if (__DEV__) {
      console.warn('[wallet] cash transfer failed', {
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
