import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { AppText, CashIcon } from '../../../components';
import { toast } from '../../../components/Toast';
import { colors, radius, spacing } from '../../../theme';
import {
  REWARDS,
  STREAK_FIRST_OPEN_KEY,
  STREAK_STORAGE_KEY,
  VIDEO_AD_DURATION,
} from '../constants';

const SCREEN_WIDTH = Dimensions.get('window').width;
const BOX_MARGIN = spacing.xs;
const BOX_SIZE = (SCREEN_WIDTH - spacing.lg * 4 - BOX_MARGIN * 6) / 3;

type RewardStreakCardProps = {
  onReward: (amount: number) => void;
};

export const RewardStreakCard = React.memo(function RewardStreakCard({
  onReward,
}: RewardStreakCardProps) {
  const [openedBoxes, setOpenedBoxes] = useState<number[]>([]);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);

  const checkDailyReset = useCallback(async () => {
    const now = Date.now();
    const firstBoxTime = await AsyncStorage.getItem(STREAK_FIRST_OPEN_KEY);

    if (firstBoxTime) {
      const firstTime = parseInt(firstBoxTime, 10);
      const resetTime = firstTime + 24 * 60 * 60 * 1000;

      if (now >= resetTime) {
        return true;
      }
    }

    return false;
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadStreak = async () => {
      try {
        const saved = await AsyncStorage.getItem(STREAK_STORAGE_KEY);
        const shouldReset = await checkDailyReset();

        if (shouldReset) {
          await AsyncStorage.removeItem(STREAK_STORAGE_KEY);
          await AsyncStorage.removeItem(STREAK_FIRST_OPEN_KEY);
          if (mounted) setOpenedBoxes([]);
          return;
        }

        if (saved && mounted) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setOpenedBoxes(parsed);
          }
        }
      } catch (e) {
        console.error('[Streak] Load Error:', e);
      }
    };

    loadStreak();
    return () => {
      mounted = false;
    };
  }, [checkDailyReset]);

  const handleBoxClick = useCallback(
    (index: number) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (e) {}

      if (loadingIndex !== null || openedBoxes.includes(index)) return;

      const nextExpected = openedBoxes.length;
      if (index !== nextExpected) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch (e) {}
        toast.warning('Please watch the videos in order!');
        return;
      }

      if (openedBoxes.length === 0) {
        AsyncStorage.setItem(STREAK_FIRST_OPEN_KEY, Date.now().toString());
      }

      setLoadingIndex(index);

      setTimeout(async () => {
        try {
          const reward = REWARDS[index].amount;
          const nextOpened = [...openedBoxes, index];
          setOpenedBoxes(nextOpened);
          await AsyncStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(nextOpened));

          onReward(reward);

          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {}
          toast.success(`You received ${reward} Cash!`);
        } catch (err) {
          console.error('[Streak] Process Error:', err);
          toast.error('Something went wrong while claiming your reward.');
        } finally {
          setLoadingIndex(null);
        }
      }, VIDEO_AD_DURATION);
    },
    [loadingIndex, onReward, openedBoxes],
  );

  const isComplete = openedBoxes.length === REWARDS.length;

  return (
    <View style={styles.container}>
      <View style={styles.boxesGrid}>
        {REWARDS.map((reward, index) => {
          const isOpened = openedBoxes.includes(index);
          const isLoading = loadingIndex === index;
          const isNext = index === openedBoxes.length;
          const isLocked = index > openedBoxes.length;

          return (
            <TouchableOpacity
              key={reward.label}
              activeOpacity={0.7}
              onPress={() => handleBoxClick(index)}
              delayPressIn={0}
              style={[
                styles.calendarBox,
                isOpened && styles.boxOpened,
                isLoading && styles.boxLoading,
                isNext && styles.boxNext,
                isLocked && styles.boxLocked,
              ]}
            >
              <View style={[styles.boxContent, styles.pointerEventsNone]}>
                {isLoading ? (
                  <ActivityIndicator color={colors.accentPremium} size="small" />
                ) : isOpened ? (
                  <View style={styles.boxContentCenter}>
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color={colors.accentSuccess}
                    />
                    <AppText variant="tinyBold" style={styles.boxRewardText}>
                      +{reward.amount}
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.boxContentCenter}>
                    <View style={styles.iconCircle}>
                      <CashIcon
                        size={20}
                        color={isLocked ? colors.textMuted : colors.accentCash}
                      />
                    </View>
                    <AppText
                      variant="bodyBold"
                      style={[styles.rewardValueText, isLocked && styles.rewardValueTextLocked]}
                    >
                      {reward.amount}
                    </AppText>
                    <AppText
                      variant="micro"
                      style={[
                        styles.boxLabelText,
                        isLocked && styles.boxLabelTextLocked,
                        isNext && styles.boxLabelTextNext,
                      ]}
                    >
                      {reward.label}
                    </AppText>
                  </View>
                )}
              </View>

              {isLocked && !isLoading ? (
                <View style={[styles.lockOverlay, styles.pointerEventsNone]}>
                  <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.streakFooter}>
        {isComplete ? (
          <View style={styles.footerContent}>
            <AppText variant="smallBold" style={styles.completionText}>
              Streak Complete! 🎉
            </AppText>
            <AppText variant="small" secondary style={styles.footerSubtext}>
              Resets automatically in 24 hours
            </AppText>
          </View>
        ) : (
          <View style={styles.footerContent}>
            {openedBoxes.length > 0 ? (
              <AppText variant="small" secondary style={styles.footerNextText}>
                Next:{' '}
                <AppText variant="small" style={styles.nextRewardText}>
                  {REWARDS[openedBoxes.length]?.amount} Cash
                </AppText>
              </AppText>
            ) : null}
            <AppText variant="tiny" secondary style={styles.footerSubtext}>
              Resets automatically 24 hours after start
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  pointerEventsNone: {
    pointerEvents: 'none',
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  boxesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginHorizontal: -BOX_MARGIN,
  },
  calendarBox: {
    width: BOX_SIZE,
    aspectRatio: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    margin: BOX_MARGIN,
  },
  boxOpened: {
    backgroundColor: `${colors.accentSuccess}10`,
    borderColor: colors.accentSuccess,
    borderStyle: 'solid',
  },
  boxLoading: {
    borderColor: colors.accentPremium,
    backgroundColor: `${colors.accentPremium}10`,
  },
  boxNext: {
    borderColor: colors.accentPremium,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
  },
  boxLocked: {
    opacity: 0.7,
    backgroundColor: colors.background,
    borderStyle: 'dashed',
  },
  boxContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxContentCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: spacing.xxl,
    height: spacing.xxl,
    borderRadius: radius.full,
    backgroundColor: `${colors.textPrimary}0D`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
  rewardValueText: {
    color: colors.textPrimary,
  },
  rewardValueTextLocked: {
    color: colors.textMuted,
  },
  boxRewardText: {
    color: colors.accentSuccess,
    marginTop: spacing.xxs,
  },
  boxLabelText: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  boxLabelTextLocked: {
    color: colors.textMuted,
  },
  boxLabelTextNext: {
    color: colors.accentPremium,
    fontWeight: '700',
  },
  lockOverlay: {
    position: 'absolute',
    top: spacing.smMinus,
    right: spacing.smMinus,
  },
  streakFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    alignItems: 'center',
  },
  footerContent: {
    width: '100%',
    alignItems: 'center',
  },
  completionText: {
    color: colors.accentSuccess,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  footerSubtext: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  footerNextText: {
    marginBottom: spacing.sm,
  },
  nextRewardText: {
    color: colors.accentPremium,
    fontWeight: '700',
  },
});
