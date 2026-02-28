import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

const { width } = Dimensions.get('window');
const GRID_GAP = spacing.md;
const CARD_WIDTH = (width - (spacing.lg * 2) - GRID_GAP) / 2 - 1;
const FEATURED_WIDTH = width - (spacing.lg * 2);

/**
 * Skeleton loader for the LiveSection component.
 * Displays placeholder cards with shimmer animation while live streams are loading.
 */
export function LiveSectionSkeleton() {
  return (
    <View style={styles.container}>
      {/* Featured Card Skeleton */}
      <SkeletonFeaturedCard delay={0} />
      
      {/* Grid Cards Skeleton */}
      <View style={styles.grid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonGridCard key={i} delay={(i + 1) * 100} />
        ))}
      </View>
    </View>
  );
}

function SkeletonFeaturedCard({ delay = 0 }: { delay?: number }) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
          delay,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [shimmerAnim, delay]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-FEATURED_WIDTH, FEATURED_WIDTH],
  });

  return (
    <View style={styles.featuredCard}>
      {/* Image area */}
      <View style={styles.featuredImage}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX }], overflow: 'hidden' },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.shimmer}
          />
        </Animated.View>
      </View>
      
      {/* Footer */}
      <View style={styles.featuredFooter}>
        <View style={styles.titlePlaceholder}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ translateX }], overflow: 'hidden' },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.shimmer}
            />
          </Animated.View>
        </View>
        <View style={styles.viewerPlaceholder}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ translateX }], overflow: 'hidden' },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.shimmer}
            />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

function SkeletonGridCard({ delay = 0 }: { delay?: number }) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
          delay,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [shimmerAnim, delay]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-CARD_WIDTH, CARD_WIDTH],
  });

  return (
    <View style={styles.gridCard}>
      {/* Image area */}
      <View style={styles.gridImage}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX }], overflow: 'hidden' },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.shimmer}
          />
        </Animated.View>
      </View>
      
      {/* Footer */}
      <View style={styles.gridFooter}>
        <View style={styles.gridTitlePlaceholder}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ translateX }], overflow: 'hidden' },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.shimmer}
            />
          </Animated.View>
        </View>
        <View style={styles.gridViewerPlaceholder}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ translateX }], overflow: 'hidden' },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.shimmer}
            />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  shimmer: {
    width: '100%',
    height: '100%',
  },
  
  // Featured card
  featuredCard: {
    width: FEATURED_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: 32,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  featuredImage: {
    width: '100%',
    height: 220,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  featuredFooter: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  titlePlaceholder: {
    width: '70%',
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  viewerPlaceholder: {
    width: 60,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  
  // Grid card
  gridCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  gridImage: {
    width: '100%',
    height: 160,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  gridFooter: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  gridTitlePlaceholder: {
    width: '80%',
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  gridViewerPlaceholder: {
    width: 50,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
});
