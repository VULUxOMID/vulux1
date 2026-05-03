import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, AppText } from '../../../components';
import { useLeaderboardRepo } from '../../../data/provider';
import { colors, radius, spacing } from '../../../theme';
import { HomePillCard } from './HomePillCard';

function formatCashAmount(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.max(0, Math.floor(value))}`;
}

export function LeaderboardHighlightsWidget() {
  const router = useRouter();
  const leaderboardRepo = useLeaderboardRepo();

  const leaderboardItems = useMemo(
    () =>
      [...leaderboardRepo.listLeaderboardItems({ limit: 12, includeCurrentUser: true })].sort(
        (a, b) => a.rank - b.rank,
      ),
    [leaderboardRepo],
  );

  const topItems = leaderboardItems.slice(0, 3);
  const currentUserRow = leaderboardItems.find((item) => item.isCurrentUser);
  const friendCount = leaderboardItems.filter((item) => item.isFriend).length;

  const rightContent = currentUserRow ? (
    <View style={styles.rankPill}>
      <AppText variant="small" style={styles.rankPillText}>
        #{currentUserRow.rank}
      </AppText>
    </View>
  ) : (
    <Ionicons name="trophy-outline" size={18} color={colors.textSecondary} />
  );

  return (
    <HomePillCard
      title="Leaderboard"
      leftIcon="trophy"
      leftIconBackground={colors.accentPrimary}
      onPress={() => router.push('/leaderboard')}
      rightContent={rightContent}
      showChevron={false}
      collapsedContent={
        topItems.length > 0 ? (
          <View style={styles.content}>
            <View style={styles.topRows}>
              {topItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push('/leaderboard')}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View style={styles.rankBadge}>
                    <AppText variant="small" style={styles.rankBadgeText}>
                      {item.rank}
                    </AppText>
                  </View>
                  <Avatar uri={item.avatarUrl} name={item.displayName || item.username} size="sm" />
                  <View style={styles.rowText}>
                    <AppText style={styles.displayName} numberOfLines={1}>
                      {item.displayName || item.username}
                    </AppText>
                    <AppText variant="small" secondary numberOfLines={1}>
                      @{item.username}
                    </AppText>
                  </View>
                  <AppText style={styles.cashText}>{formatCashAmount(item.cashAmount)}</AppText>
                </Pressable>
              ))}
            </View>

            <View style={styles.footer}>
              <AppText variant="small" secondary>
                {friendCount > 0
                  ? `${friendCount} friends are ranked right now`
                  : 'Top players are live on the board right now'}
              </AppText>
              <View style={styles.footerCta}>
                <AppText variant="small" style={styles.footerCtaText}>
                  Open board
                </AppText>
                <Ionicons name="arrow-forward" size={14} color={colors.accentPrimary} />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <AppText style={styles.emptyTitle}>No leaderboard rows yet</AppText>
            <AppText variant="small" secondary>
              Rankings will appear here once the public board has live data.
            </AppText>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
  },
  topRows: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowPressed: {
    opacity: 0.82,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  cashText: {
    color: colors.accentPrimary,
    fontWeight: '700',
  },
  footer: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  footerCtaText: {
    color: colors.accentPrimary,
    fontWeight: '700',
  },
  emptyState: {
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  rankPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  rankPillText: {
    color: colors.accentPrimary,
    fontWeight: '700',
  },
});
