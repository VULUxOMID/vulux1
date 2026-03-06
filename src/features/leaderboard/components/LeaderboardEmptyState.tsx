import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../../components';
import { colors, spacing } from '../../../theme';

type LeaderboardEmptyStateProps = {
  iconName?: keyof typeof Ionicons.glyphMap;
  title?: string;
  message?: string;
  loading?: boolean;
};

function LeaderboardEmptyStateComponent({
  iconName = 'search-outline',
  title = 'No users found',
  message,
  loading = false,
}: LeaderboardEmptyStateProps) {
  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color={colors.accentPrimary} />
      ) : (
        <Ionicons name={iconName} size={48} color={colors.textMuted} />
      )}
      <AppText variant="bodyBold" style={styles.title}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="small" secondary style={styles.message}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

export const LeaderboardEmptyState = memo(LeaderboardEmptyStateComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  title: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  message: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
