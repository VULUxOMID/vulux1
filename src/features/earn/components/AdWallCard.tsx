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
import * as Haptics from 'expo-haptics';

import { AppButton, AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { AD_WALL_DURATION, AD_WALL_REWARD } from '../constants';

type AdWallCardProps = {
  onReward: () => void;
};

export const AdWallCard = React.memo(function AdWallCard({ onReward }: AdWallCardProps) {
  const [isActive, setIsActive] = useState(false);
  const [adId, setAdId] = useState(1);
  const [canClaim, setCanClaim] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

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
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {}
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
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
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
    [progress],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: isActive ? colors.accentSuccess : colors.textMuted },
            ]}
          />
          <AppText variant="bodyBold">AFK Session</AppText>
        </View>
        <Pressable
          onPress={toggleSwitch}
          style={[styles.toggleTrack, isActive && styles.toggleTrackActive]}
        >
          <View style={[styles.toggleThumb, isActive && styles.toggleThumbActive]} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.adPlaceholder}>
          <Ionicons
            name="images-outline"
            size={32}
            color={colors.textMuted}
            style={styles.adPlaceholderIcon}
          />
          <AppText variant="small" muted>
            Sponsor Ad #{adId}
          </AppText>
          <AppText variant="tiny" muted style={styles.adPlaceholderSubtext}>
            Refreshes on claim
          </AppText>
        </View>

        {isActive ? (
          <View style={styles.adWallAction}>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width }]} />
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
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  content: {
    padding: spacing.md,
    alignItems: 'center',
  },
  adWallAction: {
    width: '100%',
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
    opacity: 0.6,
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
  fullWidthButton: {
    width: '100%',
    marginTop: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  idleState: {
    paddingVertical: spacing.md,
  },
  idleText: {
    textAlign: 'center',
  },
});
