import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, CurrencyPill } from '../../components';
import { hasAuthoritativeWallet } from '../../context/walletHydration';
import { colors, spacing } from '../../theme';
import { useWallet } from '../../context';
import { FuelGauge } from '../liveroom/components/FuelGauge';

type TopBarProps = {
  title?: string;
  actions?: React.ReactNode;
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

  return (
    <>
      <FuelGauge
        fuelMinutes={fuel}
        labelOverride={showAuthoritativeWallet ? undefined : '--'}
        onPress={() => router.push('/(tabs)/shop')}
      />
      <CurrencyPill
        icon="cash"
        label={showAuthoritativeWallet ? formatCash(cash) : '--'}
        color={colors.accentSuccess}
        onPress={() => router.push('/(tabs)/shop')}
        showDot
      />
    </>
  );
}

export function TopBar({ title = 'Live', actions }: TopBarProps) {
  return (
    <View style={styles.topBar}>
      <AppText variant="h1">{title}</AppText>
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
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
