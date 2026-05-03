import { railwayDb } from '../../../lib/railwayRuntime';

type UnknownRecord = Record<string, unknown>;

export type WalletBalanceSnapshot = {
  userId: string | null;
  gems: number;
  cash: number;
  fuel: number;
  updatedAtMs: number | null;
};

export type WalletTransactionRecord = {
  id: string;
  userId: string | null;
  eventType: string;
  deltaGems: number;
  deltaCash: number;
  deltaFuel: number;
  balanceBefore: UnknownRecord;
  balanceAfter: UnknownRecord;
  metadata: UnknownRecord;
  createdAtMs: number;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : fallback;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function parseJsonRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'string') {
    return {};
  }

  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function readRows(viewKeys: string[]): any[] {
  const dbView = railwayDb.db as any;
  for (const viewKey of viewKeys) {
    const rows = Array.from(dbView?.[viewKey]?.iter?.() ?? []);
    if (rows.length > 0) {
      return rows;
    }
  }

  const fallbackKey = viewKeys[0];
  return Array.from(dbView?.[fallbackKey]?.iter?.() ?? []);
}

export function fetchMyWalletBalance(): WalletBalanceSnapshot | null {
  const row = readRows(['myWalletBalance', 'my_wallet_balance'])[0];
  if (!row) {
    return null;
  }

  const updatedAtMs = toNumber(row.updatedAt ?? row.updated_at, Number.NaN);

  return {
    userId: asString(row.userId ?? row.user_id),
    gems: Math.max(0, Math.floor(toNumber(row.gems))),
    cash: Math.max(0, Math.floor(toNumber(row.cash))),
    fuel: Math.max(0, Math.floor(toNumber(row.fuel))),
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : null,
  };
}

export function fetchMyWalletTransactions(): WalletTransactionRecord[] {
  const rows = readRows(['myWalletTransactions', 'my_wallet_transactions']);
  return rows
    .map((row) => ({
      id: asString(row.id) ?? '',
      userId: asString(row.userId ?? row.user_id),
      eventType: asString(row.eventType ?? row.event_type) ?? '',
      deltaGems: Math.trunc(toNumber(row.deltaGems ?? row.delta_gems)),
      deltaCash: Math.trunc(toNumber(row.deltaCash ?? row.delta_cash)),
      deltaFuel: Math.trunc(toNumber(row.deltaFuel ?? row.delta_fuel)),
      balanceBefore: parseJsonRecord(row.balanceBefore ?? row.balance_before),
      balanceAfter: parseJsonRecord(row.balanceAfter ?? row.balance_after),
      metadata: parseJsonRecord(row.metadata),
      createdAtMs: Math.max(0, Math.trunc(toNumber(row.createdAt ?? row.created_at))),
    }))
    .filter((row) => row.id.length > 0 && row.eventType.length > 0)
    .sort((left, right) => right.createdAtMs - left.createdAtMs);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForWalletTransaction(
  matcher: (row: WalletTransactionRecord) => boolean,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<WalletTransactionRecord | null> {
  const timeoutMs = Math.max(100, Math.floor(options?.timeoutMs ?? 4_000));
  const intervalMs = Math.max(50, Math.floor(options?.intervalMs ?? 150));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const match = fetchMyWalletTransactions().find(matcher) ?? null;
    if (match) {
      return match;
    }
    await delay(intervalMs);
  }

  return null;
}
