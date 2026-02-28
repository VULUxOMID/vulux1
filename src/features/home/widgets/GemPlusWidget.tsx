import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, StyleSheet, View, Pressable } from 'react-native';

import { AppButton, AppText } from '../../../components';
import { toast } from '../../../components/Toast';
import { colors, radius, spacing } from '../../../theme';
import { HomePillCard } from './HomePillCard';

import { useWallet } from '../../../context';

export const GemPlusWidget = React.memo(({
  isSubscriber = true,
  autoRenew = true,
  currentStreak,
  daysRemaining,
  weeklyRewards,
  onSubscribe,
  onCancelSubscription,
  onResumeSubscription,
  onBuyGems,
  variant = 'default'
}: {
  isSubscriber?: boolean;
  autoRenew?: boolean;
  currentStreak?: number;
  daysRemaining?: number;
  weeklyRewards?: number[];
  onSubscribe?: () => void;
  onCancelSubscription?: () => void;
  onResumeSubscription?: () => void;
  onBuyGems?: () => void;
  variant?: 'default' | 'shop';
}) => {
  const [expanded, setExpanded] = useState(false);
  const { fuel: balance } = useWallet();
  const hasBalance = balance > 0;
  const isLowFuel = balance < 20;
  const streakWeek = Math.max(0, currentStreak ?? 0);
  const renewalDays = Math.max(0, daysRemaining ?? 0);
  const rewards = weeklyRewards ?? [];
  const nextReward = rewards[streakWeek] || rewards[rewards.length - 1] || 0;
  const offerGemsTotal = rewards.reduce((sum, reward) => sum + reward, 0);

  // Pulse animation for gem icon
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (pulseLoopRef.current) {
      pulseLoopRef.current.stop();
      pulseLoopRef.current = null;
    }

    if (hasBalance && !expanded) {
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoopRef.current.start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }

    return () => {
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
        pulseLoopRef.current = null;
      }
    };
  }, [hasBalance, expanded]);

  const toggle = () => {
    setExpanded((v) => !v);
  };

  const handleSubscribePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSubscribe?.();
  };

  const handleCancelPress = () => {
    Alert.alert(
      'Cancel Subscription?',
      'Are you sure you want to cancel? You will lose your streak and upcoming rewards after your current period ends.',
      [
        {
          text: 'Keep Subscription',
          style: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => {
            onCancelSubscription?.();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const handleResumePress = () => {
    onResumeSubscription?.();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast.success('Your subscription auto-renew has been turned back on.');
  };

  const renderRightContent = React.useCallback(() => {
    // If in Shop mode and NOT subscribed, show the Subscribe button instead of balance
    if (variant === 'shop' && !isSubscriber) {
      return (
        <View style={styles.shopSubscribeContainer}>
          <View style={styles.shopOfferRow}>
            <Ionicons name="prism" size={14} color={colors.accentPremium} />
            <AppText variant="small" style={styles.shopOfferText}>
              {offerGemsTotal > 0 ? `${offerGemsTotal} Gems` : 'Gem rewards'}
            </AppText>
          </View>
          <AppButton
            title="Subscribe"
            variant="premium"
            size="small"
            onPress={handleSubscribePress}
            style={styles.shopSubscribeButton}
            accessibilityLabel="Subscribe to Gem Plus"
          />
        </View>
      );
    }

    // Shop mode AND Subscribed: Show Renewal/Expiry Info
    if (variant === 'shop' && isSubscriber) {
      return (
        <View style={styles.renewalHeaderContainer}>
          <AppText variant="tiny" style={styles.renewalLabel}>
            {autoRenew ? 'Renews in' : 'Ends in'}
          </AppText>
          <AppText variant="small" style={styles.renewalValue}>{renewalDays} days</AppText>
        </View>
      );
    }

    // Default behavior (Home mode): Show balance
    if (variant === 'shop') {
      return null;
    }

    return (
      <View style={styles.gemBalanceRow}>
        <AppText variant="body" style={styles.gemBalanceText}>
          {balance}
        </AppText>
        <Ionicons
          name="prism"
          size={18}
          color={colors.accentPremium}
          style={styles.gemBalanceIcon}
        />
      </View>
    );
  }, [variant, isSubscriber, autoRenew, renewalDays, balance, handleSubscribePress, offerGemsTotal]);

  const titleSuffix = React.useMemo(() => isSubscriber ? (
    <View style={styles.activeBadge}>
      <AppText style={styles.activeBadgeText}>Active</AppText>
    </View>
  ) : (
    <View style={styles.inactiveBadge}>
      <AppText style={styles.inactiveBadgeText}>Inactive</AppText>
    </View>
  ), [isSubscriber]);

  const streakPathContent = React.useMemo(() => (
    <View style={styles.streakPath}>
      {rewards.map((reward, index) => {
        const isPast = index < streakWeek - 1;
        const isCurrent = index === streakWeek - 1;
        const isFuture = index > streakWeek - 1;
        const isLast = index === rewards.length - 1;
        const lineIsPast = index < streakWeek - 1;

        return (
          <React.Fragment key={index}>
            {/* Step Node (Circle + Text) */}
            <View style={styles.stepWrapper}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  toast.info(`Week ${index + 1}: Log in to claim ${reward} gems!`);
                }}
                style={[
                  styles.streakCircle,
                  isPast && styles.streakPast,
                  isCurrent && styles.streakCurrent,
                  isFuture && styles.streakFuture,
                ]}
              >
                {isCurrent && (
                  <Ionicons
                    name="flame"
                    size={14}
                    color={colors.accentPremium}
                  />
                )}
                {isPast && (
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color="#fff"
                  />
                )}
              </Pressable>
              <View style={styles.rewardTextWrapper}>
                <AppText
                  variant="tiny"
                  style={[
                    styles.streakReward,
                    isPast && styles.streakRewardPast,
                    isCurrent && styles.streakRewardCurrent,
                  ]}
                >
                  {reward}
                </AppText>
              </View>
            </View>

            {/* Connecting Line */}
            {!isLast && (
              <View
                style={[
                  styles.streakLine,
                  lineIsPast && styles.streakLinePast,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  ), [rewards, streakWeek]);

  return (
    <HomePillCard
      title="GEM+"
      onPress={toggle}
      expanded={expanded}
      rightContent={renderRightContent()}
      titleSuffix={titleSuffix}
      style={[styles.cardContainer, isLowFuel && styles.lowFuelBorder]}
      headerHeight={variant === 'shop' ? 84 : undefined}
    >
      <View style={styles.gemDetails}>
        {/* Low Fuel Warning */}
        {isSubscriber && isLowFuel && variant !== 'shop' && (
          <View style={styles.warningRow}>
            <Ionicons name="warning" size={12} color={colors.accentWarning} />
            <AppText variant="tiny" style={styles.warningText}>
              Low fuel - fuel up the tank
            </AppText>
          </View>
        )}

        {/* Content based on subscription status */}
        {isSubscriber ? (
          <View style={styles.streakSection}>
            <View style={styles.streakHeader}>
              <View style={styles.streakTitleRow}>
                <Ionicons name="flame" size={16} color={colors.accentPremium} />
                <AppText variant="small" style={styles.streakTitle}>
                  Week {streakWeek} Streak
                </AppText>
                {renewalDays < 3 && variant !== 'shop' && (
                  <View style={styles.expiryWarning}>
                    <AppText variant="tiny" style={styles.expiryWarningText}>
                      {autoRenew ? 'Renews' : 'Ends'} in {renewalDays}d
                    </AppText>
                  </View>
                )}
              </View>
              <AppText variant="tiny" secondary>
                Rewards claimed automatically!
              </AppText>
            </View>

            {streakPathContent}

            {/* Streak Progress Bar */}
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBack}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${rewards.length ? (streakWeek / rewards.length) * 100 : 0}%` }
                  ]}
                />
              </View>
            </View>

            {nextReward > 0 && (
              <AppText variant="tiny" secondary style={styles.nextRewardText}>
                Next week: {nextReward} gems
              </AppText>
            )}
          </View>
        ) : (
          // Unsubscribed State
          <View style={styles.unsubscribedContainer}>
            <AppText variant="body" style={styles.unsubscribedText}>
              {offerGemsTotal > 0
                ? `Unlock ${offerGemsTotal} free gems every week and build your streak!`
                : 'Unlock weekly gems and build your streak!'}
            </AppText>
            {variant !== 'shop' && (
              <AppButton
                title="Subscribe Now"
                variant="premium"
                size="small"
                onPress={handleSubscribePress}
                style={{ width: '100%' }}
                accessibilityLabel="Subscribe to Gem Plus"
              />
            )}
          </View>
        )}

        {/* Actions */}
        {isSubscriber && (
          <View style={styles.actionRow}>
            {variant === 'shop' ? (
              autoRenew ? (
                <AppButton
                  title="Cancel Subscription"
                  variant="secondary"
                  size="small"
                  style={styles.cancelButton}
                  onPress={handleCancelPress}
                />
              ) : (
                <AppButton
                  title="Resume Subscription"
                  variant="premium"
                  size="small"
                  style={{ flex: 1 }}
                  onPress={handleResumePress}
                />
              )
            ) : (
              <AppButton
                title={isLowFuel ? "Refuel Now" : "Buy Gems"}
                variant="premium"
                size="small"
                style={{ flex: 1 }}
                onPress={onBuyGems || (() => { })}
              />
            )}
          </View>
        )}
      </View>
    </HomePillCard>
  );
});

const styles = StyleSheet.create({
  cardContainer: {
    borderColor: 'rgba(190, 56, 243, 0.3)',
    borderWidth: 1,
    shadowColor: colors.accentPremium,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  renewalHeaderContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  renewalLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  renewalValue: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  cancelButton: {
    flex: 1,
    borderColor: colors.borderSubtle,
    opacity: 0.8,
  },
  lowFuelBorder: {
    borderColor: colors.accentDanger,
    shadowColor: colors.accentDanger,
    shadowOpacity: 0.2,
  },
  inactiveBadge: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  inactiveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  activeBadge: {
    backgroundColor: colors.accentPremium,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    shadowColor: colors.accentPremium,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  gemBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  gemBalanceIcon: {
    // Removed glow effect
  },
  gemBalanceText: {
    fontWeight: '700',
    fontSize: 15,
    color: colors.accentPremium,
    textShadowColor: 'rgba(190, 56, 243, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  gemDetails: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
  },
  warningText: {
    color: colors.accentWarning,
    fontSize: 10,
  },
  streakSection: {
    width: '100%',
    gap: spacing.sm,
  },
  streakHeader: {
    alignItems: 'center',
    gap: 4,
  },
  streakTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakTitle: {
    color: colors.accentPremium,
    fontWeight: '700',
  },
  streakPath: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingBottom: 30, // Ensure enough space for absolute text
  },
  stepWrapper: {
    width: 32,
    alignItems: 'center',
    zIndex: 2, // Ensure circles are above lines
  },
  rewardTextWrapper: {
    position: 'absolute',
    top: 38,
    width: 60,
    left: -14,
    alignItems: 'center',
  },
  streakLine: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    marginTop: 14.5, // Vertically center with 32px circle: (32/2) - (3/2) = 14.5
    marginHorizontal: -1, // Slight overlap to prevent visual gaps
    zIndex: 1,
  },
  streakLinePast: {
    backgroundColor: colors.accentPremium,
    shadowColor: colors.accentPremium,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  streakCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  streakPast: {
    backgroundColor: colors.accentPremium,
    borderColor: colors.accentPremium,
  },
  streakCurrent: {
    backgroundColor: 'rgba(190, 56, 243, 0.2)',
    borderColor: colors.accentPremium,
    shadowColor: colors.accentPremium,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  streakFuture: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  streakReward: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  streakRewardPast: {
    color: colors.textSecondary,
  },
  streakRewardCurrent: {
    color: colors.accentPremium,
    fontWeight: '700',
  },
  nextRewardText: {
    textAlign: 'center',
    opacity: 0.7,
  },
  unsubscribedContainer: {
    width: '100%',
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  shopSubscribeContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  shopOfferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  shopOfferText: {
    color: colors.accentPremium,
    fontWeight: '800',
    fontSize: 14,
  },
  shopSubscribeButton: {
    minWidth: 100,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    shadowColor: colors.accentPremium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  nextRewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(190, 56, 243, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(190, 56, 243, 0.3)',
  },
  nextRewardBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentPremium,
  },
  unsubscribedText: {
    textAlign: 'center',
    marginBottom: spacing.md,
    color: colors.textSecondary,
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
  },
  expiryWarning: {
    backgroundColor: 'rgba(190, 56, 243, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    marginLeft: 'auto',
  },
  expiryWarningText: {
    color: colors.accentPremium,
    fontWeight: '700',
    fontSize: 10,
  },
  progressBarContainer: {
    paddingHorizontal: spacing.xs,
    paddingTop: 4,
    paddingBottom: spacing.sm,
  },
  progressBarBack: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.1)', // Darker than surfaceAlt for visibility
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accentPremium,
    borderRadius: 2,
  },
});
