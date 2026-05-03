import { View, StyleSheet, Image, ScrollView, Dimensions, Pressable, Animated } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../components';
import { colors, radius, spacing } from '../../theme';
import { hapticTap } from '../../utils/haptics';
import { useLive } from '../../context/LiveContext';
import { LiveSectionSkeleton } from './components/LiveSectionSkeleton';

export type HostUser = {
  id?: string;
  username?: string;
  name: string;
  age: number;
  country: string;
  bio: string;
  verified?: boolean;
  avatar: string;
};

export type LiveItem = {
  id: string;
  title: string;
  viewers: number;
  boosted?: boolean;
  images: string[];
  hosts: HostUser[];
};

export function LiveSection({ lives, loading = false }: { lives: LiveItem[]; loading?: boolean }) {
  const router = useRouter();

  // Sorting Logic:
  // 1. Boosted lives first
  // 2. Then by viewer count (descending) - assuming standard ranking behavior
  const sortedLives = [...lives].sort((a, b) => {
    if (a.boosted && !b.boosted) return -1;
    if (!a.boosted && b.boosted) return 1;
    return b.viewers - a.viewers;
  });

  const featured = sortedLives[0];
  const gridLives = sortedLives.slice(1);

  const { switchLiveRoom } = useLive();

  const handleOpenLive = (item: LiveItem) => {
    hapticTap();
    if (item.id.startsWith('preview-live-')) {
      return;
    }
    const didJoinLive = switchLiveRoom(item); // Set global state
    if (!didJoinLive) {
      return;
    }
    
    // We now rely on context for complex data, but passing ID is good practice
    router.push({
      pathname: '/live',
      params: { id: item.id }
    });
  };

  return (
    <View style={styles.liveSection}>
      <View style={styles.liveHeader}>
        <View style={styles.headerTitleRow}>
          <AppText variant="h3" style={styles.headerTitle}>Live now</AppText>
          <View style={styles.headerDot} />
        </View>
      </View>
      {loading ? (
        <LiveSectionSkeleton />
      ) : (
        <>
          {featured ? <FeaturedLiveCard item={featured} onPress={() => handleOpenLive(featured)} /> : null}
          <View style={styles.liveGrid}>
            {gridLives.map((item) => (
              <LiveGridCard key={item.id} item={item} onPress={() => handleOpenLive(item)} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function formatViewerCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

function LivePreviewGallery({ images, height, width }: { images: string[]; height: number; width: number }) {
  const safeImages = images.filter((image) => typeof image === 'string' && image.trim().length > 0);
  const count = safeImages.length;
  
  if (count === 0) return <View style={[styles.galleryContainer, { height, width, backgroundColor: '#333' }]} />;
  
  if (count === 1) {
    return (
      <View style={[styles.galleryContainer, { height, width }]}>
        <Image source={{ uri: safeImages[0] }} style={styles.galleryImage} resizeMode="cover" />
      </View>
    );
  }

  if (count === 2) {
    return (
      <View style={[styles.galleryContainer, { height, width, flexDirection: 'row' }]}>
        <Image source={{ uri: safeImages[0] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
        <View style={{ width: 1, backgroundColor: '#000' }} />
        <Image source={{ uri: safeImages[1] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
      </View>
    );
  }

  if (count === 3) {
    return (
      <View style={[styles.galleryContainer, { height, width }]}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Image source={{ uri: safeImages[0] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
          <View style={{ width: 1, backgroundColor: '#000' }} />
          <Image source={{ uri: safeImages[1] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
        </View>
        <View style={{ height: 1, backgroundColor: '#000' }} />
        <View style={{ flex: 1 }}>
          <Image source={{ uri: safeImages[2] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
      </View>
    );
  }

  if (count === 4) {
    return (
      <View style={[styles.galleryContainer, { height, width }]}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Image source={{ uri: safeImages[0] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
          <View style={{ width: 1, backgroundColor: '#000' }} />
          <Image source={{ uri: safeImages[1] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
        </View>
        <View style={{ height: 1, backgroundColor: '#000' }} />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Image source={{ uri: safeImages[2] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
          <View style={{ width: 1, backgroundColor: '#000' }} />
          <Image source={{ uri: safeImages[3] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
        </View>
      </View>
    );
  }

  // 5 images: Use 2-3 split for better balance (instead of 4-1)
  if (count === 5) {
    return (
      <View style={[styles.galleryContainer, { height, width }]}>
        {/* Top Row - 2 images */}
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <Image source={{ uri: safeImages[0] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
          </View>
          <View style={{ width: 1, backgroundColor: '#000' }} />
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <Image source={{ uri: safeImages[1] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
          </View>
        </View>
        
        <View style={{ height: 1, backgroundColor: '#000' }} />
        
        {/* Bottom Row - 3 images */}
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <Image source={{ uri: safeImages[2] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
          </View>
          <View style={{ width: 1, backgroundColor: '#000' }} />
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <Image source={{ uri: safeImages[3] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
          </View>
          <View style={{ width: 1, backgroundColor: '#000' }} />
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <Image source={{ uri: safeImages[4] }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
          </View>
        </View>
      </View>
    );
  }

  // 6 to 8 or more: 4x2 Grid (showing up to 8 images)
  const displayCount = Math.min(count, 8);
  const showOverlay = count > 8;
  const topRow = safeImages.slice(0, 4);
  const bottomRow = safeImages.slice(4, 8);

  return (
    <View style={[styles.galleryContainer, { height, width }]}>
      {/* Top Row */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {topRow.map((img, i) => (
          <View key={`top-${i}`} style={{ flex: 1, flexDirection: 'row' }}>
            <Image source={{ uri: img }} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
            {i < 3 && <View style={{ width: 1, backgroundColor: '#000' }} />}
          </View>
        ))}
        {/* Fill empty slots in top row if < 4 */}
        {topRow.length < 4 && Array(4 - topRow.length).fill(null).map((_, i) => (
          <View key={`top-empty-${i}`} style={{ flex: 1, backgroundColor: colors.surfaceAlt }} />
        ))}
      </View>
      
      <View style={{ height: 1, backgroundColor: '#000' }} />
      
      {/* Bottom Row */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {bottomRow.map((img, i) => (
          <View key={`bottom-${i}`} style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ flex: 1, height: '100%' }}>
              <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              {showOverlay && i === 3 && (
                <View style={styles.moreOverlay}>
                  <AppText style={styles.moreText}>+{count - 7}</AppText>
                </View>
              )}
            </View>
            {i < 3 && <View style={{ width: 1, backgroundColor: '#000' }} />}
          </View>
        ))}
        {/* Fill empty slots in bottom row if < 4 */}
        {bottomRow.length < 4 && Array(4 - bottomRow.length).fill(null).map((_, i) => (
          <View key={`bottom-empty-${i}`} style={{ flex: 1, backgroundColor: colors.surfaceAlt }} />
        ))}
      </View>
    </View>
  );
}

function BoostedLightning({ size }: { size: number }) {
  return (
    <Ionicons
      name="flash"
      size={size}
      color={colors.accentDanger}
    />
  );
}

function FeaturedLiveCard({ item, onPress }: { item: LiveItem; onPress: () => void }) {
  const displayImages = item.images.filter(
    (image) => typeof image === 'string' && image.trim().length > 0,
  );
  const host = item.hosts[0];
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (item.boosted) {
      const pulse = () => {
        Animated.sequence([
          Animated.timing(animatedValue, { toValue: 1, duration: 2000, useNativeDriver: false }),
          Animated.timing(animatedValue, { toValue: 0.3, duration: 2000, useNativeDriver: false }),
        ]).start(() => pulse());
      };
      pulse();
    }
  }, [item.boosted]);

  const borderColor = animatedValue.interpolate({
    inputRange: [0.3, 1],
    outputRange: ['rgba(255, 59, 48, 0.3)', colors.accentDanger],
  });

  const shadowOpacity = animatedValue.interpolate({
    inputRange: [0.3, 1],
    outputRange: [0.15, 0.5],
  });

  return (
    <Animated.View style={[
      styles.featuredCard,
      item.boosted && {
        borderColor: borderColor,
        shadowColor: colors.accentDanger,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: shadowOpacity,
        shadowRadius: 10,
      }
    ]}>
      <Pressable onPress={onPress}>
        <View style={styles.cardImageContainer}>
          <LivePreviewGallery images={displayImages} height={220} width={FEATURED_WIDTH} />
          <View style={styles.cardOverlay} />
          <View style={styles.cardTopBadges}>
            <View style={styles.liveBadge}>
              <View style={styles.liveBadgeDot} />
              <AppText variant="micro" style={styles.liveBadgeText}>LIVE</AppText>
            </View>
            <View style={styles.viewerPill}>
              <Ionicons name="eye-outline" size={12} color={colors.textPrimary} />
              <AppText variant="micro" style={styles.viewerPillText}>{formatViewerCount(item.viewers)}</AppText>
            </View>
          </View>
          <View style={styles.featuredContent}>
            <AppText style={styles.featuredTitle} numberOfLines={2}>{item.title}</AppText>
            <View style={styles.hostRow}>
              <View style={styles.hostAvatarWrap}>
                {host?.avatar ? <Image source={{ uri: host.avatar }} style={styles.hostAvatar} /> : null}
              </View>
              <AppText variant="tinyBold" style={styles.hostHandle}>
                @{(host?.username || host?.name || 'live').toLowerCase()}
              </AppText>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function LiveGridCard({ item, onPress }: { item: LiveItem; onPress: () => void }) {
  const displayImages = item.images.filter(
    (image) => typeof image === 'string' && image.trim().length > 0,
  );
  const host = item.hosts[0];
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (item.boosted) {
      const pulse = () => {
        Animated.sequence([
          Animated.timing(animatedValue, { toValue: 1, duration: 2000, useNativeDriver: false }),
          Animated.timing(animatedValue, { toValue: 0.3, duration: 2000, useNativeDriver: false }),
        ]).start(() => pulse());
      };
      pulse();
    }
  }, [item.boosted]);

  const borderColor = animatedValue.interpolate({
    inputRange: [0.3, 1],
    outputRange: ['rgba(255, 59, 48, 0.3)', colors.accentDanger],
  });

  const shadowOpacity = animatedValue.interpolate({
    inputRange: [0.3, 1],
    outputRange: [0.15, 0.5],
  });

  return (
    <Animated.View style={[
      styles.gridCard,
      item.boosted && {
        borderColor: borderColor,
        shadowColor: colors.accentDanger,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: shadowOpacity,
        shadowRadius: 10,
      }
    ]}>
      <Pressable onPress={onPress}>
        <View style={styles.cardImageContainer}>
          <LivePreviewGallery images={displayImages} height={160} width={CARD_WIDTH} />
          <View style={styles.cardOverlay} />
          <View style={styles.gridCardContent}>
            <View style={styles.gridBadgeRow}>
              <AppText variant="micro" style={styles.gridTag}>
                Live
              </AppText>
              <View style={styles.viewerMini}>
                <Ionicons name="eye-outline" size={10} color={colors.textPrimary} />
                <AppText variant="micro" style={styles.viewerPillText}>
                  {formatViewerCount(item.viewers)}
                </AppText>
              </View>
            </View>
            <View>
              <AppText style={styles.gridTitle} numberOfLines={1}>
                {item.title}
              </AppText>
              <AppText variant="micro" style={styles.gridHandle}>
                @{(host?.username || host?.name || 'live').toLowerCase()}
              </AppText>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const { width } = Dimensions.get('window');
const GRID_GAP = spacing.md;
const PADDING = spacing.lg * 2; 
const CARD_WIDTH = (width - (spacing.lg * 2) - GRID_GAP) / 2 - 1; 
const FEATURED_WIDTH = width - (spacing.lg * 2);

const styles = StyleSheet.create({
  liveSection: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  liveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    textTransform: 'uppercase',
  },
  headerDot: {
    width: 10,
    height: 10,
    backgroundColor: colors.accentDanger,
  },
  
  // Gallery
  galleryContainer: {
    backgroundColor: colors.surface,
    position: 'relative',
    overflow: 'hidden',
  },
  galleryScroll: {
    flex: 1,
  },
  gallerySlide: {
    height: '100%',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  paginationDots: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
  },

  // Grid Card
  liveGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  cardImageContainer: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  featuredCard: {
    width: FEATURED_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cardTopBadges: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
    borderWidth: 1,
    borderColor: colors.accentDanger,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  liveBadgeDot: {
    width: 6,
    height: 6,
    backgroundColor: colors.accentDanger,
  },
  liveBadgeText: {
    color: colors.accentDanger,
  },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.76)',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  viewerMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewerPillText: {
    color: colors.textPrimary,
  },
  featuredContent: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: spacing.sm,
  },
  featuredTitle: {
    fontWeight: '800',
    fontSize: 28,
    color: colors.textPrimary,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hostAvatarWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
  },
  hostAvatar: {
    width: '100%',
    height: '100%',
  },
  hostHandle: {
    color: colors.textOnDarkStrong,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  gridCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  gridCardContent: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    bottom: spacing.md,
    justifyContent: 'space-between',
  },
  gridBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridTag: {
    color: colors.accentDanger,
    textTransform: 'uppercase',
  },
  gridTitle: {
    fontWeight: '800',
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 16,
    letterSpacing: -0.3,
  },
  gridHandle: {
    color: colors.textOnDarkMuted,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  
  // Badges
  boostTagSmall: {
    backgroundColor: colors.accentDanger,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  boostTagText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
