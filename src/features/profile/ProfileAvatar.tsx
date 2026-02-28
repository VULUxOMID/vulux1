import React from 'react';
import { Image, StyleSheet, View, Pressable, type PressableStateCallbackType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';
import type { PresenceStatus } from '../../context/UserProfileContext';
import { normalizeImageUri } from '../../utils/imageSource';

type ProfileAvatarProps = {
  imageUri?: string;
  name: string;
  onPress?: () => void;
  status?: PresenceStatus;
  statusMessage?: string;
  onStatusPress?: () => void;
};

const STATUS_CONFIG: Record<PresenceStatus, { label: string; color: string }> = {
  online: { label: 'Online', color: colors.accentSuccess },
  busy: { label: 'Busy', color: colors.accentDanger },
  offline: { label: 'Offline', color: colors.textMuted },
};

export function ProfileAvatar({
  imageUri,
  name,
  onPress,
  status,
  statusMessage,
  onStatusPress,
}: ProfileAvatarProps) {
  const avatarUri = normalizeImageUri(imageUri);
  const statusConfig = status ? STATUS_CONFIG[status] : null;
  const statusLabel = statusMessage?.trim() || statusConfig?.label;

  return (
    <View style={styles.container}>
      <View style={styles.avatarWrapper}>
        <LinearGradient
          colors={[colors.accentPremium, colors.accentPrimary]}
          style={styles.gradientRing}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Pressable onPress={onPress} style={({ pressed }: PressableStateCallbackType) => [
            styles.avatarContainer,
            { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
          ]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarImage, styles.avatarPlaceholder]} />
            )}
          </Pressable>
        </LinearGradient>

        <Pressable onPress={onPress} style={styles.floatingEditBtn}>
          <LinearGradient
            colors={[colors.surfaceAlt, colors.surface]}
            style={styles.floatingEditGradient}
          >
            <Ionicons name="pencil" size={14} color={colors.textPrimary} />
          </LinearGradient>
        </Pressable>
      </View>

      <AppText variant="h1" style={styles.name}>{name}</AppText>

      {statusConfig ? (
        <Pressable
          onPress={onStatusPress}
          style={({ pressed }) => [
            styles.statusPill,
            pressed && styles.statusPillPressed,
          ]}
        >
          <View
            style={[styles.statusDot, { backgroundColor: statusConfig.color }]}
          />
          <AppText variant="smallBold" style={styles.statusLabel}>
            {statusLabel}
          </AppText>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: spacing.xs,
  },
  gradientRing: {
    padding: 3,
    borderRadius: 75, // larger than avatar
  },
  avatarContainer: {
    width: 130,
    height: 130,
    borderRadius: 65,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 4,
    borderColor: colors.background,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 65,
  },
  avatarPlaceholder: {
    backgroundColor: colors.surfaceAlt,
  },
  floatingEditBtn: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingEditGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  name: {
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  statusPillPressed: {
    backgroundColor: colors.surface,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    color: colors.textPrimary,
  },
});
