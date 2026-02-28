import React from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Video } from '../../../context/VideoContext';
import { colors, spacing, typography } from '../../../theme';

interface VideoCardProps {
  video: Video;
  width?: number;
  height?: number;
  showCreator?: boolean;
  showTags?: boolean;
  variant?: 'standard' | 'poster';
}

export const VideoCard: React.FC<VideoCardProps> = ({ 
  video, 
  width = 280, 
  height = 160,
  showCreator = true,
  showTags = true,
  variant = 'standard'
}) => {
  const router = useRouter();

  const handlePress = () => {
    router.push({
      pathname: '/video/[id]',
      params: { id: video.id }
    } as any);
  };

  if (variant === 'poster') {
    return (
      <View style={{ width, marginRight: spacing.md }}>
        <Pressable 
          onPress={handlePress}
          style={({ pressed }) => [
            styles.posterContainer,
            pressed && styles.pressed
          ]}
        >
          <Image 
            source={{ uri: video.thumbnailUrl }} 
            style={[styles.posterImage, { height }]}
            resizeMode="cover"
          />
          {video.isLocked ? (
             <View style={styles.posterLockOverlay}>
               <Ionicons name="lock-closed" size={16} color="#FFF" />
             </View>
          ) : null}
        </Pressable>
        <Text style={styles.posterTitle} numberOfLines={2}>
          {video.title}
        </Text>
      </View>
    );
  }

  return (
    <Pressable 
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { width },
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.thumbnailContainer, { height }]}>
        <Image 
          source={{ uri: video.thumbnailUrl }} 
          style={styles.thumbnail}
          resizeMode="cover"
        />
        
        {/* Premium/Lock Overlay */}
        {video.isLocked ? (
          <BlurView intensity={20} tint="dark" style={styles.lockOverlay}>
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={12} color="#000" />
              <Text style={styles.priceText}>
                {video.currency === 'cash' && video.price > 0
                  ? `${video.price} Cash`
                  : 'Locked'}
              </Text>
            </View>
          </BlurView>
        ) : null}

        {/* Duration/Episodes Badge */}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{getBadgeText(video)}</Text>
        </View>
      </View>

      <View style={styles.infoContainer}>
        {showCreator && (
          <Image 
            source={{ uri: video.creatorAvatar }} 
            style={styles.creatorAvatar}
          />
        )}
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {video.title}
          </Text>
          <View style={styles.metaRow}>
            {showCreator ? (
              <>
                <Text style={styles.creatorName} numberOfLines={1}>
                  {video.creatorName}
                </Text>
                <Text style={styles.metaDivider}>•</Text>
              </>
            ) : null}
            <Text style={styles.metaText} numberOfLines={1}>
              {formatMeta(video)}
            </Text>
          </View>
          {showTags && video.tags.length > 0 ? (
            <View style={styles.tagsRow}>
              {video.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {video.isLocked && video.currency === 'cash' && video.price > 0 ? (
            <Text style={styles.unlockText}>Unlock for {video.price} Cash</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

// Helpers
function getFallbackDuration(id: string): string {
  if (!id) return '14:20';
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const minutes = (hash % 15) + 1;
  const seconds = hash % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getBadgeText(video: Video): string {
  if (video.contentType === 'show') {
    const seasons = video.seasons ?? 1;
    const episodes = video.episodes ?? 0;
    return episodes > 0 ? `${seasons}S • ${episodes}E` : `${seasons} Seasons`;
  }

  return video.duration || getFallbackDuration(video.id);
}

function formatMeta(video: Video): string {
  if (video.contentType === 'show') {
    const seasons = video.seasons ?? 1;
    const episodes = video.episodes ?? 0;
    if (episodes > 0) {
      return `${seasons} Seasons • ${episodes} Episodes`;
    }
    return `${seasons} Seasons`;
  }

  return video.duration || getFallbackDuration(video.id);
}

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.md,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  thumbnailContainer: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.xs,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentWarning,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  priceText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '600',
  },
  infoContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  creatorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  creatorName: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  metaDivider: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  tagChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  tagText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  unlockText: {
    color: colors.accentSuccess,
    fontSize: 12,
    fontWeight: '700',
  },
  posterContainer: {
    marginRight: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  posterImage: {
    width: '100%',
    borderRadius: 16,
  },
  posterLockOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    borderRadius: 4,
  },
  posterTitle: {
    ...typography.tinyBold,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 14,
  },
});
