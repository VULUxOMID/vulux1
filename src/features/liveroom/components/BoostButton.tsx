import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Animated, Text, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, radius, spacing } from '../../../theme';
import { hapticTap } from '../../../utils/haptics';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const BOOST_RED = '#FF4458';

type BoostButtonProps = {
  onPress: () => void;
  boostCount?: number;
  boostRank?: number | null;
  boostTimeLeft?: number; // seconds remaining
  boostTotalTime?: number; // total boost duration
  isBoosting?: boolean; // whether user is currently boosting
  boostAmount?: number; // amount of current boost
  onSwipeDown?: () => void; // swipe down handler
};

export function BoostButton({
  onPress,
  boostCount = 0,
  boostRank,
  boostTimeLeft = 0,
  boostTotalTime = 60,
  isBoosting = false,
  boostAmount = 0,
  onSwipeDown,
}: BoostButtonProps) {
  const onSwipeDownRef = useRef(onSwipeDown);
  useEffect(() => {
    onSwipeDownRef.current = onSwipeDown;
  }, [onSwipeDown]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false, // Don't capture taps
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture vertical swipes, not taps or horizontal swipes
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy > 20;
      },
      onPanResponderRelease: (_, gestureState) => {
        // Check if it's a swipe down gesture
        if (gestureState.dy > 30) {
          hapticTap();
          onSwipeDownRef.current?.();
        }
      },
    })
  ).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Update progress animation - smooth continuous countdown
  useEffect(() => {
    if (boostTimeLeft > 0 && boostTotalTime > 0) {
      const progress = boostTimeLeft / boostTotalTime;
      // Animate smoothly over 1 second (synced with timer)
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 1000,
        useNativeDriver: false,
      }).start();
    } else {
      // Reset to 0 when no boost
      progressAnim.setValue(0);
    }
  }, [boostTimeLeft, boostTotalTime]);

  const isActive = boostCount > 0 || boostRank;
  const isUrgent = boostTimeLeft > 0 && boostTimeLeft <= 10;
  const hasActiveBoost = boostTimeLeft > 0 && isActive; // Only show ring when actively boosted
  const isAboutToRunOut = hasActiveBoost && boostTimeLeft <= 10;

  // Determine what to display inside the button
  const getDisplayContent = (): string | null => {
    if (boostRank && boostRank <= 3) {
      // Show rank for top 3
      return `${boostRank}`;
    } else {
      // Always show lightning icon for others and after first boost
      return null;
    }
  };

  // Progress circle properties
  const size = 64;

  // Calculate dynamic pill width based on boost count
  const getPillWidth = (count: number) => {
    const baseWidth = 20; // Base width for padding
    const charWidth = 9; // Approximate width of each digit
    const digitCount = count.toString().length;
    return baseWidth + (digitCount * charWidth);
  };

  const displayContent = getDisplayContent();
  // Show counter if user has ever boosted (boostCount > 0) or currently has boosts
  const showCounter = boostCount > 0;

  // Button dimensions
  const buttonSize = size - 8; // 56px
  const pillHeight = 20;
  const pillOverlap = 8;
  const strokeWidth = 4;

  // Calculate progress for combined shape
  const progress = boostTimeLeft > 0 && boostTotalTime > 0 ? boostTimeLeft / boostTotalTime : 0;

  // Calculate pill width based on boost count
  const currentPillWidth = getPillWidth(boostCount);

  // SVG dimensions - span both button and counter
  const svgWidth = Math.max(buttonSize, currentPillWidth);
  const svgHeight = buttonSize + pillHeight - pillOverlap;

  // Circle properties for simple progress ring
  const circleRadius = (buttonSize - strokeWidth) / 2;
  const circumference = circleRadius * 2 * Math.PI;


  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Main button container - matching pop-up design */}
      <View style={styles.boostBadge}>
        {/* Progress ring around button only */}
        {hasActiveBoost && (
          <View style={[styles.progressRing, { width: buttonSize, height: buttonSize }]}>
            <Svg width={buttonSize} height={buttonSize}>
              {/* Background circle */}
              <Circle
                cx={buttonSize / 2}
                cy={buttonSize / 2}
                r={circleRadius}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              {/* Progress circle */}
              <AnimatedCircle
                cx={buttonSize / 2}
                cy={buttonSize / 2}
                r={circleRadius}
                stroke={isUrgent ? '#fff' : 'rgba(255,255,255,0.9)'}
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [circumference, 0],
                })}
                strokeLinecap="round"
                transform={`rotate(-90 ${buttonSize / 2} ${buttonSize / 2})`}
              />
            </Svg>
          </View>
        )}

        {/* Boost button circle */}
        <Pressable
          onPress={() => {
            hapticTap();
            onPress();
          }}
          style={[
            styles.boostIconCircle,
            {
              width: size - 8,
              height: size - 8,
              borderRadius: (size - 8) / 2,
            },
          ]}
        >
          {/* Content inside circle */}
          {displayContent ? (
            <Text style={styles.displayText}>{displayContent}</Text>
          ) : (
            <Ionicons
              name="flash"
              size={28}
              color="#fff"
            />
          )}
        </Pressable>

        {/* Counter below circle - separate from button */}
        {showCounter && (
          <Text style={styles.boostCount}>{boostCount}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    pointerEvents: 'none',
  },
  // Match pop-up design exactly
  boostBadge: {
    alignItems: 'center',
    position: 'relative',
  },
  boostIconCircle: {
    backgroundColor: BOOST_RED,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BOOST_RED,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  boostCount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: BOOST_RED,
    paddingHorizontal: spacing.sm || 8,
    paddingVertical: 2,
    borderRadius: radius.sm || 4,
    marginTop: 4,
    overflow: 'hidden',
    shadowColor: BOOST_RED,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  displayText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
