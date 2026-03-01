import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLive } from '../../context/LiveContext';
import { colors, radius, spacing } from '../../theme';
import { NAV_BAR_HEIGHT } from '../../components/navigation/layoutConstants';
import { MiniHostsGrid } from '../live/components/MiniHostsGrid';

export function LiveOverlay() {
  const {
    activeLive,
    isMinimized,
    restoreLive,
    leaveLive,
    endLive,
    isHost,
    isLiveEnding,
  } = useLive();

  const handleClose = useCallback(() => {
    if (isHost) {
      Alert.alert(
        'End Live?',
        'Ending now will stop the live for everyone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End Live', style: 'destructive', onPress: endLive },
        ]
      );
    } else {
      Alert.alert(
        'Leave Live?',
        'You will leave this live. The stream keeps running for others.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave Live', style: 'destructive', onPress: leaveLive },
        ],
      );
    }
  }, [endLive, isHost, leaveLive]);

  if (!activeLive) return null;

  return (
    <MiniLiveFloating
      onClose={handleClose}
      onOpen={restoreLive}
      activeLive={activeLive}
      visible={isMinimized}
      isEnding={isLiveEnding}
    />
  );
}

function MiniLiveFloating({
  onClose,
  onOpen,
  activeLive,
  visible,
  isEnding,
}: {
  onClose: () => void;
  onOpen: () => void;
  activeLive: any;
  visible: boolean;
  isEnding: boolean;
}) {
  const { width, height } = Dimensions.get('window');
  const router = useRouter();

  const MINI_WIDTH = 140;
  const MINI_HEIGHT = 220;
  const SNAP_MARGIN = spacing.md;

  // Track last valid anchor for snapping back (initialized after anchors are defined)
  const lastValidAnchorRef = useRef<{ x: number; y: number } | null>(null);

  // 4 corners only: Top-Left, Top-Right, Bottom-Left, Bottom-Right
  const anchors = useMemo(
    () => ({
      topLeft: { x: SNAP_MARGIN, y: NAV_BAR_HEIGHT + SNAP_MARGIN + 44 },
      topRight: { x: width - MINI_WIDTH - SNAP_MARGIN, y: NAV_BAR_HEIGHT + SNAP_MARGIN + 44 },
      bottomLeft: { x: SNAP_MARGIN, y: height - MINI_HEIGHT - 120 },
      bottomRight: { x: width - MINI_WIDTH - SNAP_MARGIN, y: height - MINI_HEIGHT - 120 },
    }),
    [height, width],
  );

  const initialAnchor = anchors.bottomRight;
  const position = useRef(new Animated.ValueXY(initialAnchor)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Refs to hold latest values to avoid stale closures in panResponder
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const anchorsRef = useRef(anchors);
  const routerRef = useRef(router);
  const dimensionsRef = useRef({ width, height });

  // Update refs on every render
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;
  anchorsRef.current = anchors;
  routerRef.current = router;
  dimensionsRef.current = { width, height };

  // Handle visibility animation
  useEffect(() => {
    if (visible) {
      // Reset position before showing
      position.setValue(anchors.bottomRight);
      lastValidAnchorRef.current = anchors.bottomRight;
      posTrackRef.current = anchors.bottomRight;

      // Appear instantly to prevent blink/transparency
      fadeAnim.setValue(1);
    } else {
      // Fade out when closing
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start(() => {
        // Reset position after hidden
        position.setValue(anchors.bottomRight);
        lastValidAnchorRef.current = anchors.bottomRight;
        posTrackRef.current = anchors.bottomRight;
      });
    }
  }, [visible, anchors, fadeAnim, position]);

  // Track position in refs to avoid accessing private Animated `_value`
  const posTrackRef = useRef({ x: initialAnchor.x, y: initialAnchor.y });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        // Don't capture touches on the close button (top-right corner)
        const { locationX, locationY } = evt.nativeEvent;
        if (locationX > MINI_WIDTH - 52 && locationY < 52) return false;
        return true;
      },
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        position.setOffset(posTrackRef.current);
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        position.x.setValue(gestureState.dx);
        position.y.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        position.flattenOffset();

        const currentX = posTrackRef.current.x + gestureState.dx;
        const currentY = posTrackRef.current.y + gestureState.dy;
        posTrackRef.current = { x: currentX, y: currentY };

        const { width: w, height: h } = dimensionsRef.current;
        const currentAnchors = anchorsRef.current;

        // Dismiss when 60% off screen OR thrown hard off screen
        const isDraggedRight = currentX > w - MINI_WIDTH * 0.4;
        const isDraggedLeft = currentX < -MINI_WIDTH * 0.6;
        const isDraggedDown = currentY > h - MINI_HEIGHT * 0.4;

        // Also dismiss if thrown down hard toward bottom edge
        const isThrownDown = gestureState.vy > 2 && currentY > h - MINI_HEIGHT - 100;

        const shouldDismiss = isDraggedRight || isDraggedLeft || isDraggedDown || isThrownDown;

        if (shouldDismiss) {
          // Snap back to corner and show confirmation immediately
          const snapTarget = lastValidAnchorRef.current || currentAnchors.bottomRight;
          posTrackRef.current = snapTarget;
          Animated.timing(position, {
            toValue: snapTarget,
            duration: 150,
            useNativeDriver: false,
          }).start();
          // Show alert immediately, don't wait for animation
          onCloseRef.current();
          return;
        }

        // If minimal movement (tap), restore full screen
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          onOpenRef.current();
          routerRef.current.push('/live');
          return;
        }

        // Determine target corner based on position + velocity (for "throw" feel)
        // Use velocity to predict where user is throwing it
        const predictedX = currentX + gestureState.vx * 100;
        const predictedY = currentY + gestureState.vy * 100;

        const midX = w / 2 - MINI_WIDTH / 2;
        const midY = h / 2 - MINI_HEIGHT / 2;

        // Choose corner based on predicted position
        const isLeft = predictedX < midX;
        const isTop = predictedY < midY;

        let target;
        if (isTop && isLeft) target = currentAnchors.topLeft;
        else if (isTop && !isLeft) target = currentAnchors.topRight;
        else if (!isTop && isLeft) target = currentAnchors.bottomLeft;
        else target = currentAnchors.bottomRight;

        // Save this as last valid anchor for snap-back
        lastValidAnchorRef.current = target;
        posTrackRef.current = target;

        // Smooth spring animation with good "throw" physics
        Animated.spring(position, {
          toValue: target,
          useNativeDriver: false,
          friction: 7,      // Lower = more bouncy
          tension: 40,      // Higher = faster snap
          velocity: Math.sqrt(gestureState.vx ** 2 + gestureState.vy ** 2) * 0.5,
        }).start();
      },
    }),
  ).current;

  const opacityAnim = position.x.interpolate({
    inputRange: [-width, -50, 0, width - MINI_WIDTH, width - 50, width * 2],
    outputRange: [0, 0.5, 1, 1, 0.5, 0], // Solid in center, fades near edges
    extrapolate: 'clamp',
  });

  const hosts = activeLive.hosts || (activeLive.host ? [activeLive.host] : []);

  // Combine drag opacity with visibility state
  // When not visible (full screen mode), opacity is 0 and it ignores touches
  return (
    <Animated.View
      style={[
        styles.miniLive,
        {
          width: MINI_WIDTH,
          height: MINI_HEIGHT,
          opacity: Animated.multiply(opacityAnim, fadeAnim),
          transform: position.getTranslateTransform(),
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
      {...panResponder.panHandlers}
    >
      <PressableClose onClose={onClose} />

      {/* Mini Grid of Hosts */}
      <View style={styles.miniGridContainer} pointerEvents="none">
        <MiniHostsGrid hosts={hosts} fallbackImage={activeLive.images?.[0]} />
      </View>

      {isEnding ? (
        <View style={styles.endingBadge} pointerEvents="none">
          <Ionicons name="videocam-off-outline" size={12} color="#fff" />
          <Animated.Text style={styles.endingBadgeText}>Live ended</Animated.Text>
        </View>
      ) : null}

    </Animated.View>
  );
}

function PressableClose({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.closeWrap}>
      <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
        <Ionicons name="close" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}


const styles = StyleSheet.create({
  miniLive: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: colors.background,
    borderRadius: radius.xl, // More rounded
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    zIndex: 9999,
  },
  closeWrap: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 20,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },

  miniGridContainer: {
    flex: 1,
    backgroundColor: colors.textOnLight,
  },
  endingBadge: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 6,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  endingBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
