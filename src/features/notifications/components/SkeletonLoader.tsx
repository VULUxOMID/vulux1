import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export function NotificationPageSkeleton() {
  return (
    <View style={styles.pageContainer}>
      {/* Simulate Section Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitle} />
      </View>
      
      {/* Simulate Items */}
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonNotificationRow key={i} />
      ))}
    </View>
  );
}

export function SkeletonNotificationRow() {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-300, 300],
  });

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={styles.avatar} />
      </View>
      
      <View style={styles.content}>
        <View style={styles.textRow}>
          <View style={styles.titleLine} />
          <View style={styles.timeLine} />
        </View>
        <View style={styles.subtitleLine} />
      </View>

      {/* Shimmer Effect */}
      <Animated.View
        style={[
          styles.shimmer,
          { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.03)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.shimmerGradient}
        />
      </Animated.View>
    </View>
  );
}

export function SkeletonWidget() {
  // ... existing code for SkeletonWidget if needed elsewhere ...
  // Keeping it brief or reusing the animation logic if preferred, 
  // but for now focusing on NotificationRow replacement.
  return null; 
}

const styles = StyleSheet.create({
  pageContainer: {
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    height: 14,
    width: 100,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xs,
  },
  container: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: 'transparent', // Match NotificationItem container bg
    marginHorizontal: spacing.sm,
    marginBottom: 2,
    overflow: 'hidden', // For shimmer
  },
  left: {
    marginRight: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    gap: 8,
  },
  textRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleLine: {
    height: 14,
    width: '60%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xs,
  },
  timeLine: {
    height: 12,
    width: 40,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xs,
  },
  subtitleLine: {
    height: 12,
    width: '80%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xs,
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
    width: 300,
  },
  // Legacy styles needed if SkeletonWidget is kept or referenced
  widgetContainer: { /* ... */ },
  widgetHeader: { /* ... */ },
  widgetTitleContainer: { /* ... */ },
  widgetIcon: { /* ... */ },
  widgetTitle: { /* ... */ },
  widgetBadge: { /* ... */ },
});

