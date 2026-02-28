import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { AppButton, AppText, CashIcon } from '../../components';
import { toast } from '../../components/Toast';
import { colors, radius, spacing } from '../../theme';

const AD_WALL_DURATION = 10000; // 10 seconds
const AD_WALL_REWARD = 10;
const VIDEO_AD_DURATION = 2000; // 2 seconds
const STREAK_STORAGE_KEY = '@vulu_watch_streak_opened';

const REWARDS = [
  { amount: 10, label: 'Starter' },
  { amount: 15, label: '1.5x' },
  { amount: 25, label: '2.5x' },
  { amount: 40, label: '4.0x' },
  { amount: 60, label: '6.0x' },
  { amount: 100, label: 'ULTRA' },
];

const AD_PLACEHOLDER_GRADIENT = [
  `${colors.textPrimary}05`,
  `${colors.textPrimary}0D`,
] as const;

const PROGRESS_GRADIENT = [colors.accentSuccess, `${colors.accentSuccess}80`] as const;

type ShopEarnTabProps = {
  onAddCash: (amount: number) => void;
};

export const ShopEarnTab = React.memo(function ShopEarnTab({ onAddCash }: ShopEarnTabProps) {
  const handleAdWallReward = useCallback(() => {
    onAddCash(AD_WALL_REWARD);
  }, [onAddCash]);

  const handleStreakReward = useCallback(
    (amount: number) => {
      onAddCash(amount);
    },
    [onAddCash]
  );

  return (
    <View style={styles.container}>
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color={colors.accentPrimary} />
        <AppText variant="small" secondary style={styles.infoText}>
          Earn free cash by watching ads. Use it to play games or save up for rewards!
        </AppText>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Ad Wall (AFK)"
          subtitle="Keep this screen open to earn cash passively."
        />
        <AdWallCard onReward={handleAdWallReward} />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Daily Rewards"
          subtitle="Earn rewards by watching videos!"
        />
        <RewardStreakCard onReward={handleStreakReward} />
      </View>
    </View>
  );
});

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
};

const SectionHeader = React.memo(function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="h2" style={styles.sectionTitle}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="small" secondary>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
});

type AdWallCardProps = {
  onReward: () => void;
};

const AdWallCard = React.memo(function AdWallCard({ onReward }: AdWallCardProps) {
  const [isActive, setIsActive] = useState(false);
  const [adId, setAdId] = useState(1);
  const [canClaim, setCanClaim] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!isActive) {
      glowAnim.setValue(0);
      return;
    }

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: false,
        }),
      ])
    );

    glowLoop.start();
    return () => glowLoop.stop();
  }, [glowAnim, isActive]);

  const startAnimation = useCallback(() => {
    progress.setValue(0);
    setCanClaim(false);

    animationRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: AD_WALL_DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    animationRef.current.start(({ finished }) => {
      if (finished) {
        setCanClaim(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    });
  }, [progress]);

  useEffect(() => {
    if (isActive && !canClaim) {
      startAnimation();
    } else if (!isActive) {
      animationRef.current?.stop();
      progress.setValue(0);
    }

    return () => animationRef.current?.stop();
  }, [canClaim, isActive, progress, startAnimation]);

  const handleClaim = useCallback(() => {
    onReward();
    setCanClaim(false);
    setAdId((prev) => prev + 1);
    if (isActive) {
      startAnimation();
    }
  }, [isActive, onReward, startAnimation]);

  const toggleSwitch = useCallback(() => {
    const nextState = !isActive;
    setIsActive(nextState);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!nextState) {
      setCanClaim(false);
    }
  }, [isActive]);

  const width = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
      }),
    [progress]
  );

  const glowBorder = useMemo(
    () =>
      glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.borderSubtle, colors.accentSuccess],
      }),
    [glowAnim]
  );

  return (
    <Animated.View style={[styles.adWallContainer, isActive && { borderColor: glowBorder }]}> 
      <View style={styles.adWallHeader}>
        <View style={styles.adWallTitleSection}>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: isActive ? colors.accentSuccess : colors.textMuted },
            ]}
          />
          <AppText variant="small" style={styles.adWallTitle}>
            AFK Session
          </AppText>
        </View>
        <Pressable
          onPress={toggleSwitch}
          style={[styles.toggleTrack, isActive && styles.toggleTrackActive]}
        >
          <View style={[styles.toggleThumb, isActive && styles.toggleThumbActive]} />
        </Pressable>
      </View>

      <View style={styles.adWallContent}>
        <LinearGradient colors={AD_PLACEHOLDER_GRADIENT} style={styles.adPlaceholder}>
          <Ionicons
            name="images-outline"
            size={24}
            color={colors.textMuted}
            style={styles.adPlaceholderIcon}
          />
          <AppText variant="small" muted>
            Sponsor Ad #{adId}
          </AppText>
          <AppText variant="tiny" muted style={styles.adPlaceholderSubtext}>
            Refreshes on claim
          </AppText>
        </LinearGradient>

        {isActive ? (
          <View style={styles.adWallAction}>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width }]}> 
                <LinearGradient
                  colors={PROGRESS_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.progressBarGradient}
                />
              </Animated.View>
            </View>

            {canClaim ? (
              <AppButton
                title={`Claim ${AD_WALL_REWARD} Cash`}
                variant="primary"
                onPress={handleClaim}
                style={styles.fullWidthButton}
              />
            ) : (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color={colors.accentPrimary} />
                <AppText variant="tiny" secondary>
                  Earning in progress...
                </AppText>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.idleState}>
            <AppText variant="small" secondary style={styles.idleText}>
              Toggle ON to start earning {AD_WALL_REWARD} Cash every 10 seconds.
            </AppText>
          </View>
        )}
      </View>
    </Animated.View>
  );
});

