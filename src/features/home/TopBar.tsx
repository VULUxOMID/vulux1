import { useRouter } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, CashIcon } from '../../components';
import { hasAuthoritativeWallet } from '../../context/walletHydration';
import { colors, radius, spacing } from '../../theme';
import { useWallet } from '../../context';

type TopBarProps = {
  title?: string;
  actions?: React.ReactNode;
  variant?: 'hero' | 'page';
};

function DefaultTopActions() {
  const router = useRouter();
  const { fuel, cash, walletHydrated, walletStateAvailable } = useWallet();
  const showAuthoritativeWallet = hasAuthoritativeWallet(
    walletHydrated,
    walletStateAvailable,
  );

  const formatCash = (amount: number) => {
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}k`;
    }
    return amount.toString();
  };
  const cashLabel = showAuthoritativeWallet ? formatCash(cash) : '--';

  return (
    <View style={styles.metricGroup}>
      <Pressable style={styles.metricPill} onPress={() => router.push('/(tabs)/shop')}>
        <Ionicons name="flame" size={14} color="#F97316" />
        <AppText variant="tinyBold" style={styles.metricText}>
          {showAuthoritativeWallet ? fuel.toLocaleString() : '--'}
        </AppText>
      </Pressable>
      <Pressable style={styles.metricPill} onPress={() => router.push('/(tabs)/shop')}>
        <CashIcon size={14} color={colors.accentPrimary} />
        <AppText variant="tinyBold" style={styles.cashText}>
          ${cashLabel}
        </AppText>
      </Pressable>
    </View>
  );
}

export function TopBar({ title = 'Live', actions, variant = 'hero' }: TopBarProps) {
  const isHero = variant === 'hero';

  return (
    <View style={styles.topBar}>
      <AppText
        variant={isHero ? 'h1' : 'h2'}
        style={[styles.title, isHero ? styles.titleHero : styles.titlePage]}
      >
        {title}
      </AppText>
      <View style={styles.topActions}>
        {actions ?? <DefaultTopActions />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    letterSpacing: -1.2,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  titleHero: {
    textTransform: 'uppercase',
    fontSize: 44,
    lineHeight: 44,
  },
  titlePage: {
    textTransform: 'none',
    fontSize: 34,
    lineHeight: 36,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metricGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metricPill: {
    minHeight: 38,
    paddingHorizontal: spacing.mdPlus,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metricText: {
    color: colors.textPrimary,
  },
  cashText: {
    color: colors.accentPrimary,
  },
});
