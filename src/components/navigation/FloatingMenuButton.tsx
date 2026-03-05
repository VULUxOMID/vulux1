import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  PanResponderGestureState,
  Pressable,
  Platform,
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

import { colors } from '../../theme';
import { FLOATING_BUTTON_SIZE, NAV_BAR_HEIGHT } from './layoutConstants';
import { useAdminAuth } from '../../features/admin/hooks/useAdminAuth';

// Magnetic position with pull strength
type MagnetPosition = { x: number; y: number; pullStrength: number };

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
  | 'play'
  | 'clash-of-drone'
  | 'leaderboard'
  | 'shop'
  | 'videos'
  | 'admin'
  | 'admin-v2';

type MenuNotifications = {
  [key in MenuKey]?: number;
};

type FloatingMenuButtonProps = {
  notifications?: MenuNotifications;
};

const MENU_ITEMS: { id: MenuKey; icon: string; route: string; matchRoutes: string[] }[] = [
  { id: 'music', icon: 'musical-notes', route: '/(tabs)/music', matchRoutes: ['/music'] },
  { id: 'videos', icon: 'videocam', route: '/(tabs)/videos', matchRoutes: ['/videos'] },
  { id: 'play', icon: 'game-controller', route: '/(tabs)/play', matchRoutes: ['/play'] },
  {
    id: 'clash-of-drone',
    icon: 'hardware-chip',
    route: '/game/clash-of-drone',
    matchRoutes: ['/game/clash-of-drone'],
  },
  { id: 'leaderboard', icon: 'trophy', route: '/(tabs)/leaderboard', matchRoutes: ['/leaderboard'] },
  { id: 'shop', icon: 'cart', route: '/(tabs)/shop', matchRoutes: ['/shop'] },
];

const ADMIN_MENU_ITEMS = [
  { id: 'admin', icon: 'shield', route: '/admin', matchRoutes: ['/admin'] },
  { id: 'admin-v2', icon: 'grid', route: '/admin-v2', matchRoutes: ['/admin-v2'] },
] as const;

