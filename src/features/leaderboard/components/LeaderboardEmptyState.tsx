import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../../components';
import { colors, spacing } from '../../../theme';

type LeaderboardEmptyStateProps = {
  message?: string;
};

function LeaderboardEmptyStateComponent({ message = 'No users found' }: LeaderboardEmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="search-outline" size={48} color={colors.textMuted} />
      <AppText variant="body" muted style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

export const LeaderboardEmptyState = memo(LeaderboardEmptyStateComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
  },
  text: {
    marginTop: spacing.sm,
  },
});
