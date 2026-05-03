import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  PanResponderGestureState,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors, spacing } from '../../theme';
import { FLOATING_BUTTON_SIZE, NAV_BAR_HEIGHT } from './layoutConstants';
import { AppText } from '../../components';

// Magnetic position with pull strength
type MagnetPosition = {
  x: number;
  y: number;
  pullStrength: number;
  side: 'left' | 'right';
  vertical: 'upper' | 'bottom';
};

const STORAGE_KEY = '@vulu_menu_position';

// Layout Constants
const MENU_ITEM_GAP = 5;
const MENU_SECTION_GAP = 10;
const MENU_PADDING_Y = 20; // Increased to 20 for more spacing
const ITEM_SIZE = 50;
const VELOCITY_THRESHOLD = 0.5;

const SPRING_CONFIG = {
  tension: 60,
  friction: 9,
  useNativeDriver: false,
};

type MenuKey =
  | 'music'
  | 'posts'
  | 'play'
  | 'clash-of-drone'
  | 'leaderboard'
  | 'shop'
  | 'videos'
  | 'profile'
  | 'settings'
  | 'create-post';

type MenuNotifications = {
  [key in MenuKey]?: number;
};

type FloatingMenuButtonProps = {
  notifications?: MenuNotifications;
};

type MenuItemConfig = {
  id: MenuKey;
  icon: string;
  route: string;
  matchRoutes: string[];
  label?: string;
};

const MENU_ITEMS: MenuItemConfig[] = [
  { id: 'music', icon: 'musical-notes', route: '/(tabs)/music', matchRoutes: ['/music'], label: 'Music' },
  { id: 'videos', icon: 'videocam', route: '/(tabs)/videos', matchRoutes: ['/videos'], label: 'Hub' },
  { id: 'posts', icon: 'document-text', route: '/posts', matchRoutes: ['/posts'], label: 'Posts' },
  { id: 'play', icon: 'game-controller', route: '/(tabs)/play', matchRoutes: ['/play'], label: 'Play' },
  {
    id: 'clash-of-drone',
    icon: 'hardware-chip',
    route: '/game/clash-of-drone',
    matchRoutes: ['/game/clash-of-drone'],
    label: 'Clash Of Drone',
  },
  { id: 'leaderboard', icon: 'trophy', route: '/(tabs)/leaderboard', matchRoutes: ['/leaderboard'], label: 'Leaderboard' },
  { id: 'shop', icon: 'cart', route: '/(tabs)/shop', matchRoutes: ['/shop'], label: 'Shop' },
];

