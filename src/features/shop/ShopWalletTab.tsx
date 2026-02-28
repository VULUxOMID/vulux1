import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { AppButton, AppText, CashIcon, SectionCard } from '../../components';
import { toast } from '../../components/Toast';
import { colors, radius, spacing } from '../../theme';
import type { WithdrawalRequest } from '../../context';

type ShopWalletTabProps = {
  gems: number;
  cash: number;
  withdrawalHistory: WithdrawalRequest[];
  onExchangeGemsToCash: (amount: number) => void;
  onExchangeCashToGems: (amount: number) => void;
  onOpenWithdrawal: () => void;
  onViewHistory: () => void;
};

type ExchangeDirection = 'gems' | 'cash';

type ExchangeOption = {
  id: string;
  from: ExchangeDirection;
  to: ExchangeDirection;
  fromAmount: number;
  toAmount: number;
  actionLabel: string;
};

const EXCHANGE_OPTIONS: ExchangeOption[] = [
  {
    id: 'gems-10',
    from: 'gems',
    to: 'cash',
    fromAmount: 10,
    toAmount: 100,
    actionLabel: 'Get Cash',
  },
  {
    id: 'gems-100',
    from: 'gems',
    to: 'cash',
    fromAmount: 100,
    toAmount: 1000,
    actionLabel: 'Get Cash',
  },
  {
    id: 'cash-1000',
    from: 'cash',
    to: 'gems',
    fromAmount: 1000,
    toAmount: 100,
    actionLabel: 'Get Gems',
  },
];

const STATUS_STYLES = {
  completed: {
    backgroundColor: `${colors.accentSuccess}1A`,
    textColor: colors.accentSuccess,
    iconBackground: `${colors.accentSuccess}20`,
  },
  processing: {
    backgroundColor: `${colors.accentWarning}1A`,
    textColor: colors.accentWarning,
    iconBackground: `${colors.accentWarning}20`,
  },
  pending: {
    backgroundColor: `${colors.accentWarning}1A`,
    textColor: colors.accentWarning,
    iconBackground: `${colors.accentWarning}20`,
  },
  declined: {
    backgroundColor: `${colors.accentDanger}1A`,
    textColor: colors.accentDanger,
    iconBackground: `${colors.accentDanger}20`,
  },
} as const;

