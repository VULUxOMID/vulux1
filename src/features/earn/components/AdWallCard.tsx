import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppButton, AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { EARN_AD_WALL_COOLDOWN_MS, formatEarnDuration } from '../earnState';

type AdWallCardProps = {
  rewardGems: number;
  claimCount: number;
  canClaim: boolean;
  remainingMs: number;
  loading: boolean;
  disabled?: boolean;
  onClaim: () => void;
};

export const AdWallCard = React.memo(function AdWallCard({
  rewardGems,
  claimCount,
  canClaim,
  remainingMs,
  loading,
  disabled = false,
  onClaim,
}: AdWallCardProps) {
  const progress = canClaim
    ? 1
    : Math.max(0, Math.min(1, 1 - remainingMs / EARN_AD_WALL_COOLDOWN_MS));
  const progressPercent = `${Math.round(progress * 100)}%` as `${number}%`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: canClaim ? colors.accentSuccess : colors.accentWarning },
            ]}
          />
          <AppText variant="bodyBold">AFK task</AppText>
        </View>
        <View style={styles.badge}>
          <Ionicons name="prism-outline" size={14} color={colors.accentPremium} />
          <AppText variant="tinyBold">{rewardGems} Gems</AppText>
        </View>
      </View>

      <View style={styles.preview}>
        <Ionicons name="play-circle-outline" size={30} color={colors.textMuted} />
        <AppText variant="small" secondary style={styles.previewText}>
          Server-backed reward task. Claim availability persists across reloads.
        </AppText>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: progressPercent }]} />
        </View>
        <AppText variant="tiny" secondary>
          {canClaim ? 'Ready now' : `Ready in ${formatEarnDuration(remainingMs)}`}
        </AppText>
      </View>

      <View style={styles.footer}>
        <View style={styles.metaColumn}>
          <AppText variant="tiny" secondary>
            Claims completed
          </AppText>
          <AppText variant="smallBold">{claimCount}</AppText>
        </View>
        <AppButton
          title={canClaim ? `Claim ${rewardGems} Gems` : 'Cooling down'}
          variant={canClaim ? 'premium' : 'outline'}
          onPress={onClaim}
          disabled={!canClaim || disabled}
          loading={loading}
          style={styles.button}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.full,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  preview: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    minHeight: 112,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  previewText: {
    textAlign: 'center',
  },
  progressRow: {
    gap: spacing.xs,
  },
  progressTrack: {
    height: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accentSuccess,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metaColumn: {
    flex: 1,
    gap: spacing.xxs,
  },
  button: {
    minWidth: 168,
  },
});
