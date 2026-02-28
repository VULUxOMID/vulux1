import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Image, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Video } from '../../../context/VideoContext';
import { colors, spacing, typography } from '../../../theme';

const { width } = Dimensions.get('window');
const HEIGHT = 450;

interface HeroCarouselProps {
  video: Video | null;
}

export const HeroCarousel: React.FC<HeroCarouselProps> = ({ video }) => {
  const router = useRouter();
  const scrollX = useRef(new Animated.Value(0)).current;

  if (!video) return null;

  const handlePress = () => {
    router.push({
      pathname: '/video/[id]',
      params: { id: video.id }
    } as any);
  };

  return (
    <Pressable onPress={handlePress} style={styles.container}>
      <Image 
        source={{ uri: video.thumbnailUrl }} 
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      
      <LinearGradient
        colors={['transparent', 'rgba(20, 21, 27, 0.4)', colors.background]}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{video.category}</Text>
            </View>
            {video.isLocked && (
               <View style={styles.premiumBadge}>
                 <Ionicons name="star" size={10} color="#000" />
                 <Text style={styles.premiumText}>PREMIUM</Text>
               </View>
            )}
          </View>
          
          <Text style={styles.title} numberOfLines={2}>{video.title}</Text>
          
          <View style={styles.creatorRow}>
            <Image 
              source={{ uri: video.creatorAvatar }} 
              style={styles.avatar} 
            />
            <Text style={styles.creatorName}>{video.creatorName}</Text>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.playButton} onPress={handlePress}>
              <Ionicons name="play" size={24} color="#000" />
              <Text style={styles.playText}>Watch Now</Text>
            </Pressable>
            
            <Pressable style={styles.listButton}>
              <Ionicons name="add" size={24} color={colors.textPrimary} />
              <Text style={styles.listText}>My List</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width,
    height: HEIGHT,
    backgroundColor: colors.surface,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  content: {
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  categoryText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.accentWarning,
    borderRadius: 4,
    gap: 4,
  },
  premiumText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.textPrimary,
  },
  creatorName: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    gap: spacing.sm,
  },
  playText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  listButton: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  listText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: '600',
  },
});
