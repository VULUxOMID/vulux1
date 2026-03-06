import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { formatEarnDuration, type EarnSnapshot } from '../earnState';

type RewardStreakCardProps = {
  rewards: EarnSnapshot['streak']['rewards'];
  claimedCount: number;
  nextRewardAmount: number | null;
  cycleExpiresAtMs: number | null;
  remainingMs: number;
  loadingIndex: number | null;
  disabled?: boolean;
  onClaim: (rewardIndex: number) => void;
};

export const RewardStreakCard = React.memo(function RewardStreakCard({
  rewards,
  claimedCount,
  nextRewardAmount,
  cycleExpiresAtMs,
  remainingMs,
  loadingIndex,
  disabled = false,
  onClaim,
}: RewardStreakCardProps) {
  const isComplete = claimedCount >= rewards.length;
  const footerLabel = isComplete
    ? cycleExpiresAtMs
      ? `Cycle resets in ${formatEarnDuration(remainingMs)}`
      : 'Cycle complete'
    : nextRewardAmount
      ? `Next reward: ${nextRewardAmount} Gems`
      : 'Claim the next unlocked reward';

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {rewards.map((reward) => {
          const isClaimed = reward.status === 'claimed';
          const isReady = reward.status === 'ready' && !disabled;
          const isLoading = loadingIndex === reward.index;

          return (
            <TouchableOpacity
              key={`${reward.label}-${reward.index}`}
              activeOpacity={0.85}
              onPress={() => onClaim(reward.index)}
              disabled={!isReady || isLoading}
              style={[
                styles.rewardBox,
                isClaimed && styles.rewardBoxClaimed,
                reward.status === 'ready' && styles.rewardBoxReady,
                reward.status === 'locked' && styles.rewardBoxLocked,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.accentPremium} />
              ) : isClaimed ? (
                <>
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.accentSuccess}
                  />
                  <AppText variant="tinyBold" style={styles.claimedValue}>
                    +{reward.amount}
                  </AppText>
                </>
              ) : (
                <>
                  <View style={styles.rewardIconWrap}>
                    <Ionicons
                      name={reward.status === 'ready' ? 'gift-outline' : 'lock-closed-outline'}
                      size={18}
                      color={
                        reward.status === 'ready'
                          ? colors.accentPremium
                          : colors.textMuted
                      }
                    />
                  </View>
                  <AppText
                    variant="bodyBold"
                    style={reward.status === 'locked' ? styles.lockedValue : undefined}
                  >
                    {reward.amount}
                  </AppText>
                  <AppText
                    variant="micro"
                    style={[
                      styles.rewardLabel,
                      reward.status === 'ready' && styles.readyLabel,
                      reward.status === 'locked' && styles.lockedLabel,
                    ]}
                  >
                    {reward.label}
                  </AppText>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerCopy}>
          <AppText variant="smallBold">
            {isComplete ? 'Streak complete' : `${claimedCount}/${rewards.length} claimed`}
          </AppText>
          <AppText variant="tiny" secondary>
            {footerLabel}
          </AppText>
        </View>
        {cycleExpiresAtMs ? (
          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
            <AppText variant="tiny" secondary>
              {formatEarnDuration(remainingMs)}
            </AppText>
          </View>
        ) : null}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rewardBox: {
    width: '30.5%',
    minWidth: 92,
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  rewardBoxClaimed: {
    borderColor: colors.accentSuccess,
    backgroundColor: `${colors.accentSuccess}12`,
  },
  rewardBoxReady: {
    borderColor: colors.accentPremium,
    backgroundColor: `${colors.accentPremium}10`,
  },
  rewardBoxLocked: {
    opacity: 0.72,
    borderStyle: 'dashed',
  },
  rewardIconWrap: {
    width: spacing.xxl,
    height: spacing.xxl,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.textPrimary}0D`,
  },
  rewardLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.textMuted,
  },
  readyLabel: {
    color: colors.accentPremium,
  },
  lockedLabel: {
    color: colors.textMuted,
  },
  lockedValue: {
    color: colors.textMuted,
  },
  claimedValue: {
    color: colors.accentSuccess,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footerCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
});
