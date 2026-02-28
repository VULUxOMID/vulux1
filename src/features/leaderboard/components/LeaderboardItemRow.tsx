import React, { memo, useCallback, useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText, CashIcon } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import type { LeaderboardItem } from '../types';
import { formatCash, getRankColor, getRankTextColor } from '../utils';
import { normalizeImageUri } from '../../../utils/imageSource';

type LeaderboardItemRowProps = {
  item: LeaderboardItem;
  onPress: (item: LeaderboardItem) => void;
};

function LeaderboardItemRowComponent({ item, onPress }: LeaderboardItemRowProps) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  const rankColors = useMemo(
    () => ({
      background: getRankColor(item.rank),
      text: getRankTextColor(item.rank),
    }),
    [item.rank],
  );

  const formattedCash = useMemo(() => formatCash(item.cashAmount), [item.cashAmount]);
  const avatarUri = normalizeImageUri(item.avatarUrl);

  return (
    <Pressable
      style={[styles.container, item.isCurrentUser && styles.currentUser]}
      onPress={handlePress}
    >
      <View style={[styles.rankBadge, { backgroundColor: rankColors.background }]}>
        <AppText variant="smallBold" style={{ color: rankColors.text }}>
          {item.rank}
        </AppText>
      </View>

      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]} />
      )}

      <View style={styles.infoContainer}>
        <AppText variant="bodyBold" numberOfLines={1} style={styles.displayName}>
          {item.displayName}
        </AppText>
        <AppText variant="small" secondary numberOfLines={1}>
          @{item.username}
        </AppText>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.cashPill}>
          <CashIcon size={14} color={colors.accentCash} />
          <AppText variant="smallBold" style={styles.cashCount}>
            {formattedCash}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

export const LeaderboardItemRow = memo(LeaderboardItemRowComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  currentUser: {
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    backgroundColor: colors.accentPrimarySubtle,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    marginRight: spacing.md,
    backgroundColor: colors.surface,
  },
  avatarFallback: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  infoContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  displayName: {
    marginBottom: spacing.xxs,
  },
  statsContainer: {
    alignItems: 'flex-end',
  },
  cashPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentCashSubtle,
    paddingHorizontal: spacing.smPlus,
    paddingVertical: spacing.xsPlus,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  cashCount: {
    color: colors.accentCash,
  },
});
