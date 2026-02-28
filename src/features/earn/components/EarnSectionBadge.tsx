import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

type EarnSectionBadgeProps = {
  label?: string;
};

export const EarnSectionBadge = React.memo(function EarnSectionBadge({
  label = 'GROWTH',
}: EarnSectionBadgeProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="trending-up" size={12} color={colors.accentPremium} />
      <AppText variant="tiny" style={styles.label}>
        {label}
      </AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: `${colors.accentPremium}15`,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xsMinus,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${colors.accentPremium}30`,
    alignSelf: 'flex-start',
  },
  label: {
    color: colors.accentPremium,
    fontWeight: '700',
  },
});
