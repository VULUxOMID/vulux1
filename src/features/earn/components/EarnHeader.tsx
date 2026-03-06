import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, CurrencyPill } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

type EarnHeaderProps = {
  gemsLabel: string;
  cashLabel: string;
  onBack: () => void;
};

export const EarnHeader = React.memo(function EarnHeader({
  gemsLabel,
  cashLabel,
  onBack,
}: EarnHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}> 
      <View style={styles.headerLeft}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="h1">Earn</AppText>
      </View>
      <View style={styles.balanceContainer}>
        <CurrencyPill
          icon="prism"
          label={gemsLabel}
          color={colors.accentPremium}
          style={styles.balancePill}
        />
        <CurrencyPill
          icon="cash"
          label={cashLabel}
          color={colors.accentCash}
          style={styles.balancePill}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  balanceContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  balancePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
});
