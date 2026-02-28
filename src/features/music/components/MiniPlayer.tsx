import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Animated, PanResponder, Dimensions } from 'react-native';
import { AppText } from '../../../components/AppText';
import { colors } from '../../../theme/colors';
import { useMusic } from '../context/MusicContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAV_BAR_HEIGHT } from '../../../components/navigation/layoutConstants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DISMISS_THRESHOLD = SCREEN_WIDTH * 0.3;
const PENDULUM_SPRING = {
  tension: 40,
  friction: 6,
  useNativeDriver: true,
};

export const MiniPlayer = () => {
  const { currentTrack, isPlaying, togglePlayPause, setMinimized, position, duration, stopPlayback } = useMusic();
  const insets = useSafeAreaInsets();
  
  // Animation values
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  
  // Reset position when a new track starts (after a previous dismiss)
  useEffect(() => {
    if (currentTrack) {
      translateX.setValue(0);
      opacity.setValue(1);
    }
  }, [currentTrack]);

  // Refs to avoid stale closures
  const stopPlaybackRef = useRef(stopPlayback);
  stopPlaybackRef.current = stopPlayback;
  
  // Pan responder for swipe to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal swipes
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
        // Fade out as it moves away
        const progress = Math.abs(gestureState.dx) / SCREEN_WIDTH;
        opacity.setValue(1 - progress * 0.5);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > DISMISS_THRESHOLD || Math.abs(gestureState.vx) > 0.5) {
          // Dismiss - animate off screen quickly
          const direction = gestureState.dx > 0 ? 1 : -1;
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: direction * SCREEN_WIDTH,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start(() => {
            // Stop playback first - component will unmount, no need to reset animations
            stopPlaybackRef.current();
          });
        } else {
          // Snap back
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              velocity: gestureState.vx,
              ...PENDULUM_SPRING,
            }),
            Animated.spring(opacity, {
              toValue: 1,
              velocity: gestureState.vx,
              ...PENDULUM_SPRING,
            }),
          ]).start();
        }
      },
    })
  ).current;

  if (!currentTrack) return null;

  const handlePress = () => {
    setMinimized(false);
  };

  // Calculate bottom position: TabBar height + extra spacing
  // TabBar height = NAV_BAR_HEIGHT + insets.bottom
  const bottomPosition = NAV_BAR_HEIGHT + insets.bottom + 12;

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <Animated.View 
      style={[
        styles.wrapper, 
        { bottom: bottomPosition },
        { transform: [{ translateX }], opacity }
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity 
        style={styles.container} 
        onPress={handlePress} 
        activeOpacity={0.9}
      >
        {/* Progress Bar Background */}
        <View style={styles.progressBarBg}>
           <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>

        <View style={styles.content}>
          <Image source={{ uri: currentTrack.artwork }} style={styles.artwork} resizeMode="cover" />
          
          <View style={styles.info}>
            <AppText style={styles.title} numberOfLines={1}>{currentTrack.title}</AppText>
            <AppText style={styles.artist} numberOfLines={1}>{currentTrack.artist}</AppText>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); /* Favorite logic */ }}>
              <Ionicons name="heart-outline" size={24} color={colors.textPrimary} style={styles.icon} />
            </TouchableOpacity>
            
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); togglePlayPause(); }}>
              <Ionicons 
                name={isPlaying ? "pause" : "play"} 
                size={24} 
                color={colors.textPrimary} 
                style={styles.icon} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 10, // Ensure it sits above scroll views but below floating menu if needed (menu is z-1000)
  },
  container: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  progressBarBg: {
    height: 2,
    backgroundColor: colors.borderSubtle,
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accentPrimary,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  artist: {
    fontSize: 12,
    color: colors.textMuted,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginLeft: 16,
  },
});
