import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  Animated,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '../../components';
import { Avatar } from '../../components/Avatar';
import { toast } from '../../components/Toast';
import { colors, radius, spacing } from '../../theme';
import { Friend } from './ActivitiesRow';
import { LiveItem } from './LiveSection';
import { useWallet } from '../../context/WalletContext';
import { useLive } from '../../context/LiveContext';
import {
  buildRefuelPendingReceipt,
  IDLE_REFUEL_RECEIPT,
  runRefuelAction,
  type RefuelReceiptState,
} from '../liveroom/refuelFlow';
import { FUEL_COSTS, FuelFillAmount, MAX_FUEL_MINUTES } from '../liveroom/types';
import { hapticTap } from '../../utils/haptics';
import { normalizeImageUri } from '../../utils/imageSource';
import { useAuth as useSessionAuth } from '../../auth/spacetimeSession';
import { buildFailureReceipt } from '../shop/shopReceipts';

// Base screen width for scaling (iPhone 12/13 width)
const BASE_SCREEN_WIDTH = 390;

// Layout constants (will be scaled)
const BASE_HOST_AVATAR_SIZE = 120;
const BASE_VIEWER_AVATAR_SIZE = 38;
const BASE_VIEWER_COUNT_SIZE = 40;
const BASE_AVATAR_OVERLAP = -10;
const FUEL_WIDGET_SIZE = 80;
const JOIN_BUTTON_HEIGHT = 80;
const PREVIEW_ASPECT_RATIO = 4 / 3;
const CARD_BORDER_RADIUS = 40;
const CLOSE_BUTTON_SIZE = 36;
const FUEL_OPTION_STEPS = Object.keys(FUEL_COSTS)
  .map((key) => Number(key) as FuelFillAmount)
  .sort((a, b) => a - b);

// Animation constants
const SPRING_CONFIG = {
  stiffness: 120,
  damping: 14,
  mass: 1,
};

// Premium spring physics for drag (pendulum feel)
const DRAG_SPRING_CONFIG = {
  tension: 40,
  friction: 6,
};

// Swipe threshold to dismiss
const SWIPE_THRESHOLD = 100;

// Gradient colors using theme
const GRADIENT_OVERLAY_COLOR = 'rgba(20, 21, 27, 0.5)';

type FriendLivePreviewSheetProps = {
  visible: boolean;
  onClose: () => void;
  friend: Friend | null;
  live: LiveItem | null;
  otherFriendsInLive?: Friend[];
};

// Grid Image component - simple with error fallback
function GridImage({ uri, name }: { uri: string; name?: string }) {
  const [hasError, setHasError] = useState(false);
  const normalizedUri = normalizeImageUri(uri);

  if (hasError || !normalizedUri) {
    return (
      <View style={gridImageStyles.container}>
        <Ionicons name="videocam-outline" size={20} color={colors.textMuted} />
      </View>
    );
  }

  return (
    <View style={gridImageStyles.container}>
      <Image
        source={{ uri: normalizedUri }}
        style={gridImageStyles.image}
        resizeMode="cover"
        onError={() => setHasError(true)}
        accessibilityLabel={name ? `${name}'s stream` : 'Stream preview'}
      />
    </View>
  );
}

