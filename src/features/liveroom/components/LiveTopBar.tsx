import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Animated, LayoutChangeEvent, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { hapticTap } from '../../../utils/haptics';
import { FuelGauge } from './FuelGauge';


type LiveTopBarProps = {
  viewerCount: number;
  profileViewCount?: number;
  onMinimize: () => void;
  onExitPress?: () => void;
  onViewersPress: () => void;
  onProfileViewsPress: () => void;
  topInset: number;
  showMediaControls?: boolean;
  isMuted?: boolean;
  onToggleMic?: () => void;
  isHost?: boolean;
  // Fuel info (Premium GemPlus)
  fuelMinutes?: number;
  isFuelDraining?: boolean;
  onFuelPress?: () => void;
};


export function LiveTopBar({
  viewerCount,
  profileViewCount = 0,
  onMinimize,
  onExitPress,
  onViewersPress,
  onProfileViewsPress,
  topInset,
  showMediaControls = false,
  isMuted = false,
  onToggleMic,
  isHost = false,
  fuelMinutes = 0,
  isFuelDraining = false,
  onFuelPress,
}: LiveTopBarProps) {
  const profileViewPulseAnim = useRef(new Animated.Value(1)).current;
  const prevProfileViewCount = useRef(profileViewCount);

  // Pulse animation when profile view count increases
  useEffect(() => {
    if (profileViewCount > prevProfileViewCount.current && profileViewCount > 0) {
      // Pulse animation when count goes up
      Animated.sequence([
        Animated.timing(profileViewPulseAnim, {
          toValue: 1.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(profileViewPulseAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevProfileViewCount.current = profileViewCount;
  }, [profileViewCount]);


  return (
    <LinearGradient 
      colors={['rgba(0,0,0,0.5)', 'transparent']}
      locations={[0, 1]}
      style={[styles.container, { paddingTop: topInset + spacing.xs }]}
      pointerEvents="box-none"
    >
      {/* Left side: Minimize + Boost Tag */}
      <View style={styles.leftActions}>
        <Pressable 
          onPress={() => {
            hapticTap();
            onMinimize();
          }}
          style={styles.blurContainer}
        >
          <BlurView intensity={20} tint="dark" style={styles.minimizeButton}>
            <Ionicons name="chevron-down" size={24} color="#fff" />
          </BlurView>
        </Pressable>

        {/* Fuel Gauge (Premium GemPlus) */}
        <FuelGauge
          fuelMinutes={fuelMinutes}
          isDraining={isFuelDraining}
          onPress={onFuelPress}
        />

      </View>
      
      <View style={styles.rightActions}>
        {showMediaControls && (
          <>
            <Pressable
              onPress={() => {
                hapticTap();
                onToggleMic?.();
              }}
              style={styles.blurContainer}
            >
              <BlurView intensity={20} tint="dark" style={styles.iconButton}>
                <Ionicons
                  name={isMuted ? 'mic-off' : 'mic'}
                  size={18}
                  color={isMuted ? colors.accentDanger : '#fff'}
                />
              </BlurView>
            </Pressable>
          </>
        )}
        {onExitPress ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onExitPress();
            }}
            style={styles.blurContainer}
          >
            <BlurView
              intensity={20}
              tint="dark"
              style={[styles.iconButton, styles.exitButton, isHost && styles.exitButtonDanger]}
            >
              <Ionicons
                name={isHost ? 'stop-circle-outline' : 'exit-outline'}
                size={18}
                color="#fff"
              />
            </BlurView>
          </Pressable>
        ) : null}
        {/* Profile Views - Eye icon */}
        <Pressable
          onPress={() => {
            hapticTap();
            onProfileViewsPress();
          }}
          style={styles.blurContainer}
        >
          <BlurView intensity={20} tint="dark" style={styles.iconPill}>
            <Ionicons name="eye-outline" size={18} color="#fff" />
            {profileViewCount > 0 && (
              <Animated.View style={{ transform: [{ scale: profileViewPulseAnim }] }}>
                <AppText style={styles.countText}>{profileViewCount}</AppText>
              </Animated.View>
            )}
          </BlurView>
        </Pressable>

        {/* Viewer Count - Opens drawer */}
        <Pressable 
          onPress={() => {
            hapticTap();
            onViewersPress();
          }}
          style={styles.blurContainer}
        >
          <BlurView intensity={20} tint="dark" style={styles.viewerPill}>
            <Ionicons name="people" size={16} color="#fff" />
            <AppText style={styles.viewerText}>{viewerCount}</AppText>
          </BlurView>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12, // More padding on edges
    paddingBottom: spacing.sm,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6, // Tighter gap
  },
  blurContainer: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  minimizeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Platform.OS === 'android' ? 'rgba(0,0,0,0.5)' : 'transparent',
  },
  // Right actions
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6, // Tighter gap
  },
  iconPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10, // Standardized padding
    height: 36,
    minWidth: 36, // Reduced min width
    justifyContent: 'center',
    backgroundColor: Platform.OS === 'android' ? 'rgba(0,0,0,0.5)' : 'transparent',
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Platform.OS === 'android' ? 'rgba(0,0,0,0.5)' : 'transparent',
  },
  exitButton: {
    backgroundColor: Platform.OS === 'android' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)',
  },
  exitButtonDanger: {
    backgroundColor: Platform.OS === 'android' ? 'rgba(255,59,48,0.35)' : 'rgba(255,59,48,0.22)',
  },
  countText: {
    color: '#fff',
    fontSize: 12, // Consistent size
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4, // Consistent gap
    paddingHorizontal: 10, // Standardized padding
    height: 36,
    backgroundColor: Platform.OS === 'android' ? 'rgba(0,0,0,0.5)' : 'transparent',
  },
  viewerText: {
    color: '#fff',
    fontSize: 12, // Consistent size
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
