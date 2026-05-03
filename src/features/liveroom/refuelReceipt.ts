import type { WalletMutationResult } from '../../data/adapters/backend/walletMutations';
import {
  buildPendingReceipt,
  type ShopReceiptState,
  type WalletTransactionMatchSpec,
} from '../shop/shopReceipts';
import { FUEL_COSTS, type FuelFillAmount } from './types';

export type RefuelReceiptState = ShopReceiptState;

export const IDLE_REFUEL_RECEIPT: RefuelReceiptState = {
  status: 'idle',
  kind: null,
  title: '',
  message: '',
};

function formatFuelPackLabel(amount: FuelFillAmount): string {
  if (amount >= 60) {
    const hours = Math.floor(amount / 60);
    const minutes = amount % 60;
    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
  }

  return `${amount}m`;
}

export function buildRefuelPendingReceipt(amount: FuelFillAmount): RefuelReceiptState {
  return buildPendingReceipt(
    'purchase_fuel',
    'Processing refuel',
    `Waiting for the server to credit ${formatFuelPackLabel(amount)} fuel.`,
  );
}

export function buildRefuelTransactionMatch(params: {
  amount: FuelFillAmount;
  paymentType: 'gems' | 'cash';
  source: string;
}): WalletTransactionMatchSpec {
  const cost = FUEL_COSTS[params.amount];

  return {
    eventType: 'purchase_fuel_pack',
    source: params.source,
    deltaFuel: params.amount,
    deltaGems: params.paymentType === 'gems' ? -cost.gems : 0,
    deltaCash: params.paymentType === 'cash' ? -cost.cash : 0,
  };
}

export function buildRefuelFailureMessage(
  result: WalletMutationResult,
  paymentType: 'gems' | 'cash',
): string {
  if (result.code === 'unauthorized') {
    return 'Sign in required to refuel.';
  }
  if (result.code === 'insufficient_balance') {
    return `Not enough ${paymentType === 'gems' ? 'Gems' : 'Cash'} to buy this fuel pack.`;
  }
  if (result.code === 'invalid_input') {
    return 'Choose a valid fuel pack to continue.';
  }
  if (result.code === 'unavailable') {
    return 'Refuel is unavailable right now.';
  }
  return result.message ?? 'Refuel failed. Please try again.';
}

export function buildRefuelFallbackSuccessMessage(amount: FuelFillAmount): string {
  return `Added ${formatFuelPackLabel(amount)} fuel and refreshed your wallet.`;
}

export function getRefuelActionLabel(params: {
  status: RefuelReceiptState['status'];
  walletReady: boolean;
  canAfford: boolean;
  paymentType: 'gems' | 'cash';
  defaultLabel: string;
}): string {
  if (params.status === 'pending') {
    return 'Processing...';
  }

  if (params.status === 'success') {
    return 'Done';
  }

  if (!params.walletReady) {
    return 'Syncing wallet...';
  }

  if (!params.canAfford) {
    return `Not enough ${params.paymentType === 'gems' ? 'Gems' : 'Cash'}`;
  }

  return params.defaultLabel;
}