const gridImageStyles = StyleSheet.create({
  container: {
    flex: 1,
    height: '100%',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export function FriendLivePreviewSheet({
  visible,
  onClose,
  friend,
  live,
  otherFriendsInLive = [],
}: FriendLivePreviewSheetProps) {
  const router = useRouter();
  const { userId } = useSessionAuth();
  const { width: screenWidth } = useWindowDimensions();
  const { fuel, gems, cash } = useWallet();
  const { switchLiveRoom } = useLive();
  const isClosingRef = useRef(false);
  const isSwipeDismissRef = useRef(false);
  const [isRefuelSheetVisible, setIsRefuelSheetVisible] = useState(false);
  const [refuelReceipt, setRefuelReceipt] = useState<RefuelReceiptState>(IDLE_REFUEL_RECEIPT);
  const [selectedFuelOptionIndex, setSelectedFuelOptionIndex] = useState(0);
  const [fuelPaymentType, setFuelPaymentType] = useState<'gems' | 'cash'>('gems');

  // Responsive scaling based on screen width
  const scale = useMemo(() => screenWidth / BASE_SCREEN_WIDTH, [screenWidth]);
  
  // Responsive sizes
  const responsiveSizes = useMemo(() => ({
    hostAvatar: Math.round(BASE_HOST_AVATAR_SIZE * scale),
    viewerAvatar: Math.round(BASE_VIEWER_AVATAR_SIZE * scale),
    viewerCount: Math.round(BASE_VIEWER_COUNT_SIZE * scale),
    avatarOverlap: Math.round(BASE_AVATAR_OVERLAP * scale),
  }), [scale]);

  // Responsive card width
  const cardMaxWidth = useMemo(() => {
    return Math.min(400 * scale, screenWidth * 0.9);
  }, [screenWidth, scale]);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  
  // Pan/drag animation values
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  
  // Pan responder for drag and swipe-down-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to significant movement
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        // Store current offset when starting drag
        panX.setOffset((panX as any)._value);
        panY.setOffset((panY as any)._value);
        panX.setValue(0);
        panY.setValue(0);
      },
      onPanResponderMove: Animated.event(
        [null, { dx: panX, dy: panY }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gestureState) => {
        panX.flattenOffset();
        panY.flattenOffset();
        
        // Check if swiped down enough to dismiss
        if (gestureState.dy > SWIPE_THRESHOLD || gestureState.vy > 0.5) {
          // Swipe down to dismiss - fade backdrop smoothly
          isSwipeDismissRef.current = true;
          hapticTap();
          
          // Animate backdrop fade out first
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: false,
          }).start(() => {
            onClose();
          });
        } else {
          // Spring back to center with pendulum physics
          Animated.parallel([
            Animated.spring(panX, {
              toValue: 0,
              ...DRAG_SPRING_CONFIG,
              useNativeDriver: false,
            }),
            Animated.spring(panY, {
              toValue: 0,
              ...DRAG_SPRING_CONFIG,
              useNativeDriver: false,
            }),
          ]).start();
        }
      },
    })
  ).current;

  // Memoized calculations
  const fuelPercentage = useMemo(() => {
    return Math.min((fuel / MAX_FUEL_MINUTES) * 100, 100);
  }, [fuel]);

  const circleCircumference = 100;
  const strokeDashoffset = useMemo(() => {
    return circleCircumference - (fuelPercentage / 100) * circleCircumference;
  }, [fuelPercentage]);
  const selectedFuelAmount = FUEL_OPTION_STEPS[selectedFuelOptionIndex] ?? FUEL_OPTION_STEPS[0];
  const selectedFuelCost = FUEL_COSTS[selectedFuelAmount];
  const selectedFuelPrice = fuelPaymentType === 'gems' ? selectedFuelCost.gems : selectedFuelCost.cash;
  const hasEnoughBalance = fuelPaymentType === 'gems' ? gems >= selectedFuelCost.gems : cash >= selectedFuelCost.cash;
  const isRefuelPending = refuelReceipt.status === 'pending';
  const isRefuelSuccess = refuelReceipt.status === 'success';

  useEffect(() => {
    if (!isRefuelSheetVisible) {
      setRefuelReceipt(IDLE_REFUEL_RECEIPT);
    }
  }, [isRefuelSheetVisible]);

  // Memoized grid layout calculation
  const gridRows = useMemo(() => {
    if (!live || !live.hosts || live.hosts.length === 0) return [];

    const count = live.hosts.length;
    let numRows = 1;
    if (count > 3) numRows = 2;
    if (count > 6) numRows = 3;

    const rows: typeof live.hosts[] = [];
    let hostsProcessed = 0;

    for (let r = 0; r < numRows; r++) {
      const remainingRows = numRows - 1 - r;
      const remainingHosts = count - hostsProcessed;
      const itemsInRow = Math.floor(remainingHosts / (remainingRows + 1));
      const rowHosts = live.hosts.slice(hostsProcessed, hostsProcessed + itemsInRow);
      rows.push(rowHosts);
      hostsProcessed += itemsInRow;
    }

    return rows;
  }, [live?.hosts]);

  // Format viewer count consistently
  const formatViewerCount = useCallback((count: number) => {
    if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B`;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  }, []);

  // Animation handlers (useNativeDriver: false to allow combining with pan)
  const animateIn = useCallback(() => {
    isClosingRef.current = false;
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        ...SPRING_CONFIG,
        useNativeDriver: false,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        ...SPRING_CONFIG,
        useNativeDriver: false,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim, slideAnim]);

  const animateOut = useCallback((callback?: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.timing(slideAnim, {
        toValue: 30,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start(callback);
  }, [fadeAnim, scaleAnim, slideAnim]);

  // Reset and animate when visibility changes
  useEffect(() => {
    if (visible) {
      // Reset all values when opening
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
      slideAnim.setValue(50);
      panX.setValue(0);
      panY.setValue(0);
      isClosingRef.current = false;
      isSwipeDismissRef.current = false;
      setIsRefuelSheetVisible(false);
      animateIn();
    }

    return () => {
      fadeAnim.stopAnimation();
      scaleAnim.stopAnimation();
      slideAnim.stopAnimation();
      panX.stopAnimation();
      panY.stopAnimation();
    };
  }, [visible, friend?.id]);

  const handleClose = useCallback(() => {
    if (isClosingRef.current || isSwipeDismissRef.current) return;
    isClosingRef.current = true;
    hapticTap();
    animateOut(() => {
      isClosingRef.current = false;
      onClose();
    });
  }, [animateOut, onClose]);

  const handleJoin = useCallback(() => {
    hapticTap();
    if (live) {
      const didJoinLive = switchLiveRoom(live);
      if (!didJoinLive) {
        return;
      }
      handleClose();
      router.push({
        pathname: '/live',
        params: { id: live.id },
      });
    }
  }, [live, switchLiveRoom, handleClose, router]);

  const handleAddFuel = useCallback(() => {
    if (fuel >= MAX_FUEL_MINUTES) {
      toast.info('Your fuel tank is already full.');
      return;
    }
    hapticTap();
    setIsRefuelSheetVisible(true);
  }, [fuel]);

  const handleDecreaseFuelPack = useCallback(() => {
    setSelectedFuelOptionIndex((currentIndex) => Math.max(0, currentIndex - 1));
    hapticTap();
  }, []);

  const handleIncreaseFuelPack = useCallback(() => {
    setSelectedFuelOptionIndex((currentIndex) =>
      Math.min(FUEL_OPTION_STEPS.length - 1, currentIndex + 1),
    );
    hapticTap();
  }, []);

  const handleConfirmRefuel = useCallback(async () => {
    if (isRefuelPending) {
      return;
    }

    if (isRefuelSuccess) {
      setIsRefuelSheetVisible(false);
      return;
    }

    if (fuel >= MAX_FUEL_MINUTES) {
      setRefuelReceipt(buildFailureReceipt('purchase_fuel', 'Your fuel tank is already full.'));
      return;
    }

    if (!hasEnoughBalance) {
      setRefuelReceipt(
        buildFailureReceipt(
          'purchase_fuel',
          `You need ${selectedFuelPrice} ${fuelPaymentType === 'gems' ? 'Gems' : 'Cash'} to buy this fuel pack.`,
        ),
      );
      return;
    }

    if (!userId) {
      setRefuelReceipt(buildFailureReceipt('purchase_fuel', 'Sign in required to refuel.'));
      return;
    }

    setRefuelReceipt(buildRefuelPendingReceipt(selectedFuelAmount));
    const nextReceipt = await runRefuelAction({
      userId,
      amount: selectedFuelAmount,
      paymentType: fuelPaymentType,
      source: 'friend_live_preview_refuel',
    });
    setRefuelReceipt(nextReceipt);
    hapticTap();
  }, [
    fuel,
    fuelPaymentType,
    hasEnoughBalance,
    isRefuelPending,
    isRefuelSuccess,
    selectedFuelAmount,
    selectedFuelPrice,
    userId,
  ]);
  const cardPanHandlers = isRefuelSheetVisible ? {} : panResponder.panHandlers;

  // Early return with proper error state
  if (!friend || !live) {
    return null;
  }

  const viewerCount = live.viewers || 0;
  const mutualFriendsInLive = otherFriendsInLive.filter((otherFriend) => otherFriend.id !== friend.id);
  const displayedFriends = mutualFriendsInLive.slice(0, 3);
  const remainingMutualFriendsCount = Math.max(mutualFriendsInLive.length - displayedFriends.length, 0);
  const hasMutualFriendsInLive = displayedFriends.length > 0;
  const hasHosts = gridRows.length > 0;

  // Check if friend is hosting or watching based on their status (consistent with ActivitiesRow)
  const isFriendHosting = friend.status === 'live';

  // Truncate long names
  const displayName = friend.name.length > 20 
    ? friend.name.slice(0, 18) + '...' 
    : friend.name;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlayContainer}>
        {/* Backdrop - simple dark overlay without BlurView to avoid flash */}
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }, styles.pointerEventsNone]}>
        </Animated.View>
        
        {/* Backdrop tap area */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            accessibilityLabel="Close preview"
            accessibilityRole="button"
          />
        </Animated.View>

        
        {/* Main Card */}
        <Animated.View
          {...cardPanHandlers}
          style={[
            styles.card,
            {
              width: cardMaxWidth,
              opacity: fadeAnim,
              transform: [
                { scale: scaleAnim },
                { translateX: panX },
                { translateY: Animated.add(slideAnim, panY) },
              ],
            },
          ]}
          accessibilityLabel={`${friend.name} is live`}
        >
          {/* Close Button */}
          <Pressable
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
            ]}
            onPress={handleClose}
            accessibilityLabel="Close"
            accessibilityRole="button"
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>

          {/* Header Area */}
          <View style={styles.headerArea}>
            {/* Host Avatar Section */}
            <View style={styles.hostAvatarSection}>
              <View style={[styles.hostAvatarWrapper, { width: responsiveSizes.hostAvatar, height: responsiveSizes.hostAvatar }]}>
                <Avatar
                  uri={friend.imageUrl}
                  name={friend.name}
                  customSize={responsiveSizes.hostAvatar}
                  borderColor={isFriendHosting ? colors.accentDanger : '#0052FF'}
                  borderWidth={4}
                  accessibilityLabel={`${friend.name}'s profile picture`}
                />
                {/* Badge */}
                <View style={[
                  styles.liveBadge,
                  !isFriendHosting && styles.watchingBadge
                ]}>
                  <AppText variant="tiny" style={styles.liveBadgeText}>
                    {isFriendHosting ? 'LIVE' : 'WATCHING'}
                  </AppText>
                </View>
              </View>
            </View>

            {/* Mutual friends currently in this live */}
            {hasMutualFriendsInLive && (
              <View style={styles.topRightViewers}>
                <View style={styles.viewersPill}>
                  <View style={styles.viewersAvatars}>
                    {displayedFriends.map((f, index) => (
                      <View
                        key={f.id}
                        style={[
                          styles.viewerAvatarContainer,
                          { 
                            borderRadius: responsiveSizes.viewerAvatar / 2,
                            marginLeft: index > 0 ? responsiveSizes.avatarOverlap : 0,
                            zIndex: 40 - index * 10,
                          },
                        ]}
                      >
                        <Avatar
                          uri={f.imageUrl}
                          name={f.name}
                          customSize={responsiveSizes.viewerAvatar}
                          borderColor="#0052FF"
                          borderWidth={2}
                        />
                      </View>
                    ))}
                    {/* Overflow count badge */}
                    {remainingMutualFriendsCount > 0 && (
                      <View
                        style={[
                          styles.viewerCountBadge,
                          {
                            width: responsiveSizes.viewerCount,
                            height: responsiveSizes.viewerCount,
                            borderRadius: responsiveSizes.viewerCount / 2,
                            marginLeft: displayedFriends.length > 0 ? responsiveSizes.avatarOverlap : 0,
                          },
                        ]}
                      >
                        <AppText variant="tiny" style={styles.viewerCountText}>
                          +{remainingMutualFriendsCount}
                        </AppText>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Title */}
          <View style={styles.titleContainer}>
            <AppText
              variant="h1"
              style={styles.mainTitle}
              accessibilityRole="header"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {displayName} is {isFriendHosting ? 'live!' : 'watching'}
            </AppText>
          </View>

          {/* Stream Preview Grid */}
          <View style={styles.previewContainer}>
            <View style={styles.previewWrapper}>
              {hasHosts ? (
                <View style={styles.universalGrid}>
                  {gridRows.map((rowHosts, rowIndex) => (
                    <View key={`row-${rowIndex}`} style={styles.gridRow}>
                      {rowHosts.map((host, colIndex) => (
                        <GridImage
                          key={host.name || `host-${colIndex}`}
                          uri={host.avatar}
                          name={host.name}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              ) : (
                /* Empty state placeholder */
                <View style={styles.emptyGridState}>
                  <Ionicons name="videocam-outline" size={48} color={colors.textMuted} />
                  <AppText variant="small" style={styles.emptyGridText}>
                    Stream starting...
                  </AppText>
                </View>
              )}

              {/* Gradient Overlay */}
              <LinearGradient
                colors={['transparent', 'transparent', GRADIENT_OVERLAY_COLOR]}
                style={[StyleSheet.absoluteFill, styles.pointerEventsNone]}
                locations={[0, 0.6, 1]}
              />

              {/* Viewer Count Badge - only show if viewers > 0 */}
              {viewerCount > 0 && (
                <View style={styles.previewViewerBadge}>
                  <View style={styles.previewStatsPill}>
                    <Ionicons name="eye-outline" size={14} color={colors.textSecondary} />
                    <AppText variant="small" style={styles.previewStatsText}>
                      {formatViewerCount(viewerCount)}
                    </AppText>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Footer Actions */}
          <View style={styles.footer}>
            {/* Fuel Widget with pressed state */}
            <Pressable
              style={({ pressed }) => [
                styles.fuelWidget,
                pressed && styles.fuelWidgetPressed,
              ]}
              onPress={handleAddFuel}
              accessibilityLabel={`Fuel at ${Math.round(fuelPercentage)}%. Tap to add more.`}
              accessibilityRole="button"
            >
              <View style={styles.fuelProgress}>
                <Svg
                  width={FUEL_WIDGET_SIZE * 0.5}
                  height={FUEL_WIDGET_SIZE * 0.5}
                  viewBox="0 0 36 36"
                  style={styles.fuelSvg}
                >
                  <Path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke={colors.surfaceAlt}
                    strokeWidth="3"
                  />
                  <Path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke={colors.accentPremium}
                    strokeDasharray={`${circleCircumference}, 100`}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    strokeWidth="3"
                  />
                </Svg>
                <View style={styles.fuelIconContainer}>
                  <Ionicons name="flash" size={16} color={colors.accentPremium} />
                </View>
              </View>
              <AppText variant="tiny" style={styles.fuelPercentText}>
                {Math.round(fuelPercentage)}%
              </AppText>
              <View style={styles.fuelAddButton}>
                <Ionicons name="add" size={14} color="white" />
              </View>
            </Pressable>

            {/* Join Button */}
            <Pressable
              style={({ pressed }) => [
                styles.joinButton,
                pressed && styles.joinButtonPressed,
              ]}
              onPress={handleJoin}
              accessibilityLabel={`Join ${friend.name}'s live stream`}
              accessibilityRole="button"
            >
              <View style={styles.joinButtonContent}>
                <AppText style={styles.joinButtonText}>Join Live</AppText>
                <Ionicons name="arrow-forward" size={20} color="white" />
              </View>
            </Pressable>
          </View>

          {isRefuelSheetVisible && (
            <View style={styles.refuelOverlay}>
              <Pressable
                style={styles.refuelOverlayBackdrop}
                onPress={isRefuelPending ? undefined : () => setIsRefuelSheetVisible(false)}
              />
              <View style={styles.refuelSheet}>
                <AppText style={styles.refuelTitle}>Refuel Before Joining</AppText>
                <AppText style={styles.refuelSubtitle}>
                  Pick your fuel pack without leaving this live preview.
                </AppText>

                {refuelReceipt.status !== 'idle' ? (
                  <View
                    style={[
                      styles.refuelStatusCard,
                      refuelReceipt.status === 'success'
                        ? styles.refuelStatusCardSuccess
                        : refuelReceipt.status === 'failure'
                          ? styles.refuelStatusCardFailure
                          : styles.refuelStatusCardPending,
                    ]}
                  >
                    <AppText style={styles.refuelStatusTitle}>{refuelReceipt.title}</AppText>
                    <AppText style={styles.refuelStatusMessage}>{refuelReceipt.message}</AppText>
                    {refuelReceipt.balanceAfter ? (
                      <AppText style={styles.refuelStatusBalance}>
                        Wallet now: {refuelReceipt.balanceAfter.gems} Gems • {refuelReceipt.balanceAfter.cash} Cash • {refuelReceipt.balanceAfter.fuel}m Fuel
                      </AppText>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.refuelPaymentRow}>
                  <Pressable
                    style={[
                      styles.refuelPaymentChip,
                      fuelPaymentType === 'gems' && styles.refuelPaymentChipActive,
                    ]}
                    onPress={() => setFuelPaymentType('gems')}
                    disabled={isRefuelPending || isRefuelSuccess}
                  >
                    <AppText
                      style={[
                        styles.refuelPaymentText,
                        fuelPaymentType === 'gems' && styles.refuelPaymentTextActive,
                      ]}
                    >
                      Gems ({gems})
                    </AppText>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.refuelPaymentChip,
                      fuelPaymentType === 'cash' && styles.refuelPaymentChipActive,
                    ]}
                    onPress={() => setFuelPaymentType('cash')}
                    disabled={isRefuelPending || isRefuelSuccess}
                  >
                    <AppText
                      style={[
                        styles.refuelPaymentText,
                        fuelPaymentType === 'cash' && styles.refuelPaymentTextActive,
                      ]}
                    >
                      Cash ({cash})
                    </AppText>
                  </Pressable>
                </View>

                <View style={styles.refuelAmountRow}>
                  <Pressable
                    style={[
                      styles.refuelStepButton,
                      selectedFuelOptionIndex === 0 && styles.refuelStepButtonDisabled,
                    ]}
                    onPress={handleDecreaseFuelPack}
                    disabled={selectedFuelOptionIndex === 0 || isRefuelPending || isRefuelSuccess}
                  >
                    <Ionicons name="remove" size={18} color={colors.textPrimary} />
                  </Pressable>

                  <View style={styles.refuelAmountPill}>
                    <AppText style={styles.refuelAmountValue}>{selectedFuelAmount}m</AppText>
                    <AppText style={styles.refuelAmountMeta}>Fuel pack</AppText>
                  </View>

                  <Pressable
                    style={[
                      styles.refuelStepButton,
                      selectedFuelOptionIndex === FUEL_OPTION_STEPS.length - 1 &&
                        styles.refuelStepButtonDisabled,
                    ]}
                    onPress={handleIncreaseFuelPack}
                    disabled={selectedFuelOptionIndex === FUEL_OPTION_STEPS.length - 1 || isRefuelPending || isRefuelSuccess}
                  >
                    <Ionicons name="add" size={18} color={colors.textPrimary} />
                  </Pressable>
                </View>

                <View style={styles.refuelDetailsRow}>
                  <AppText style={styles.refuelCostText}>
                    Cost: {selectedFuelPrice} {fuelPaymentType === 'gems' ? 'Gems' : 'Cash'}
                  </AppText>
                  <AppText style={styles.refuelTankText}>
                    Tank after: {Math.min(fuel + selectedFuelAmount, MAX_FUEL_MINUTES)}m
                  </AppText>
                </View>

                <Pressable
                  style={[
                    styles.refuelConfirmButton,
                    isRefuelPending || (!hasEnoughBalance && !isRefuelSuccess)
                      ? styles.refuelConfirmButtonDisabled
                      : null,
                  ]}
                  onPress={handleConfirmRefuel}
                  disabled={isRefuelPending || (!hasEnoughBalance && !isRefuelSuccess)}
                >
                  <AppText style={styles.refuelConfirmButtonText}>
                    {isRefuelPending
                      ? 'Processing...'
                      : isRefuelSuccess
                        ? 'Done'
                        : 'Add Fuel'}
                  </AppText>
                </Pressable>
              </View>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  pointerEventsNone: {
    pointerEvents: 'none',
  },
  glowContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  glowTopRight: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: colors.accentPrimary,
    opacity: 0.12,
    transform: [{ scale: 1.5 }],
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: -50,
    left: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: colors.accentPremium,
    opacity: 0.08,
    transform: [{ scale: 1.5 }],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: CLOSE_BUTTON_SIZE,
    height: CLOSE_BUTTON_SIZE,
    borderRadius: CLOSE_BUTTON_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  closeButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    transform: [{ scale: 0.95 }],
  },
  headerArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: spacing.xl + spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    overflow: 'visible',
    width: '100%',
  },
  hostAvatarSection: {
    overflow: 'visible',
  },
  hostAvatarWrapper: {
    overflow: 'visible',
  },
  liveBadge: {
    position: 'absolute',
    bottom: -8,
    right: -4,
    backgroundColor: colors.accentDanger,
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: radius.full,
    transform: [{ rotate: '3deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  liveBadgeText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
  },
  watchingBadge: {
    backgroundColor: '#0052FF',
  },
  topRightViewers: {
    alignSelf: 'flex-end',
    marginBottom: spacing.sm,
  },
  viewersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  viewersAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerAvatarContainer: {
    borderRadius: BASE_VIEWER_AVATAR_SIZE / 2,
  },
  viewerAvatarOverlap: {
    marginLeft: BASE_AVATAR_OVERLAP,
  },
  viewerCountBadge: {
    backgroundColor: '#0052FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCountText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'white',
  },
  titleContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  previewContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  previewWrapper: {
    width: '100%',
    aspectRatio: PREVIEW_ASPECT_RATIO,
    borderRadius: spacing.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    position: 'relative',
  },
  universalGrid: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.accentDanger,
    gap: 2,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 2,
  },
  emptyGridState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    gap: spacing.sm,
  },
  emptyGridText: {
    color: colors.textMuted,
  },
  previewViewerBadge: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
  },
  previewStatsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  previewStatsText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    marginTop: spacing.xs,
  },
  fuelWidget: {
    position: 'relative',
    width: FUEL_WIDGET_SIZE,
    height: FUEL_WIDGET_SIZE,
    backgroundColor: colors.background,
    borderRadius: FUEL_WIDGET_SIZE / 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fuelWidgetPressed: {
    backgroundColor: colors.surfaceAlt,
    transform: [{ scale: 0.96 }],
  },
  fuelProgress: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  fuelSvg: {
    transform: [{ rotate: '-90deg' }],
  },
  fuelIconContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fuelPercentText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  fuelAddButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  joinButton: {
    flex: 1,
    height: JOIN_BUTTON_HEIGHT,
    borderRadius: JOIN_BUTTON_HEIGHT / 2,
    backgroundColor: colors.accentDanger,
    shadowColor: colors.accentDanger,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  joinButtonPressed: {
    backgroundColor: colors.accentDanger,
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  joinButtonContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  joinButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    letterSpacing: 0.3,
  },
  refuelOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 220,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: CARD_BORDER_RADIUS,
    overflow: 'hidden',
  },
  refuelOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 9, 14, 0.72)',
  },
  refuelSheet: {
    width: '86%',
    backgroundColor: 'rgba(25, 28, 42, 0.98)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: spacing.lg,
    gap: spacing.md,
  },
  refuelTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  refuelSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  refuelStatusCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  refuelStatusCardPending: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  refuelStatusCardSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.28)',
  },
  refuelStatusCardFailure: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  refuelStatusTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  refuelStatusMessage: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  refuelStatusBalance: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  refuelPaymentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  refuelPaymentChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  refuelPaymentChipActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  refuelPaymentText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  refuelPaymentTextActive: {
    color: colors.textPrimary,
  },
  refuelAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  refuelStepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refuelStepButtonDisabled: {
    opacity: 0.4,
  },
  refuelAmountPill: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingVertical: 10,
  },
  refuelAmountValue: {
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '900',
  },
  refuelAmountMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  refuelDetailsRow: {
    gap: 4,
  },
  refuelCostText: {
    fontSize: 13,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  refuelTankText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  refuelConfirmButton: {
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentPremium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refuelConfirmButtonDisabled: {
    opacity: 0.5,
  },
  refuelConfirmButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
});
