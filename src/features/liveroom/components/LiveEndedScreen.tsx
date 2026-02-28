import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { hapticTap } from '../../../utils/haptics';

type LiveEndedScreenProps = {
  onClose: () => void;
  hostName?: string;
  totalViewers?: number;
  totalBoosts?: number;
  duration?: string;
};

export function LiveEndedScreen({
  onClose,
  hostName = 'Host',
  totalViewers = 0,
  totalBoosts = 0,
  duration = '0m',
}: LiveEndedScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Background overlay */}
      <View style={styles.overlay} />

      {/* Content */}
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconCircle}>
          <Ionicons name="videocam-off" size={48} color={colors.textMuted} />
        </View>

        {/* Title */}
        <AppText style={styles.title}>Live Ended</AppText>
        <AppText style={styles.subtitle}>
          {hostName}'s live has ended
        </AppText>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="eye-outline" size={20} color={colors.textSecondary} />
            <AppText style={styles.statValue}>{totalViewers}</AppText>
            <AppText style={styles.statLabel}>Viewers</AppText>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <Ionicons name="flash" size={20} color={colors.textSecondary} />
            <AppText style={styles.statValue}>{totalBoosts}</AppText>
            <AppText style={styles.statLabel}>Boosts</AppText>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
            <AppText style={styles.statValue}>{duration}</AppText>
            <AppText style={styles.statLabel}>Duration</AppText>
          </View>
        </View>

        {/* Close Button */}
        <Pressable
          style={styles.closeButton}
          onPress={() => {
            hapticTap();
            onClose();
          }}
        >
          <AppText style={styles.closeButtonText}>Close</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.borderSubtle,
  },
  closeButton: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl * 2,
    borderRadius: radius.xl,
  },
  closeButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
});
