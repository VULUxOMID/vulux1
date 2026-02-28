import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../theme';

/**
 * Skeleton loader for the ActivitiesRow component.
 * Displays placeholder items with shimmer animation while friends data is loading.
 */
export function ActivitiesRowSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.scrollContent}>
        <View style={styles.row}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonActivityItem key={i} delay={i * 100} />
          ))}
        </View>
      </View>
    </View>
  );
}

function SkeletonActivityItem({ delay = 0 }: { delay?: number }) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Stagger the animation start for a wave effect
    const timeout = setTimeout(() => {
      const animation = Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        })
      );
      animation.start();
      return () => animation.stop();
    }, delay);

    return () => clearTimeout(timeout);
  }, [shimmerAnim, delay]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  return (
    <View style={styles.itemContainer}>
      <View style={styles.avatarWrapper}>
        <View style={styles.avatarContainer}>
          {/* Shimmer Effect */}
          <Animated.View
            style={[
              styles.shimmer,
              { transform: [{ translateX }] },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.05)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shimmerGradient}
            />
          </Animated.View>
        </View>
      </View>
      
      {/* Name placeholder */}
      <View style={styles.namePlaceholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginHorizontal: -spacing.lg,
    zIndex: 1,
  },
  scrollContent: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  itemContainer: {
    alignItems: 'center',
    width: 72,
    gap: 4,
  },
  avatarWrapper: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 68,
    height: 68,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: colors.surfaceAlt,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  namePlaceholder: {
    height: 10,
    width: 48,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 5,
    marginTop: 2,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  shimmerGradient: {
    flex: 1,
    width: 100,
  },
});
