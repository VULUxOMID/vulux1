import React, { memo, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText, PillTabs } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { LeaderboardSearchBar } from './LeaderboardSearchBar';

type LeaderboardScope = 'all' | 'friends' | 'me';
type LeaderboardStatusTone = 'loading' | 'reconnect' | 'info' | null;

type LeaderboardListHeaderProps = {
  rankedCount: number;
  friendRankedCount: number;
  currentRank: number | null;
  scope: LeaderboardScope;
  onScopeChange: (value: LeaderboardScope) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  statusTone: LeaderboardStatusTone;
  statusTitle: string;
  statusMessage: string;
};

function formatRank(value: number | null): string {
  if (!value || value <= 0) {
    return '--';
  }
  return `#${value}`;
}

function LeaderboardListHeaderComponent({
  rankedCount,
  friendRankedCount,
  currentRank,
  scope,
  onScopeChange,
  searchValue,
  onSearchChange,
  onClearSearch,
  statusTone,
  statusTitle,
  statusMessage,
}: LeaderboardListHeaderProps) {
  const scopeItems = useMemo(
    () => [
      { key: 'all', label: 'All', icon: 'trophy-outline' as const },
      { key: 'friends', label: 'Friends', icon: 'people-outline' as const },
      { key: 'me', label: 'Me', icon: 'person-outline' as const },
    ],
    [],
  );

  const statusMeta = useMemo(() => {
    switch (statusTone) {
      case 'loading':
        return {
          borderColor: colors.accentPrimarySubtle,
          icon: 'sync-outline' as keyof typeof Ionicons.glyphMap,
          iconColor: colors.accentPrimary,
          backgroundColor: colors.surfaceAlt,
          loading: true,
        };
      case 'reconnect':
        return {
          borderColor: colors.overlayAccentDangerSubtle,
          icon: 'refresh-circle-outline' as keyof typeof Ionicons.glyphMap,
          iconColor: colors.accentWarning,
          backgroundColor: colors.surfaceAlt,
          loading: false,
        };
      case 'info':
        return {
          borderColor: colors.borderSubtle,
          icon: 'information-circle-outline' as keyof typeof Ionicons.glyphMap,
          iconColor: colors.textSecondary,
          backgroundColor: colors.surfaceAlt,
          loading: false,
        };
      default:
        return null;
    }
  }, [statusTone]);

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroCopy}>
            <AppText variant="micro" style={styles.eyebrow}>
              LEADERBOARD
            </AppText>
            <AppText variant="h1">Ranking that stays drillable</AppText>
            <AppText variant="small" secondary>
              Realtime cash ranking with scope filters and direct profile drill-in from each row.
            </AppText>
          </View>
          <View style={styles.heroIconWrap}>
            <Ionicons name="trophy" size={24} color={colors.accentWarning} />
          </View>
        </View>

        <View style={styles.statsRow}>
          <LeaderboardStatCard label="Ranked" value={`${rankedCount}`} />
          <LeaderboardStatCard label="Friends" value={`${friendRankedCount}`} />
          <LeaderboardStatCard label="Your rank" value={formatRank(currentRank)} accent />
        </View>
      </View>

      <LeaderboardSearchBar
        value={searchValue}
        onChangeText={onSearchChange}
        onClear={onClearSearch}
      />

      <PillTabs
        items={scopeItems}
        value={scope}
        onChange={(value) => onScopeChange(value as LeaderboardScope)}
        style={styles.scopeTabs}
      />

      {statusMeta && statusTitle && statusMessage ? (
        <View style={[
          styles.statusBanner,
          {
            borderColor: statusMeta.borderColor,
            backgroundColor: statusMeta.backgroundColor,
          },
        ]}>
          <View style={styles.statusIconWrap}>
            {statusMeta.loading ? (
              <ActivityIndicator size="small" color={statusMeta.iconColor} />
            ) : (
              <Ionicons name={statusMeta.icon} size={18} color={statusMeta.iconColor} />
            )}
          </View>
          <View style={styles.statusCopy}>
            <AppText variant="smallBold">{statusTitle}</AppText>
            <AppText variant="small" secondary>
              {statusMessage}
            </AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function LeaderboardStatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <AppText variant="micro" style={[styles.statLabel, accent && styles.statLabelAccent]}>
        {label}
      </AppText>
      <AppText variant="bodyBold" style={accent ? styles.statValueAccent : undefined}>
        {value}
      </AppText>
    </View>
  );
}

export const LeaderboardListHeader = memo(LeaderboardListHeaderComponent);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.accentPrimary,
    letterSpacing: 1.2,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayRankGoldSubtle,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  statCardAccent: {
    borderColor: colors.accentPrimarySubtle,
    backgroundColor: colors.surfaceAlt,
  },
  statLabel: {
    color: colors.textMuted,
  },
  statLabelAccent: {
    color: colors.accentPrimary,
  },
  statValueAccent: {
    color: colors.accentPrimary,
  },
  scopeTabs: {
    paddingHorizontal: spacing.xs,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  statusIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  statusCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
});
