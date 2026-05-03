import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppButton, AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';

type LeaderboardEmptyStateProps = {
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
};

function LeaderboardEmptyStateComponent({
  title,
  message,
  icon = 'search-outline',
  actionLabel,
  onAction,
  loading = false,
}: LeaderboardEmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.accentPrimary} />
        ) : (
          <Ionicons name={icon} size={22} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.copy}>
        <AppText variant="bodyBold">{title}</AppText>
        <AppText variant="small" secondary style={styles.text}>
          {message}
        </AppText>
      </View>
      {actionLabel && onAction ? (
        <AppButton title={actionLabel} size="small" variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
}

export const LeaderboardEmptyState = memo(LeaderboardEmptyStateComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  copy: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  text: {
    textAlign: 'center',
  },
});
