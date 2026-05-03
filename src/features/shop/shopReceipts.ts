import type { WalletTransactionRecord } from '../../data/adapters/backend/walletQueries';

export type ShopOperationKind =
  | 'purchase_gems'
  | 'purchase_fuel'
  | 'claim_reward'
  | 'exchange_currency';

export type ShopReceiptStatus = 'idle' | 'pending' | 'success' | 'failure';

export type ShopReceiptState = {
  status: ShopReceiptStatus;
  kind: ShopOperationKind | null;
  title: string;
  message: string;
  transactionId?: string;
  balanceAfter?: {
    gems: number;
    cash: number;
    fuel: number;
  };
};

export type WalletTransactionMatchSpec = {
  eventType: string;
  createdAfterMs?: number;
  purchaseToken?: string;
  source?: string;
  deltaGems?: number;
  deltaCash?: number;
  deltaFuel?: number;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readWalletBalanceFromRecord(record: Record<string, unknown> | undefined): {
  gems: number;
  cash: number;
  fuel: number;
} {
  return {
    gems: Math.max(0, Math.trunc(readNumber(record?.gems) ?? 0)),
    cash: Math.max(0, Math.trunc(readNumber(record?.cash) ?? 0)),
    fuel: Math.max(0, Math.trunc(readNumber(record?.fuel) ?? 0)),
  };
}

export function buildPendingReceipt(
  kind: ShopOperationKind,
  title: string,
  message: string,
): ShopReceiptState {
  return {
    status: 'pending',
    kind,
    title,
    message,
  };
}

export function buildFailureReceipt(
  kind: ShopOperationKind,
  message: string,
): ShopReceiptState {
  return {
    status: 'failure',
    kind,
    title: 'Action failed',
    message,
  };
}

export function matchesWalletTransaction(
  transaction: WalletTransactionRecord,
  match: WalletTransactionMatchSpec,
): boolean {
  if (transaction.eventType !== match.eventType) {
    return false;
  }

  if (
    match.createdAfterMs !== undefined &&
    transaction.createdAtMs < Math.max(0, Math.trunc(match.createdAfterMs))
  ) {
    return false;
  }

  if (match.purchaseToken) {
    return readString(transaction.metadata.purchaseToken) === match.purchaseToken;
  }

  if (match.source && readString(transaction.metadata.source) !== match.source) {
    return false;
  }

  if (
    match.deltaGems !== undefined &&
    Math.trunc(transaction.deltaGems) !== Math.trunc(match.deltaGems)
  ) {
    return false;
  }

  if (
    match.deltaCash !== undefined &&
    Math.trunc(transaction.deltaCash) !== Math.trunc(match.deltaCash)
  ) {
    return false;
  }

  if (
    match.deltaFuel !== undefined &&
    Math.trunc(transaction.deltaFuel) !== Math.trunc(match.deltaFuel)
  ) {
    return false;
  }

  return true;
}

function buildSuccessMessage(transaction: WalletTransactionRecord): string {
  switch (transaction.eventType) {
    case 'credit_gems_purchase':
      return `Added ${transaction.deltaGems} Gems to your wallet.`;
    case 'purchase_fuel_pack':
      return `Added ${transaction.deltaFuel}m fuel and updated your wallet balance.`;
    case 'claim_ad_reward':
    case 'claim_earn_ad_reward':
      return `Reward added: +${transaction.deltaGems} Gems.`;
    case 'claim_earn_streak_reward':
      return `Streak reward added: +${transaction.deltaGems} Gems.`;
    case 'convert_gems_to_cash':
      return `Exchanged ${Math.abs(transaction.deltaGems)} Gems for ${transaction.deltaCash} Cash.`;
    case 'convert_cash_to_gems':
      return `Exchanged ${Math.abs(transaction.deltaCash)} Cash for ${transaction.deltaGems} Gems.`;
    default:
      return 'Wallet update recorded successfully.';
  }
}

function buildSuccessTitle(transaction: WalletTransactionRecord): string {
  switch (transaction.eventType) {
    case 'credit_gems_purchase':
      return 'Purchase complete';
    case 'purchase_fuel_pack':
      return 'Refuel complete';
    case 'claim_ad_reward':
    case 'claim_earn_ad_reward':
      return 'Reward claimed';
    case 'claim_earn_streak_reward':
      return 'Streak updated';
    case 'convert_gems_to_cash':
    case 'convert_cash_to_gems':
      return 'Exchange complete';
    default:
      return 'Wallet updated';
  }
}

export function buildSuccessReceipt(
  kind: ShopOperationKind,
  transaction: WalletTransactionRecord,
): ShopReceiptState {
  return {
    status: 'success',
    kind,
    title: buildSuccessTitle(transaction),
    message: buildSuccessMessage(transaction),
    transactionId: transaction.id,
    balanceAfter: readWalletBalanceFromRecord(transaction.balanceAfter),
  };
}
