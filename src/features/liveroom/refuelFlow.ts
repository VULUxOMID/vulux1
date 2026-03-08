import { fetchMyWalletBalance, waitForWalletTransaction } from '../../data/adapters/backend/walletQueries';
import { purchaseFuelPack } from '../../data/adapters/backend/walletMutations';
import {
  buildFailureReceipt,
  buildSuccessReceipt,
  matchesWalletTransaction,
} from '../shop/shopReceipts';
import type { FuelFillAmount } from './types';
import {
  buildRefuelFailureMessage,
  buildRefuelFallbackSuccessMessage,
  buildRefuelPendingReceipt,
  buildRefuelTransactionMatch,
  IDLE_REFUEL_RECEIPT,
  type RefuelReceiptState,
} from './refuelReceipt';

export {
  buildRefuelFailureMessage,
  buildRefuelPendingReceipt,
  buildRefuelTransactionMatch,
  IDLE_REFUEL_RECEIPT,
};
export type { RefuelReceiptState } from './refuelReceipt';

export async function runRefuelAction(params: {
  userId: string;
  amount: FuelFillAmount;
  paymentType: 'gems' | 'cash';
  source: string;
}): Promise<RefuelReceiptState> {
  const actionStartedAtMs = Date.now();
  const result = await purchaseFuelPack(
    params.userId,
    params.amount,
    params.paymentType,
    params.source,
  );

  if (!result.ok) {
    return buildFailureReceipt(
      'purchase_fuel',
      buildRefuelFailureMessage(result, params.paymentType),
    );
  }

  const transaction = await waitForWalletTransaction((row) =>
    matchesWalletTransaction(row, {
      ...buildRefuelTransactionMatch({
        amount: params.amount,
        paymentType: params.paymentType,
        source: params.source,
      }),
      createdAfterMs: actionStartedAtMs,
    }),
  );

  if (transaction) {
    return buildSuccessReceipt('purchase_fuel', transaction);
  }

  const balance = fetchMyWalletBalance();
  return {
    status: 'success',
    kind: 'purchase_fuel',
    title: 'Refuel complete',
    message: buildRefuelFallbackSuccessMessage(params.amount),
    balanceAfter: balance
      ? {
          gems: balance.gems,
          cash: balance.cash,
          fuel: balance.fuel,
        }
      : undefined,
  };
}
