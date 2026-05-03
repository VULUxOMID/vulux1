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
  const usernameLabel = item.username.trim().length > 0 ? `@${item.username}` : 'Open profile';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        item.isCurrentUser && styles.currentUser,
        pressed && styles.pressed,
      ]}
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
        <View style={styles.titleRow}>
          <AppText variant="bodyBold" numberOfLines={1} style={styles.displayName}>
            {item.displayName || item.username || item.id}
          </AppText>
          {item.isCurrentUser ? (
            <View style={[styles.tag, styles.currentUserTag]}>
              <AppText variant="tinyBold" style={styles.currentUserTagText}>
                YOU
              </AppText>
            </View>
          ) : null}
          {item.isFriend ? (
            <View style={styles.tag}>
              <AppText variant="tinyBold" style={styles.tagText}>
                FRIEND
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="small" secondary numberOfLines={1}>
          {usernameLabel}
        </AppText>
      </View>

      <View style={styles.trailingColumn}>
        <View style={styles.cashPill}>
          <CashIcon size={14} color={colors.accentCash} />
          <AppText variant="smallBold" style={styles.cashCount}>
            {formattedCash}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
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
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.88,
  },
  currentUser: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.accentPrimarySubtle,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  avatarFallback: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  infoContainer: {
    flex: 1,
    gap: spacing.xxs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  displayName: {
    flexShrink: 1,
  },
  tag: {
    paddingHorizontal: spacing.xsPlus,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  currentUserTag: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  tagText: {
    color: colors.textSecondary,
  },
  currentUserTagText: {
    color: colors.textPrimary,
  },
  trailingColumn: {
    alignItems: 'flex-end',
    gap: spacing.xs,
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
