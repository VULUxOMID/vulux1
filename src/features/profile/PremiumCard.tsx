import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';

type PremiumCardProps = {
  isPremium?: boolean;
  planName?: string;
  onUpgradePress?: () => void;
  onSeePerksPress?: () => void;
};

export function PremiumCard({
  isPremium = false,
  planName = 'Premium',
  onUpgradePress,
  onSeePerksPress,
}: PremiumCardProps) {
  if (isPremium) {
    return (
      <View style={styles.activeContainer}>
        <LinearGradient
          colors={[colors.overlayRankGoldSubtle, colors.overlayRankGoldFaint]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="diamond" size={20} color={colors.accentPremium} />
              <AppText variant="h3" style={styles.planName}>{planName}</AppText>
            </View>
            <Pressable onPress={onSeePerksPress}>
              <AppText variant="small" style={styles.seePerks}>See all perks</AppText>
            </Pressable>
          </View>

          <AppText variant="small" secondary>
            You're enjoying all premium benefits!
          </AppText>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.overlayAccentPremiumSubtle, colors.overlayAccentPrimarySubtle]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="rocket" size={20} color={colors.accentPremium} />
            <AppText variant="h3" style={styles.premiumTitle}>Go Premium</AppText>
          </View>
          <Pressable onPress={onSeePerksPress}>
            <AppText variant="small" style={styles.seePerks}>See all perks</AppText>
          </Pressable>
        </View>

        <AppText style={styles.headline}>
          <AppText variant="bodyLarge" style={styles.highlightText}>Be first everywhere</AppText>
          <AppText variant="bodyLarge" style={styles.normalText}> for maximum matches</AppText>
        </AppText>

        <AppText variant="small" secondary style={styles.description}>
          Get unlimited swipes, priority matching, and exclusive features
        </AppText>

        <AppButton
          title="Upgrade"
          variant="premium"
          onPress={onUpgradePress || (() => {})}
          style={styles.upgradeButton}
        />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderAccentPremiumSubtle,
  },
  activeContainer: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderRankGoldSubtle,
  },
  gradient: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  planName: {
    color: colors.accentCash,
  },
  premiumTitle: {
    color: colors.accentPremium,
  },
  seePerks: {
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  headline: {
    marginBottom: spacing.xs,
  },
  highlightText: {
    color: colors.accentPremium,
  },
  normalText: {
    color: colors.textPrimary,
  },
  description: {
    marginBottom: spacing.lg,
  },
  upgradeButton: {
    width: '100%',
  },
});