const MAX_MENU_ITEM_COUNT = MENU_ITEMS.length + ADMIN_MENU_ITEMS.length;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function FloatingMenuButton({ notifications = {} }: FloatingMenuButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');
  const { isAdmin } = useAdminAuth();

  // State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isMenuOpenRef = useRef(false);
  const [measuredContentHeight, setMeasuredContentHeight] = useState(0);

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

  const activeMenuItems = useMemo(() => {
    if (isAdmin) {
      return [...MENU_ITEMS, ...ADMIN_MENU_ITEMS];
    }
    return MENU_ITEMS;
  }, [isAdmin]);

  // Total notifications calculation
  const totalNotifications = useMemo(() => {
    return Object.values(notifications).reduce((sum, count) => sum + (count || 0), 0);
  }, [notifications]);

  const hasNotifications = totalNotifications > 0;

  // Screen Boundaries
  const safeTop = insets.top + 20;
  const safeBottom = NAV_BAR_HEIGHT + insets.bottom + 20;

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

  // Interpolations
  const currentWidth = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [FLOATING_BUTTON_SIZE, EXPANDED_WIDTH]
  });

  // Use measured content height if available, otherwise fallback to calculated
  const actualExpandedHeight = measuredContentHeight > 0 ? measuredContentHeight : EXPANDED_HEIGHT;

  const currentHeight = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [FLOATING_BUTTON_SIZE, actualExpandedHeight]
  });

  // Magnet Positions
  const { magnetPositions, magnetPositionsExpanded } = useMemo(() => {
    const left = insets.left + 16;
    const right = width - FLOATING_BUTTON_SIZE - insets.right - 16;
    const midY = height / 2 - FLOATING_BUTTON_SIZE / 2;
    const bottom = height - safeBottom - FLOATING_BUTTON_SIZE;
    const top = safeTop;

    // 6 checkpoints when closed
    const all: MagnetPosition[] = [
      { x: right, y: bottom, pullStrength: 1.0 }, // Bottom Right (Default)
      { x: left, y: bottom, pullStrength: 0.8 },  // Bottom Left
      { x: right, y: midY, pullStrength: 0.9 },   // Middle Right
      { x: left, y: midY, pullStrength: 0.9 },    // Middle Left
      { x: right, y: top, pullStrength: 0.8 },    // Top Right
      { x: left, y: top, pullStrength: 0.8 },     // Top Left
    ];

    // 4 checkpoints when expanded (corners only, no middle)
    const corners: MagnetPosition[] = [
      { x: right, y: bottom, pullStrength: 1.0 }, // Bottom Right
      { x: left, y: bottom, pullStrength: 0.8 },  // Bottom Left
      { x: right, y: top, pullStrength: 0.8 },    // Top Right
      { x: left, y: top, pullStrength: 0.8 },     // Top Left
    ];

    return { magnetPositions: all, magnetPositionsExpanded: corners };
  }, [width, height, insets, safeTop, safeBottom]);

  // Initial Position (Bottom Right or Saved)
  // We use a ref for the Animated Value to avoid re-creating it, but we need to initialize it correctly.
  const defaultPos = { x: width - FLOATING_BUTTON_SIZE - 20, y: height - safeBottom - FLOATING_BUTTON_SIZE };

  // Use Animated.ValueXY for fluid movement
  const pan = useRef(new Animated.ValueXY(defaultPos)).current;

  // Animated progress: 0 = X button at top (expand down), 1 = X button at bottom (expand up)
  // Only top checkpoints (y < 35% of screen) expand down; middle + bottom expand up
  const xPosAnim = useRef(new Animated.Value(defaultPos.y > height * 0.35 ? 1 : 0)).current;

  // Ref for screen bounds (avoids stale closures in PanResponder)
  const boundsRef = useRef({ safeTop, safeBottom, height });
  boundsRef.current = { safeTop, safeBottom, height };

  // Load saved position on mount
  useEffect(() => {
    const loadPosition = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);

          // Improved Boundary Validation
          const maxX = width - FLOATING_BUTTON_SIZE;
          const maxY = height - safeBottom - FLOATING_BUTTON_SIZE;
          const minY = safeTop;

          let safeX = parsed.x;
          let safeY = parsed.y;

          // Clamp to safe area
          safeX = Math.max(0, Math.min(safeX, maxX));
          safeY = Math.max(minY, Math.min(safeY, maxY));

          // Only update if valid numbers
          if (!isNaN(safeX) && !isNaN(safeY)) {
            pan.setValue({ x: safeX, y: safeY });
            xPosAnim.setValue(safeY > height * 0.35 ? 1 : 0);
          }
        } else {
          // No saved pos: reset to default (handles rotation/resize)
          pan.setValue(defaultPos);
          xPosAnim.setValue(defaultPos.y > height * 0.35 ? 1 : 0);
        }
      } catch (e) {
        // Ignore error
      }
    };
    loadPosition();
  }, [width, height, safeBottom, safeTop]);

  // --- Layout positions driven by xPosAnim ---
  const CONTENT_HEIGHT = ITEM_SIZE + MENU_SECTION_GAP + LIST_HEIGHT;

  // X button slides from top position (0) to bottom position (past all items)
  const xButtonTopAnim = xPosAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, LIST_HEIGHT + MENU_SECTION_GAP],
  });

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

    // Use 4 corner checkpoints when expanded, 6 when closed
    const positions = isMenuOpenRef.current ? magnetPositionsExpanded : magnetPositions;

    // How far did we drag from the starting position?
    const dragDistance = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
    // Normalize: 0 = no drag, 1 = dragged across half the screen
    const escapeRatio = Math.min(dragDistance / (width * 0.4), 1.0);

    let bestPosition = positions[0];
    let minScore = Number.MAX_VALUE;

    positions.forEach(pos => {
      const distanceToMagnet = Math.sqrt(Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2));
      let score = distanceToMagnet / pos.pullStrength;

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
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

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

        // Check if it was a tap (very small movement)
        if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) {
          toggleMenu();
        } else {
          // It was a drag/throw

          // Calculate absolute position from start + delta
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

          // Animate X button position with slow spring for smooth slide-through
          const { height: h } = boundsRef.current;
          const targetXPos = bestPos.y > h * 0.35 ? 1 : 0;
          Animated.spring(xPosAnim, {
            toValue: targetXPos,
            tension: 25,
            friction: 9,
            useNativeDriver: false,
          }).start();

          // Async Storage (safe fire-and-forget)
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
      }
    })
  ).current;

  // --- Interpolations ---

  const borderRadius = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [FLOATING_BUTTON_SIZE / 2, 22] // Smoother corner radius
  });

  const menuOpacity = morphAnim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0, 1]
  });

  const menuTranslateY = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0]
  });

  // Vertical shift: smoothly transitions between expand-down (no shift) and expand-up (shift up)
  const verticalShift = Animated.multiply(
    morphAnim,
    xPosAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -(actualExpandedHeight - FLOATING_BUTTON_SIZE)],
    })
  );

  return (
    <>
      {/* Overlay to close menu when clicking outside */}
      {isMenuOpen && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeMenu}
        >
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
      )}

      <Animated.View
        style={[
          styles.container,
          {
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { scale: buttonScale },
              { translateY: verticalShift } // Additional shift for expansion
            ],
            height: currentHeight,
            width: currentWidth,
            borderRadius: borderRadius,
          }
        ]}
        {...panResponder.panHandlers}
      >
        {/* Background Blur */}
        <View style={styles.blurContainer}>
          <BlurView
            intensity={80}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          {/* Fallback dark bg for Android/low-end if blur isn't supported or is transparent */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: 0.7 }]} />
        </View>

        {/* Main Toggle Button (Visible when closed) */}
        <Animated.View style={[
          styles.fabContent,
          {
            opacity: morphAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0] }),
            transform: [
              { scale: morphAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0] }) },
              { rotate: morphAnim.interpolate({ inputRange: [0, 0.5], outputRange: ['0deg', '90deg'] }) }
            ]
          }
        ]}>
          <Ionicons name="apps" size={28} color={colors.textPrimary} />
          {hasNotifications && (
            <View style={styles.mainBadge}>
              <Text style={styles.mainBadgeText}>
                {totalNotifications > 99 ? '99+' : totalNotifications}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Expanded Menu Content */}
        <Animated.View
          style={[
            styles.menuContent,
            {
              opacity: menuOpacity,
              transform: [{ translateY: menuTranslateY }],
            }
            ,
            isMenuOpen ? styles.pointerEventsAuto : styles.pointerEventsNone,
          ]}
          onLayout={(e) => {
            const { height: contentHeight } = e.nativeEvent.layout;
            if (contentHeight > 0 && contentHeight !== measuredContentHeight) {
              setMeasuredContentHeight(contentHeight);
            }
          }}
        >
          <View style={{ width: '100%', height: CONTENT_HEIGHT, alignItems: 'center' }}>
            {/* X/Close Button - slides through items */}
            <Animated.View style={[styles.absoluteSlot, { top: xButtonTopAnim, zIndex: 10 }]}>
              <Pressable
                onPress={toggleMenu}
                style={[styles.menuItem, styles.toggleButton]}
              >
                <Animated.View style={{
                  transform: [{ rotate: morphAnim.interpolate({ inputRange: [0.5, 1], outputRange: ['-90deg', '0deg'] }) }]
                }}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </Animated.View>
              </Pressable>
            </Animated.View>

            {/* Menu Items - each smoothly shifts as X button passes */}
            {activeMenuItems.map((item, index) => {
              const count = notifications[item.id as MenuKey] || 0;
              const isActive = item.matchRoutes.some(
                (matchRoute) => pathname === matchRoute || pathname?.startsWith(`${matchRoute}/`),
              );
              const itemAnim = itemAnims[index];

              const topWhenXAbove = (ITEM_SIZE + MENU_SECTION_GAP) + index * (ITEM_SIZE + MENU_ITEM_GAP);
              const topWhenXBelow = index * (ITEM_SIZE + MENU_ITEM_GAP);
              const itemTop = xPosAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [topWhenXAbove, topWhenXBelow],
              });

              return (
                <Animated.View key={item.id} style={[styles.absoluteSlot, { top: itemTop }]}>
                  <AnimatedPressable
                    style={({ pressed }) => [
                      styles.menuItem,
                      pressed && styles.menuItemPressed,
                      isActive && styles.menuItemActive,
                      {
                        opacity: itemAnim,
                        transform: [
                          { scale: itemAnim },
                          { translateY: itemAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }
                        ]
                      }
                    ]}
                    onPress={() => {
                      router.push(item.route as any);
                      closeMenu();
                    }}
                  >
                    <Ionicons
                      name={item.icon as keyof typeof Ionicons.glyphMap}
                      size={24}
                      color={isActive ? colors.textPrimary : colors.textSecondary}
                    />

                    {count > 0 && (
                      <View style={styles.miniBadge} />
                    )}
                  </AnimatedPressable>
                </Animated.View>
              );
            })}
          </View>
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
        boxShadow: '0px 4px 4.65px rgba(0, 0, 0, 0.3)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
      },
    }),
    elevation: 8,
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
