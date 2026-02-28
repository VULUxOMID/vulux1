import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../../components';
import { colors, spacing } from '../../../theme';

type LeaderboardTitleProps = {
  title?: string;
};

function LeaderboardTitleComponent({ title = 'Real-time Cash Ranking' }: LeaderboardTitleProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="trophy" size={24} color={colors.accentCash} />
      </View>
      <AppText variant="bodyBold">{title}</AppText>
    </View>
  );
}

export const LeaderboardTitle = memo(LeaderboardTitleComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    justifyContent: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentCashSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