export const ShopWalletTab = React.memo(function ShopWalletTab({
  gems,
  cash,
  withdrawalHistory,
  onExchangeGemsToCash,
  onExchangeCashToGems,
  onOpenWithdrawal,
  onViewHistory,
}: ShopWalletTabProps) {
  const exchangeRows = useMemo(() => EXCHANGE_OPTIONS, []);
  const recentHistory = useMemo(() => withdrawalHistory.slice(0, 3), [withdrawalHistory]);

  return (
    <View style={styles.container}>
      <SectionCard
        title="Currency Exchange"
        subtitle="1 Gem = 10 Cash"
        titleVariant="h3"
        subtitleVariant="tiny"
        contentStyle={styles.exchangeList}
      >
        {exchangeRows.map((row) => {
          const canAfford =
            row.from === 'gems' ? gems >= row.fromAmount : cash >= row.fromAmount;
          const handleExchange = () => {
            if (!canAfford) {
              toast.warning('You do not have enough balance.');
              return;
            }

            if (row.from === 'gems') {
              onExchangeGemsToCash(row.fromAmount);
            } else {
              onExchangeCashToGems(row.fromAmount);
            }
          };

          return (
            <ExchangeRow
              key={row.id}
              row={row}
              canAfford={canAfford}
              onExchange={handleExchange}
            />
          );
        })}
      </SectionCard>

      <View style={styles.withdrawalSection}>
        <AppText variant="h3" style={styles.sectionTitle}>
          Withdraw Funds
        </AppText>
        <LinearGradient
          colors={[colors.surface, colors.surfaceAlt]}
          style={styles.withdrawalCard}
        >
          <View style={styles.withdrawalIconCircle}>
            <Ionicons name="cash-outline" size={spacing.xl} color={colors.accentSuccess} />
          </View>
          <AppText variant="small" secondary style={styles.withdrawalLabel}>
            Available for Payout
          </AppText>
          <AppText variant="h1" style={styles.withdrawalValue}>
            ${(gems * 0.01).toFixed(2)}
          </AppText>
          <AppText variant="tiny" secondary style={styles.withdrawalSubtext}>
            Based on {gems} gems in your balance
          </AppText>
          <AppButton
            title="Request Withdrawal"
            variant="primary"
            onPress={onOpenWithdrawal}
            style={styles.fullWidthButton}
          />
        </LinearGradient>

        {withdrawalHistory.length > 0 ? (
          <View style={styles.historySection}>
            <View style={styles.sectionHeaderRow}>
              <AppText variant="h3">History</AppText>
              <Pressable onPress={onViewHistory} style={styles.historyAction}>
                <AppText variant="tiny" style={styles.historyActionText}>
                  View All
                </AppText>
              </Pressable>
            </View>

            {recentHistory.map((req) => (
              <HistoryItem key={req.id} request={req} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
});

type ExchangeRowProps = {
  row: ExchangeOption;
  canAfford: boolean;
  onExchange: () => void;
};

function ExchangeRow({ row, canAfford, onExchange }: ExchangeRowProps) {
  return (
    <View style={styles.exchangeRow}>
      <View style={styles.exchangeLeft}>
        <CurrencyAmount type={row.from} amount={row.fromAmount} />
        <Ionicons name="arrow-forward" size={spacing.lg} color={colors.textSecondary} />
        <CurrencyAmount type={row.to} amount={row.toAmount} />
      </View>

      <AppButton
        title={row.actionLabel}
        size="small"
        variant={canAfford ? 'primary' : 'outline'}
        disabled={!canAfford}
        onPress={onExchange}
        style={styles.exchangeButton}
      />
    </View>
  );
}

type CurrencyAmountProps = {
  type: ExchangeDirection;
  amount: number;
};

function CurrencyAmount({ type, amount }: CurrencyAmountProps) {
  return (
    <View style={styles.currencyWrapper}>
      {type === 'cash' ? (
        <CashIcon size={spacing.lg} color={colors.accentSuccess} />
      ) : (
        <Ionicons name="prism" size={spacing.lg} color={colors.accentPremium} />
      )}
      <AppText variant="small" style={styles.exchangeAmount}>
        {amount}
      </AppText>
    </View>
  );
}

type HistoryItemProps = {
  request: WithdrawalRequest;
};

function HistoryItem({ request }: HistoryItemProps) {
  const statusStyle = STATUS_STYLES[request.status] ?? STATUS_STYLES.pending;
  const statusLabel = request.status.toUpperCase();

  return (
    <View style={styles.historyItem}>
      <View style={styles.historyLeft}>
        <View style={[styles.historyIcon, { backgroundColor: statusStyle.iconBackground }]}> 
          <Ionicons
            name={request.method === 'PayPal' ? 'logo-paypal' : 'business'}
            size={spacing.md}
            color={statusStyle.textColor}
          />
        </View>
        <View>
          <AppText variant="small" style={styles.historyAmount}>
            -${request.amountRealMoney.toFixed(2)}
          </AppText>
          <AppText variant="tiny" secondary>
            {new Date(request.date).toLocaleDateString()}
          </AppText>
        </View>
      </View>

      <View style={[styles.statusBadge, { backgroundColor: statusStyle.backgroundColor }]}> 
        <AppText variant="tiny" style={[styles.statusText, { color: statusStyle.textColor }]}> 
          {statusLabel}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xl,
  },
  exchangeList: {
    gap: spacing.md,
  },
  exchangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  exchangeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  currencyWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: spacing.xxl * 2,
  },
  exchangeAmount: {
    fontWeight: '600',
  },
  exchangeButton: {
    minWidth: spacing.xxl + spacing.lg,
  },
  withdrawalSection: {
    gap: spacing.md,
  },
  sectionTitle: {
    marginTop: spacing.sm,
  },
  withdrawalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  withdrawalIconCircle: {
    width: spacing.xxl * 2,
    height: spacing.xxl * 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: `${colors.accentSuccess}20`,
  },
  withdrawalLabel: {
    marginBottom: spacing.xxs,
  },
  withdrawalValue: {
    color: colors.accentSuccess,
  },
  withdrawalSubtext: {
    marginBottom: spacing.lg,
  },
  fullWidthButton: {
    width: '100%',
  },
  historySection: {
    marginTop: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  historyAction: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  historyActionText: {
    color: colors.accentPrimary,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.sm,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  historyIcon: {
    width: spacing.xxl + spacing.sm,
    height: spacing.xxl + spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyAmount: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  statusText: {
    fontWeight: '700',
  },
});
