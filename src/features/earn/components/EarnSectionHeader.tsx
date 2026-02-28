import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../../components';
import { colors, spacing } from '../../../theme';

type EarnSectionHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
};

export const EarnSectionHeader = React.memo(function EarnSectionHeader({
  title,
  subtitle,
  badge,
}: EarnSectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textColumn}>
        <AppText variant="h2" style={styles.title}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" secondary style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {badge ? <View style={styles.badge}>{badge}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    marginBottom: spacing.xxs,
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
  },
  badge: {
    alignItems: 'flex-end',
  },
});