type RewardStreakCardProps = {
  onReward: (amount: number) => void;
};

const RewardStreakCard = React.memo(function RewardStreakCard({
  onReward,
}: RewardStreakCardProps) {
  const [openedBoxes, setOpenedBoxes] = useState<number[]>([]);
  const [loading, setLoading] = useState<number | null>(null);

  useEffect(() => {
    const loadStreak = async () => {
      try {
        const saved = await AsyncStorage.getItem(STREAK_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setOpenedBoxes(parsed);
          } else {
            setOpenedBoxes([]);
          }
        }
      } catch (error) {
        console.error('Failed to load streak', error);
        setOpenedBoxes([]);
      }
    };

    loadStreak();
  }, []);

  const handleOpenBox = useCallback(
    (boxIndex: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (loading !== null) return;
      if (openedBoxes.includes(boxIndex)) return;

      const nextBox = openedBoxes.length;
      if (boxIndex !== nextBox) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        toast.warning('Please unlock the rewards in order!');
        return;
      }

      setLoading(boxIndex);

      setTimeout(async () => {
        try {
          const reward = REWARDS[boxIndex].amount;
          const nextOpened = [...openedBoxes, boxIndex];
          setOpenedBoxes(nextOpened);
          await AsyncStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(nextOpened));
          onReward(reward);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          toast.success(`You earned ${reward} Cash!`);
        } catch (err) {
          console.error('[Streak] General error:', err);
          toast.error('Failed to process reward. Try again.');
        } finally {
          setLoading(null);
        }
      }, VIDEO_AD_DURATION);
    },
    [loading, onReward, openedBoxes]
  );

  return (
    <View style={styles.streakContainer}>
      <View style={styles.boxesGrid}>
        {REWARDS.map((reward, index) => {
          const isOpened = openedBoxes.includes(index);
          const isLoading = loading === index;
          const isNext = index === openedBoxes.length;
          const isLocked = index > openedBoxes.length;

          return (
            <Pressable
              key={reward.label}
              onPress={() => handleOpenBox(index)}
              style={({ pressed }) => [
                styles.calendarBox,
                isOpened && styles.boxOpened,
                isLoading && styles.boxLoading,
                isNext && styles.boxNext,
                isLocked && styles.boxLocked,
                pressed && styles.boxPressed,
              ]}
              hitSlop={spacing.lg}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.accentPremium} size="small" />
              ) : isOpened ? (
                <View style={styles.boxContent}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.accentSuccess} />
                  <AppText variant="tiny" style={styles.boxRewardText}>
                    +{reward.amount}
                  </AppText>
                </View>
              ) : (
                <View style={styles.boxContent}>
                  <View style={styles.iconCircle}>
                    <CashIcon
                      size={20}
                      color={isLocked ? colors.textMuted : colors.accentCash}
                    />
                  </View>
                  <AppText
                    variant="body"
                    style={[styles.rewardValueText, isLocked && styles.rewardValueTextLocked]}
                  >
                    {reward.amount}
                  </AppText>
                  <AppText
                    variant="tiny"
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

              {isLocked && !isLoading ? (
                <View style={styles.lockOverlay}>
                  <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.streakFooter}>
        {openedBoxes.length > 0 && openedBoxes.length < REWARDS.length ? (
          <AppText variant="small" secondary>
            Next reward:{' '}
            <AppText variant="small" style={styles.nextRewardText}>
              {REWARDS[openedBoxes.length].amount} Cash
            </AppText>
          </AppText>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xl,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.accentPrimary}40`,
  },
  infoText: {
    flex: 1,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  sectionTitle: {
    marginTop: spacing.xxs,
  },
  adWallContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  adWallHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  adWallTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  adWallTitle: {
    fontWeight: '700',
  },
  statusIndicator: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.full,
  },
  toggleTrack: {
    width: spacing.xxl + spacing.md,
    height: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.borderSubtle,
    padding: spacing.xxs,
  },
  toggleTrackActive: {
    backgroundColor: colors.accentSuccess,
  },
  toggleThumb: {
    width: spacing.lg + spacing.xs,
    height: spacing.lg + spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.textPrimary,
  },
  toggleThumbActive: {
    transform: [{ translateX: spacing.xl - spacing.xs }],
  },
  adWallContent: {
    padding: spacing.md,
    alignItems: 'center',
  },
  adWallAction: {
    width: '100%',
  },
  idleState: {
    paddingVertical: spacing.md,
  },
  idleText: {
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  adPlaceholder: {
    width: '100%',
    height: spacing.xl * 5,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderStyle: 'dashed',
  },
  adPlaceholderIcon: {
    marginBottom: spacing.xs,
  },
  adPlaceholderSubtext: {
    marginTop: spacing.xs,
  },
  progressBarBg: {
    width: '100%',
    height: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accentSuccess,
    borderRadius: radius.full,
  },
  progressBarGradient: {
    flex: 1,
  },
  fullWidthButton: {
    width: '100%',
    marginTop: spacing.md,
  },
  streakContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  boxesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  calendarBox: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  boxOpened: {
    backgroundColor: `${colors.accentSuccess}10`,
    borderColor: colors.accentSuccess,
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
  boxPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  boxContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
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
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rewardValueTextLocked: {
    color: colors.textMuted,
  },
  boxRewardText: {
    fontWeight: '700',
    color: colors.accentSuccess,
    marginTop: spacing.xxs,
  },
  boxLabelText: {
    textTransform: 'uppercase',
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
    top: spacing.xs,
    right: spacing.xs,
  },
  streakFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    alignItems: 'center',
  },
  nextRewardText: {
    color: colors.accentPremium,
    fontWeight: '700',
  },
});
