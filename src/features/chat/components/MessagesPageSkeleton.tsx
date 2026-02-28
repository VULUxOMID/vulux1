import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../theme';

/**
 * Skeleton loader for the Messages page.
 * Displays placeholder conversation items with shimmer animation while data is loading.
 */
export function MessagesPageSkeleton() {
  return (
    <View style={styles.container}>
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonConversationItem key={i} delay={i * 80} />
      ))}
    </View>
  );
}

function SkeletonConversationItem({ delay = 0 }: { delay?: number }) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startAnimation = () => {
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
    };

    startAnimation();
  }, [shimmerAnim, delay]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <View style={styles.itemContainer}>
      {/* Avatar */}
      <View style={styles.avatar}>
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

      {/* Content */}
      <View style={styles.content}>
        {/* Top row: name + time */}
        <View style={styles.topRow}>
          <View style={styles.namePlaceholder}>
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
          <View style={styles.timePlaceholder}>
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

        {/* Bottom row: message preview */}
        <View style={styles.messagePlaceholder}>
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
    flex: 1,
    paddingTop: spacing.md,
  },
  itemContainer: {
    flexDirection: 'row',
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  namePlaceholder: {
    width: 120,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  timePlaceholder: {
    width: 40,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  messagePlaceholder: {
    width: '80%',
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  shimmer: {
    width: '100%',
    height: '100%',
  },
});