const MAX_MENU_ITEM_COUNT = MENU_ITEMS.length;
const HOME_FAB_SIZE = 52;
const COMPACT_HOME_FAB_SIZE = 44;
const QUICK_ACTION_MENU_GAP = 12;
const DRAG_ACTIVATION_DISTANCE = 6;
const HORIZONTAL_ANCHOR_INSET = 28;
const BOTTOM_ANCHOR_GAP = spacing.md;
const MENU_PANEL_WIDTH = 168;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function FloatingMenuButton({ notifications = {} }: FloatingMenuButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');
  const isHome = pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/';
  const isMessages =
    pathname === '/messages' ||
    pathname.startsWith('/messages/') ||
    pathname.startsWith('/(tabs)/messages');
  const isNotifications =
    pathname === '/notifications' ||
    pathname.startsWith('/notifications/') ||
    pathname.startsWith('/(tabs)/notifications');
  const isProfile =
    pathname === '/profile' ||
    pathname.startsWith('/profile/') ||
    pathname.startsWith('/(tabs)/profile');
  const isCompactWidth = width < 400;
  const fabSize = isCompactWidth ? COMPACT_HOME_FAB_SIZE : HOME_FAB_SIZE;

  // State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isMenuOpenRef = useRef(false);
  const [measuredContentHeight, setMeasuredContentHeight] = useState(0);
  const [lastKnownPosition, setLastKnownPosition] = useState({ x: 0, y: 0 });

  // Animations
  // 0 = closed (circle), 1 = open (pill)
  const morphAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Staggered animations for menu items
  const itemAnims = useRef(
    Array.from({ length: MAX_MENU_ITEM_COUNT }, () => new Animated.Value(0)),
  ).current;

  // Track starting position for "escape velocity" calculation
  const dragStartPos = useRef({ x: 0, y: 0 });

  const activeMenuItems = MENU_ITEMS;

  // Total notifications calculation
  const totalNotifications = useMemo(() => {
    return Object.values(notifications).reduce((sum, count) => sum + (count || 0), 0);
  }, [notifications]);

  const hasNotifications = totalNotifications > 0;

  // Screen Boundaries
  const safeTop = insets.top + 20;
  const safeBottom = NAV_BAR_HEIGHT + insets.bottom + BOTTOM_ANCHOR_GAP;
  const upperAnchorClearance = isMessages
    ? 210
    : isProfile
      ? 126
      : isNotifications
        ? 122
        : isHome
          ? 112
          : 88;

  // Calculate Expanded Dimensions
  const MENU_PADDING = MENU_PADDING_Y;

  // Vertical List Layout
  const EXPANDED_WIDTH = 66; // 50px items + 16px padding (8px each side)

  const maxItems = activeMenuItems.length;
  const LIST_HEIGHT = (maxItems * ITEM_SIZE) +
    ((maxItems - 1) * MENU_ITEM_GAP);

  const EXPANDED_HEIGHT = (MENU_PADDING * 2) +
    ITEM_SIZE + // Toggle Button Height
    MENU_SECTION_GAP +
    LIST_HEIGHT;

  // Use measured content height if available, otherwise fallback to calculated
  const actualExpandedHeight = measuredContentHeight > 0 ? measuredContentHeight : EXPANDED_HEIGHT;

  // Magnet Positions
  const { magnetPositions, upperAnchorY, bottomAnchorY } = useMemo(() => {
    const left = insets.left + HORIZONTAL_ANCHOR_INSET;
    const right = width - fabSize - insets.right - HORIZONTAL_ANCHOR_INSET;
    const bottom = Math.max(safeTop, height - safeBottom - fabSize);
    const upper = Math.min(
      bottom - fabSize - QUICK_ACTION_MENU_GAP,
      Math.max(safeTop, insets.top + upperAnchorClearance),
    );

    const all: MagnetPosition[] = [
      { x: right, y: bottom, pullStrength: 1.0, side: 'right', vertical: 'bottom' },
      { x: left, y: bottom, pullStrength: 0.92, side: 'left', vertical: 'bottom' },
      { x: right, y: upper, pullStrength: 0.94, side: 'right', vertical: 'upper' },
      { x: left, y: upper, pullStrength: 0.88, side: 'left', vertical: 'upper' },
    ];

    return {
      magnetPositions: all,
      upperAnchorY: upper,
      bottomAnchorY: bottom,
    };
  }, [fabSize, height, insets, safeBottom, safeTop, upperAnchorClearance, width]);

  // Initial Position (Bottom Right or Saved)
  // We use a ref for the Animated Value to avoid re-creating it, but we need to initialize it correctly.
  const defaultPos = useMemo(() => {
    const bottomRight = magnetPositions.find(
      (position) => position.side === 'right' && position.vertical === 'bottom',
    );
    return bottomRight
      ? { x: bottomRight.x, y: bottomRight.y }
      : { x: width - fabSize - 20, y: height - safeBottom - fabSize };
  }, [fabSize, height, magnetPositions, safeBottom, width]);

  // Use Animated.ValueXY for fluid movement
  const pan = useRef(new Animated.ValueXY(defaultPos)).current;

  const getNearestMagnetPosition = useCallback(
    (x: number, y: number) => {
      let nearest = magnetPositions[0];
      let minDistance = Number.MAX_VALUE;

      magnetPositions.forEach((position) => {
        const distance = Math.hypot(position.x - x, position.y - y);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = position;
        }
      });

      return nearest;
    },
    [magnetPositions],
  );

  // Load saved position on mount
  useEffect(() => {
    setLastKnownPosition(defaultPos);
    const loadPosition = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);

          // Improved Boundary Validation
          const maxX = width - fabSize;
          const maxY = height - safeBottom - fabSize;
          const minY = safeTop;

          let safeX = parsed.x;
          let safeY = parsed.y;

          // Clamp to safe area
          safeX = Math.max(0, Math.min(safeX, maxX));
          safeY = Math.max(minY, Math.min(safeY, maxY));

          // Only update if valid numbers
          if (!isNaN(safeX) && !isNaN(safeY)) {
            const snapped = getNearestMagnetPosition(safeX, safeY);
            pan.setValue({ x: snapped.x, y: snapped.y });
            setLastKnownPosition({ x: snapped.x, y: snapped.y });
          }
        } else {
          // No saved pos: reset to default (handles rotation/resize)
          pan.setValue(defaultPos);
          setLastKnownPosition(defaultPos);
        }
      } catch (e) {
        // Ignore error
        setLastKnownPosition(defaultPos);
      }
    };
    loadPosition();
  }, [defaultPos, fabSize, getNearestMagnetPosition, height, pan, safeBottom, safeTop, width]);

  // --- Animation Logic ---

  const toggleMenu = useCallback(() => {
    const willOpen = !isMenuOpen;
    setIsMenuOpen(willOpen);
    isMenuOpenRef.current = willOpen;

    Haptics.selectionAsync();

    if (willOpen) {
      itemAnims.forEach((anim) => anim.setValue(0));
      Animated.parallel([
        Animated.spring(morphAnim, {
          toValue: 1,
          ...SPRING_CONFIG
        }),
        Animated.stagger(
          40,
          itemAnims.map((anim) =>
            Animated.spring(anim, {
              toValue: 1,
              ...SPRING_CONFIG,
              tension: 80,
              friction: 8
            })
          )
        )
      ]).start();
    } else {
      // Close sequence
      Animated.parallel([
        Animated.timing(morphAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false
        }),
        ...itemAnims.map(anim =>
          Animated.timing(anim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: false
          })
        )
      ]).start();
    }
  }, [isMenuOpen, morphAnim, itemAnims]);

  const closeMenu = useCallback(() => {
    if (!isMenuOpen) return;
    setIsMenuOpen(false);
    isMenuOpenRef.current = false;
    Haptics.selectionAsync();

    Animated.parallel([
      Animated.timing(morphAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false
      }),
      ...itemAnims.map(anim =>
        Animated.timing(anim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: false
        })
      )
    ]).start();
  }, [isMenuOpen, morphAnim, itemAnims]);

  // --- Dragging Logic ---

  const getBestMagnetPosition = useCallback((x: number, y: number, vx: number, vy: number, startX: number, startY: number): MagnetPosition => {
    const velocity = Math.sqrt(vx * vx + vy * vy);
    const isThrow = velocity > VELOCITY_THRESHOLD;
    const positions = magnetPositions;
    const startedOnLeft = startX <= width / 2;
    const endedOnLeft = x <= width / 2;
    const crossedMidline = startedOnLeft !== endedOnLeft;

    // How far did we drag from the starting position?
    const dragDistance = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
    // Normalize: 0 = no drag, 1 = dragged across half the screen
    const escapeRatio = Math.min(dragDistance / (width * 0.4), 1.0);

    let bestPosition = positions[0];
    let minScore = Number.MAX_VALUE;

    positions.forEach(pos => {
      const distanceToMagnet = Math.sqrt(Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2));
      let score = distanceToMagnet / pos.pullStrength;
      const targetOnLeft = pos.side === 'left';

      if (targetOnLeft !== startedOnLeft && !crossedMidline) {
        score *= 1.45;
      }

      // Penalize snapping back to origin - the further you dragged, the harder to snap back
      const distanceFromStart = Math.sqrt(Math.pow(pos.x - startX, 2) + Math.pow(pos.y - startY, 2));
      const isOriginMagnet = distanceFromStart < 10; // Within 10px = same magnet
      if (isOriginMagnet && escapeRatio > 0.2) {
        // Penalize origin magnet based on how far we escaped
        // escapeRatio of 1.0 = 3x penalty (very hard to snap back)
        score *= (1.0 + escapeRatio * 2.0);
      }

      // Favor throw direction
      if (isThrow) {
        const dirX = pos.x - x;
        const dirY = pos.y - y;
        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);

        if (dirLen > 0) {
          // Normalized direction vector to target
          const ndx = dirX / dirLen;
          const ndy = dirY / dirLen;

          // Normalized velocity vector
          const nvx = vx / velocity;
          const nvy = vy / velocity;

          // Dot product: 1.0 = exactly aligned, -1.0 = opposite
          const dot = (ndx * nvx) + (ndy * nvy);

          // Strong bonus for throw direction
          // dot > 0 means we're throwing towards this magnet
          if (dot > 0) {
            // The faster we throw, the stronger the directional bias
            const velocityBonus = Math.min(velocity / 2, 1.0); // Cap at velocity=2
            score *= (1.0 - dot * 0.7 * (0.5 + velocityBonus * 0.5));
          } else {
            // Penalize magnets in the opposite direction of throw
            score *= (1.0 - dot * 0.3); // dot is negative, so this increases score
          }
        }
      }

      if (score < minScore) {
        minScore = score;
        bestPosition = pos;
      }
    });
    return bestPosition;
  }, [magnetPositions, width]);


  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > DRAG_ACTIVATION_DISTANCE ||
        Math.abs(gesture.dy) > DRAG_ACTIVATION_DISTANCE,
      onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
        Math.abs(gesture.dx) > DRAG_ACTIVATION_DISTANCE ||
        Math.abs(gesture.dy) > DRAG_ACTIVATION_DISTANCE,

      onPanResponderGrant: () => {
        Haptics.selectionAsync();
        // Stop any ongoing movement and capture starting position
        pan.stopAnimation((value) => {
          dragStartPos.current = { x: value.x, y: value.y };
        });
        // Extract offset so movement is relative to start
        pan.extractOffset();

        Animated.spring(buttonScale, { toValue: 0.95, useNativeDriver: false }).start();
      },

      onPanResponderMove: (_evt, gesture: PanResponderGestureState) => {
        pan.setValue({ x: gesture.dx, y: gesture.dy });
      },

      onPanResponderRelease: (_evt, gesture: PanResponderGestureState) => {
        pan.flattenOffset(); // Merge offset into value so we can animate to absolute position

        Animated.spring(buttonScale, { toValue: 1, useNativeDriver: false }).start();

        const currentX = dragStartPos.current.x + gesture.dx;
        const currentY = dragStartPos.current.y + gesture.dy;

        const bestPos = getBestMagnetPosition(
          currentX,
          currentY,
          gesture.vx,
          gesture.vy,
          dragStartPos.current.x,
          dragStartPos.current.y
        );

        setLastKnownPosition(bestPos);

        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ x: bestPos.x, y: bestPos.y }))
          .catch(err => {
            if (__DEV__) {
              console.warn('Failed to save menu pos:', err instanceof Error ? err.message : 'Unknown error');
            }
          });

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        Animated.spring(pan, {
          toValue: { x: bestPos.x, y: bestPos.y },
          velocity: { x: gesture.vx * 0.5, y: gesture.vy * 0.5 }, // Dampen throw velocity
          stiffness: 150,  // Responsive but not snappy
          damping: 18,     // Smooth settle with subtle overshoot
          mass: 0.8,       // Light feel, not sluggish
          useNativeDriver: false
        }).start();
      }
    })
  ).current;

  // --- Interpolations ---

  const borderRadius = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isHome ? 18 : FLOATING_BUTTON_SIZE / 2, 22]
  });

  const menuOpacity = morphAnim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0, 1]
  });

  const menuTranslateY = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0]
  });

  const estimatedMenuHeight = measuredContentHeight || (activeMenuItems.length * 60);
  const opensToRight = lastKnownPosition.x <= width / 2;
  const availableAbove = Math.max(0, lastKnownPosition.y - safeTop);
  const availableBelow = Math.max(0, height - safeBottom - (lastKnownPosition.y + fabSize));
  const verticalAnchor: MagnetPosition['vertical'] =
    Math.abs(lastKnownPosition.y - upperAnchorY) <= Math.abs(lastKnownPosition.y - bottomAnchorY)
      ? 'upper'
      : 'bottom';
  const opensDown = verticalAnchor === 'upper';
  const menuMaxHeight = Math.max(
    140,
    (opensDown ? availableBelow : availableAbove) - QUICK_ACTION_MENU_GAP,
  );
  const horizontalMenuOffset = fabSize + QUICK_ACTION_MENU_GAP;

  return (
    <>
      {isMenuOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu}>
          <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.homeBackdrop} />
        </Pressable>
      )}

      <Animated.View
        style={[
          styles.homeQuickActionsWrap,
          {
            width: fabSize,
            height: fabSize,
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { scale: buttonScale },
            ],
          },
        ]}
      >
        <Animated.View
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height;
            if (nextHeight > 0 && Math.abs(nextHeight - measuredContentHeight) > 1) {
              setMeasuredContentHeight(nextHeight);
            }
          }}
          style={[
            styles.homeQuickActionsMenu,
            {
              width: MENU_PANEL_WIDTH,
              maxHeight: menuMaxHeight,
              opacity: menuOpacity,
              transform: [{ translateY: menuTranslateY }],
            },
            opensDown
              ? { top: fabSize + QUICK_ACTION_MENU_GAP }
              : { bottom: fabSize + QUICK_ACTION_MENU_GAP },
            opensToRight
              ? [styles.homeQuickActionsMenuRight, { left: horizontalMenuOffset }]
              : [styles.homeQuickActionsMenuLeft, { right: horizontalMenuOffset }],
            isMenuOpen ? styles.pointerEventsAuto : styles.pointerEventsNone,
          ]}
        >
          <ScrollView
            style={styles.homeQuickActionsScroll}
            contentContainerStyle={styles.homeQuickActionsScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled
          >
            {activeMenuItems.map((item, index) => {
              const itemAnim = itemAnims[index];
              const isActive = item.matchRoutes.some(
                (matchRoute) => pathname === matchRoute || pathname?.startsWith(`${matchRoute}/`),
              );

              return (
                <Animated.View
                  key={item.id}
                  style={[
                    styles.homeActionRow,
                    opensToRight ? styles.homeActionRowRight : styles.homeActionRowLeft,
                    {
                      opacity: itemAnim,
                      transform: [
                        { scale: itemAnim },
                        {
                          translateY: itemAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [12, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Pressable
                    style={[
                      styles.homeActionButton,
                      isActive && styles.homeActionButtonActive,
                    ]}
                    onPress={() => {
                      closeMenu();
                      router.push(item.route as any);
                    }}
                  >
                    <AppText
                      variant="smallBold"
                      numberOfLines={1}
                      style={[
                        styles.homeActionLabel,
                        isActive && styles.homeActionLabelActive,
                      ]}
                    >
                      {item.label ?? item.id}
                    </AppText>
                    <Ionicons
                      name={item.icon as keyof typeof Ionicons.glyphMap}
                      size={18}
                      color={colors.textPrimary}
                    />
                  </Pressable>
                </Animated.View>
              );
            })}
          </ScrollView>
        </Animated.View>

        <Animated.View
          style={styles.homeFabDragHandle}
          {...panResponder.panHandlers}
        >
          <Pressable
            onPress={toggleMenu}
            style={[
              styles.homeFabButton,
              isCompactWidth && styles.homeFabButtonCompact,
            ]}
          >
            <Ionicons
              name={isMenuOpen ? 'close' : 'add'}
              size={isCompactWidth ? 28 : 32}
              color={colors.textOnLight}
            />
            {hasNotifications && !isMenuOpen ? (
              <View style={styles.mainBadge}>
                <Text style={styles.mainBadgeText}>
                  {totalNotifications > 99 ? '99+' : totalNotifications}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </Animated.View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: FLOATING_BUTTON_SIZE,
    zIndex: 1000,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0px 8px 18px rgba(0, 0, 0, 0.28)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 8,
        },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
    }),
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pointerEventsAuto: {
    pointerEvents: 'auto',
  },
  pointerEventsNone: {
    pointerEvents: 'none',
  },
  blurContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  fabContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContent: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: MENU_PADDING_Y,
  },
  toggleButton: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, // Match menuItem borderRadius
  },
  absoluteSlot: {
    position: 'absolute',
    alignItems: 'center',
    width: '100%',
  },
  itemsList: {
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    gap: MENU_ITEM_GAP,
  },
  menuItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  menuItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  menuItemActive: {
    backgroundColor: colors.accentPrimarySubtle, // Use the proper theme token
  },
  homeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  homeQuickActionsWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'flex-end',
    zIndex: 1000,
  },
  homeQuickActionsMenu: {
    position: 'absolute',
    gap: 10,
  },
  homeQuickActionsScroll: {
    maxHeight: '100%',
  },
  homeQuickActionsScrollContent: {
    gap: 10,
    paddingBottom: spacing.xs,
  },
  homeQuickActionsMenuLeft: {
    right: 0,
    alignItems: 'flex-end',
  },
  homeQuickActionsMenuRight: {
    left: 0,
    alignItems: 'flex-start',
  },
  homeActionRow: {
    width: '100%',
  },
  homeActionRowLeft: {
    alignItems: 'flex-end',
  },
  homeActionRowRight: {
    alignItems: 'flex-start',
  },
  homeActionButton: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(17, 17, 19, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 4, height: 4 },
    elevation: 8,
  },
  homeActionButtonActive: {
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(24, 24, 28, 0.98)',
  },
  homeActionLabel: {
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontSize: 13,
    flexShrink: 1,
  },
  homeActionLabelActive: {
    color: colors.textPrimary,
  },
  homeFabButton: {
    width: HOME_FAB_SIZE,
    height: HOME_FAB_SIZE,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(11, 11, 13, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  homeFabDragHandle: {
    width: HOME_FAB_SIZE,
    height: HOME_FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeFabButtonCompact: {
    width: COMPACT_HOME_FAB_SIZE,
    height: COMPACT_HOME_FAB_SIZE,
    borderRadius: 13,
  },
  mainBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accentDanger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
    paddingHorizontal: 3,
  },
  mainBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  miniBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accentDanger,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
