import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ConfirmActionModal,
  type ConfirmActionPayload,
} from '../components/ConfirmActionModal';
import { useAdminActionState } from '../hooks/useAdminActionState';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminBackend } from '../hooks/useAdminBackend';
import {
  ActionCard,
  AdminActionBanner,
  AdminButton,
  AdminSectionHeader,
  AdminTextInput,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { adminTokens } from '../ui/adminTokens';
import { getPermissionLabel } from '../utils/permissions';

type WalletAdjustmentOperation = 'add' | 'remove' | 'set';
type PendingWalletAction = { operation: WalletAdjustmentOperation } | null;

const QUICK_CURRENCIES = ['gems', 'fuel', 'cash', 'gold'] as const;

const WALLET_ACTION_CONFIG: Record<
  WalletAdjustmentOperation,
  {
    buttonLabel: string;
    buttonTone: 'success' | 'danger' | 'warning';
    confirmLabel: string;
    modalTitle: string;
    successMessage: (currency: string, targetUserId: string) => string;
    errorMessage: string;
    requireTypeToConfirmText?: string;
    requireSecondApproval?: boolean;
    secondApprovalLabel?: string;
    secondApprovalDescription?: string;
  }
> = {
  add: {
    buttonLabel: 'Add Funds',
    buttonTone: 'success',
    confirmLabel: 'Confirm Credit',
    modalTitle: 'Confirm Wallet Credit',
    successMessage: (currency, targetUserId) =>
      `${currency.toUpperCase()} credited for ${targetUserId}.`,
    errorMessage: 'Wallet credit failed.',
  },
  remove: {
    buttonLabel: 'Remove Funds',
    buttonTone: 'danger',
    confirmLabel: 'Confirm Removal',
    modalTitle: 'Confirm Wallet Debit',
    successMessage: (currency, targetUserId) =>
      `${currency.toUpperCase()} removed from ${targetUserId}.`,
    errorMessage: 'Wallet debit failed.',
    requireTypeToConfirmText: 'CONFIRM',
  },
  set: {
    buttonLabel: 'Set Balance',
    buttonTone: 'warning',
    confirmLabel: 'Confirm Override',
    modalTitle: 'Confirm Wallet Override',
    successMessage: (currency, targetUserId) =>
      `${currency.toUpperCase()} balance overridden for ${targetUserId}.`,
    errorMessage: 'Wallet override failed.',
    requireTypeToConfirmText: 'CONFIRM',
    requireSecondApproval: true,
    secondApprovalLabel: 'Secondary approval captured',
    secondApprovalDescription:
      'This checkbox is the future-ready second approver flag for balance overrides.',
  },
};

function getBannerTone(status?: string) {
  if (status === 'error') return 'danger';
  if (status === 'success') return 'success';
  return 'warning';
}

function normalizeCurrency(value: string) {
  return value.trim().toLowerCase();
}

export function FinanceTab() {
  const { canPerform } = useAdminAuth();
  const { post } = useAdminBackend();
  const { actions, runAction } = useAdminActionState();
  const [targetUserId, setTargetUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('gems');
  const [pendingWalletAction, setPendingWalletAction] = useState<PendingWalletAction>(null);
  const canEditWallet = canPerform('EDIT_WALLET');
  const normalizedCurrency = normalizeCurrency(currency);

  const confirmWalletAction = async ({ reason }: ConfirmActionPayload) => {
    if (!pendingWalletAction || !canEditWallet) {
      return;
    }

    const parsedAmount = Number(amount.trim());
    const userId = targetUserId.trim();
    const actionConfig = WALLET_ACTION_CONFIG[pendingWalletAction.operation];

    const success = await runAction(
      'wallet-adjust',
      async () => {
        if (!userId) {
          throw new Error('Target user ID is required.');
        }

        if (!normalizedCurrency) {
          throw new Error('Balance key is required.');
        }

        if (!Number.isFinite(parsedAmount) || !Number.isInteger(parsedAmount)) {
          throw new Error('Amount must be a whole number.');
        }

        if (pendingWalletAction.operation === 'set') {
          if (parsedAmount < 0) {
            throw new Error('Amount must be 0 or greater for overrides.');
          }
        } else if (parsedAmount <= 0) {
          throw new Error('Amount must be greater than 0.');
        }

        await post('/admin/wallet/adjust', {
          amount: parsedAmount,
          currency: normalizedCurrency,
          operation: pendingWalletAction.operation,
          reason,
          userId,
        });
      },
      {
        successMessage: actionConfig.successMessage(normalizedCurrency, userId),
        errorMessage: actionConfig.errorMessage,
      },
    );

    if (success) {
      setAmount('');
      setPendingWalletAction(null);
    }
  };

  const pendingActionConfig = pendingWalletAction
    ? WALLET_ACTION_CONFIG[pendingWalletAction.operation]
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AdminSectionHeader
        title="Wallet operations"
        description="Run guarded add, remove, and override balance actions with shared confirmation."
      />

      <ReadOnlyCard
        title="Policy"
        subtitle="Every wallet edit requires a reason. High-risk edits require typed confirmation, and overrides include a future-ready second approval flag."
      />

      <ActionCard
        title="Prepare wallet edit"
        subtitle="Target a user, choose the balance key, then confirm the action in the shared safety modal."
        tone="primary"
      >
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Target user ID</Text>
          <AdminTextInput
            value={targetUserId}
            onChangeText={setTargetUserId}
            placeholder="Enter target UUID"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Balance key</Text>
          <View style={styles.buttonRow}>
            {QUICK_CURRENCIES.map((nextCurrency) => (
              <AdminButton
                key={nextCurrency}
                label={nextCurrency.toUpperCase()}
                tone={normalizedCurrency === nextCurrency ? 'primary' : 'neutral'}
                disabled={!canEditWallet}
                disabledReason={!canEditWallet ? getPermissionLabel('EDIT_WALLET') : undefined}
                onPress={() => setCurrency(nextCurrency)}
              />
            ))}
          </View>
          <AdminTextInput
            value={currency}
            onChangeText={setCurrency}
            placeholder="Custom key (example: gold)"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Amount</Text>
          <AdminTextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.buttonRow}>
          {(Object.keys(WALLET_ACTION_CONFIG) as WalletAdjustmentOperation[]).map((operation) => {
            const config = WALLET_ACTION_CONFIG[operation];
            return (
              <AdminButton
                key={operation}
                label={config.buttonLabel}
                tone={config.buttonTone}
                disabled={!canEditWallet}
                disabledReason={!canEditWallet ? getPermissionLabel('EDIT_WALLET') : undefined}
                onPress={() => setPendingWalletAction({ operation })}
              />
            );
          })}
        </View>

        {actions['wallet-adjust']?.message ? (
          <AdminActionBanner
            tone={getBannerTone(actions['wallet-adjust']?.status)}
            message={actions['wallet-adjust']?.message || ''}
          />
        ) : null}
      </ActionCard>

      <ConfirmActionModal
        visible={!!pendingWalletAction}
        title={pendingActionConfig?.modalTitle ?? 'Confirm Wallet Change'}
        description={
          pendingWalletAction && pendingActionConfig
            ? `${pendingActionConfig.confirmLabel} for ${normalizedCurrency || 'selected balance'} on ${
                targetUserId.trim() || 'this user'
              } with amount ${amount.trim() || '0'}.`
            : ''
        }
        confirmLabel={pendingActionConfig?.confirmLabel ?? 'Confirm'}
        tone={pendingActionConfig?.buttonTone ?? 'danger'}
        requireReason
        requireTypeToConfirmText={pendingActionConfig?.requireTypeToConfirmText}
        requireSecondApproval={pendingActionConfig?.requireSecondApproval}
        secondApprovalLabel={pendingActionConfig?.secondApprovalLabel}
        secondApprovalDescription={pendingActionConfig?.secondApprovalDescription}
        loading={actions['wallet-adjust']?.status === 'loading'}
        onCancel={() => setPendingWalletAction(null)}
        onConfirm={confirmWalletAction}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: adminTokens.spacing.pageX,
    paddingTop: adminTokens.spacing.gapMd,
    paddingBottom: 140,
    gap: adminTokens.spacing.gapMd,
  },
  inputGroup: {
    gap: adminTokens.spacing.gapSm,
  },
  label: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  buttonRow: {
    gap: adminTokens.spacing.gapSm,
  },
});
