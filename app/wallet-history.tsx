import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { AppScreen, AppText } from '../src/components';
import { useWallet } from '../src/context';
import { colors, radius, spacing } from '../src/theme';

const STATUS_STYLES = {
  completed: {
    backgroundColor: `${colors.accentSuccess}1A`,
    textColor: colors.accentSuccess,
  },
  processing: {
    backgroundColor: `${colors.accentWarning}1A`,
    textColor: colors.accentWarning,
  },
  pending: {
    backgroundColor: `${colors.accentWarning}1A`,
    textColor: colors.accentWarning,
  },
  declined: {
    backgroundColor: `${colors.accentDanger}1A`,
    textColor: colors.accentDanger,
  },
} as const;

export default function WalletHistoryScreen() {
  const router = useRouter();
  const { withdrawalHistory } = useWallet();

  const historyItems = useMemo(
    () =>
      [...withdrawalHistory].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [withdrawalHistory]
  );

  return (
    <AppScreen noPadding style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <AppText style={styles.headerTitle}>Wallet History</AppText>
        <View style={styles.headerSpacer} />
      </View>

      {historyItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={42} color={colors.textMuted} />
          <AppText style={styles.emptyTitle}>No transactions yet</AppText>
          <AppText style={styles.emptySubtitle}>
            Your withdrawal history will appear here.
          </AppText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {historyItems.map((item) => {
            const statusStyle = STATUS_STYLES[item.status] ?? STATUS_STYLES.pending;
            return (
              <View key={item.id} style={styles.row}>
                <View style={styles.rowLeft}>
                  <View style={styles.iconWrap}>
                    <Ionicons
                      name={item.method === 'PayPal' ? 'logo-paypal' : 'business'}
                      size={18}
                      color={statusStyle.textColor}
                    />
                  </View>
                  <View style={styles.rowInfo}>
                    <AppText style={styles.amountText}>-${item.amountRealMoney.toFixed(2)}</AppText>
                    <AppText variant="tiny" secondary>
                      {new Date(item.date).toLocaleString()}
                    </AppText>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.backgroundColor }]}>
                  <AppText variant="tiny" style={[styles.statusText, { color: statusStyle.textColor }]}>
                    {item.status.toUpperCase()}
                  </AppText>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 34,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  amountText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusText: {
    fontWeight: '700',
  },
});
