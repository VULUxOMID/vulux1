import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { hapticTap } from '../../../utils/haptics';
import { getFuelDisplayCapacity, MAX_FUEL_MINUTES } from '../types';

// Premium purple color
const FUEL_PURPLE = colors.accentPremium;
const FUEL_PURPLE_DARK = '#8B2CC0';

type FuelGaugeProps = {
  fuelMinutes: number; // current fuel units (drains by 1 every second)
  maxFuel?: number;
  isDraining?: boolean; // true when in live
  labelOverride?: string;
  onPress?: () => void;
};

export function FuelGauge({
  fuelMinutes,
  maxFuel = getFuelDisplayCapacity(fuelMinutes),
  isDraining = false,
  labelOverride,
  onPress,
}: FuelGaugeProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fillAnim = useRef(new Animated.Value(fuelMinutes / maxFuel)).current;
  const drainPulse = useRef(new Animated.Value(0)).current;

  // Animate fill level changes
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: fuelMinutes / maxFuel,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [fuelMinutes, maxFuel]);

  // Pulse animation when fuel is low (< 10 minutes)
  useEffect(() => {
    if (fuelMinutes > 0 && fuelMinutes <= 10) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
    pulseAnim.setValue(1);
    return undefined;
  }, [fuelMinutes]);

  // Subtle glow animation when draining
  useEffect(() => {
    if (isDraining && fuelMinutes > 0) {
      const drain = Animated.loop(
        Animated.sequence([
          Animated.timing(drainPulse, { toValue: 1, duration: 1000, useNativeDriver: false }),
          Animated.timing(drainPulse, { toValue: 0, duration: 1000, useNativeDriver: false }),
        ])
      );
      drain.start();
      return () => drain.stop();
    }
    drainPulse.setValue(0);
    return undefined;
  }, [isDraining, fuelMinutes]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const glowOpacity = drainPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.7],
  });

  const isPlaceholder = typeof labelOverride === 'string' && labelOverride.length > 0;
  const isLow = !isPlaceholder && fuelMinutes <= 10;
  const isEmpty = !isPlaceholder && fuelMinutes <= 0;

  // Format time display based on per-second fuel drain.
  const formatFuel = (fuelUnits: number) => {
    const totalSeconds = Math.max(0, Math.floor(fuelUnits));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
  };

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <Pressable
        onPress={() => {
          hapticTap();
          onPress?.();
        }}
      >
        <View style={[styles.container, isEmpty && styles.containerEmpty]}>
          {/* Fill Layer - Background acting as progress bar */}
          {!isEmpty && (
            <Animated.View 
              style={[
                styles.fillLayer,
                { width: fillWidth },
              ]} 
            >
              <LinearGradient
                colors={isLow ? [colors.accentWarning, '#FFAA00'] : [FUEL_PURPLE, '#9A2ABF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }} // Horizontal gradient
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          )}

          {/* Content Layer */}
          <View style={styles.contentContainer}>
            <Ionicons 
              name="rocket" 
              size={18} 
              color={isEmpty ? colors.textMuted : '#fff'} 
              style={styles.icon}
            />
            <AppText style={[
              styles.timeText,
              isEmpty && styles.timeTextEmpty,
              isLow && !isEmpty && styles.timeTextLow,
            ]}>
              {labelOverride ?? (isEmpty ? '0s' : formatFuel(fuelMinutes))}
            </AppText>
          </View>

          {/* Shine/Gloss Overlay */}
          {!isEmpty && (
            <LinearGradient
              colors={['rgba(255,255,255,0.2)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 0.6 }}
              style={styles.shine}
            />
          )}

          {/* Draining glow effect overlay */}
          {isDraining && !isEmpty && (
            <Animated.View 
              style={[
                styles.glowOverlay,
                { opacity: glowOpacity },
              ]} 
            />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt, // Match CurrencyPill background
    borderRadius: radius.xl, // Match CurrencyPill borderRadius
    paddingHorizontal: spacing.md, // Match CurrencyPill padding
    paddingVertical: spacing.xs, // Match CurrencyPill padding
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.borderSubtle, // Match CurrencyPill border
    overflow: 'hidden', // Clip fill
    justifyContent: 'center',
  },
  containerEmpty: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderSubtle,
  },
  fillLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs, // Match CurrencyPill gap
    zIndex: 3, // Above fill
  },
  icon: {
    // Remove text shadow to match CurrencyPill
  },
  shine: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.1)',
    zIndex: 2,
  },
  timeText: {
    color: colors.textPrimary, // Match CurrencyPill text color
    fontSize: 14, // Match CurrencyPill font size
    fontWeight: '700', // Match CurrencyPill font weight
    // Remove text shadow to match CurrencyPill
  },
  timeTextEmpty: {
    color: colors.textMuted,
  },
  timeTextLow: {
    color: colors.textPrimary,
  },
});
