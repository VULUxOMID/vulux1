import React, { memo, useCallback, useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  const showFriendBadge = Boolean(item.isFriend) && !item.isCurrentUser;

  return (
    <Pressable
      style={[styles.container, item.isCurrentUser && styles.currentUser]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Open leaderboard profile for ${item.displayName}`}
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
        <View style={styles.metaRow}>
          {item.isCurrentUser ? (
            <View style={[styles.metaBadge, styles.selfBadge]}>
              <AppText variant="micro" style={styles.selfBadgeText}>
                YOU
              </AppText>
            </View>
          ) : null}
          {showFriendBadge ? (
            <View style={[styles.metaBadge, styles.friendBadge]}>
              <AppText variant="micro" style={styles.friendBadgeText}>
                FRIEND
              </AppText>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.cashPill}>
          <CashIcon size={14} color={colors.accentCash} />
          <AppText variant="smallBold" style={styles.cashCount}>
            {formattedCash}
          </AppText>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textMuted}
          style={styles.chevron}
        />
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
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  currentUser: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.accentPrimarySubtle,
  },
  rankBadge: {
    width: 32,
    height: 32,
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
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  metaBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  selfBadge: {
    backgroundColor: colors.accentPrimary,
  },
  selfBadgeText: {
    color: colors.textOnLight,
  },
  friendBadge: {
    backgroundColor: colors.overlayRankGoldSubtle,
    borderWidth: 1,
    borderColor: colors.borderRankGoldSubtle,
  },
  friendBadgeText: {
    color: colors.accentRankGold,
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
  chevron: {
    marginTop: spacing.sm,
  },
});
