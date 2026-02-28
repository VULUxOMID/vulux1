import React from 'react';
import { StyleSheet, View, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { AppText } from '../../components';
import { useMusicCatalogRepo } from '../../data/provider';
import { colors, radius, spacing } from '../../theme';
import { useMemo } from 'react';

function hasImageUri(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function MusicWidget() {
  const router = useRouter();
  const musicCatalogRepo = useMusicCatalogRepo();
  const tracks = useMemo(() => musicCatalogRepo.listTracks({ limit: 120 }), [musicCatalogRepo]);
  const currentTrack = tracks[0];

  const handleHistoryPress = () => {
    router.push('/music-history');
  };

  return (
    <LinearGradient
      colors={[colors.surfaceAlt, colors.surface]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconSpoke}>
            <Ionicons name="musical-notes" size={16} color={colors.accentPrimary} />
          </View>
          <AppText variant="h2" style={styles.sectionTitleText}>Listening To</AppText>
        </View>
        <Pressable onPress={handleHistoryPress} style={({ pressed }) => [
          styles.historyButton,
          pressed && styles.historyButtonPressed
        ]}>
          <AppText variant="tinyBold" secondary>History</AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Now Playing Card */}
      <View style={styles.nowPlayingWrapper}>
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.05)', 'rgba(0, 0, 0, 0.2)']}
          style={styles.nowPlayingGradient}
        >
          <View style={styles.artworkContainer}>
            {hasImageUri(currentTrack?.artwork) ? (
              <Image source={{ uri: currentTrack.artwork }} style={styles.artwork} />
            ) : (
              <LinearGradient
                colors={[colors.surfaceAlt, colors.surface]}
                style={[styles.artwork, styles.artworkFallback]}
              >
                <Ionicons name="musical-note" size={24} color={colors.textMuted} />
              </LinearGradient>
            )}
            <View style={styles.artworkGlow} />
          </View>

          <View style={styles.trackInfo}>
            <AppText variant="h3" numberOfLines={1} style={styles.trackTitle}>
              {currentTrack?.title || 'No track playing'}
            </AppText>
            <AppText variant="body" secondary numberOfLines={1}>
              {currentTrack?.artist || '—'}
            </AppText>
          </View>
        </LinearGradient>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
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
  iconSpoke: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentPrimarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleText: {
    letterSpacing: 0.5,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  historyButtonPressed: {
    backgroundColor: colors.surface,
  },
  nowPlayingWrapper: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  nowPlayingGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  artworkContainer: {
    position: 'relative',
    width: 64,
    height: 64,
  },
  artwork: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    zIndex: 2,
  },
  artworkFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  artworkGlow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: -4,
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.md,
    filter: 'blur(10px)',
    opacity: 0.3,
    zIndex: 1,
  },
  trackInfo: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  trackTitle: {
    letterSpacing: 0.5,
  },
});
