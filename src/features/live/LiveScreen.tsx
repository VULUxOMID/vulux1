import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, 
  StyleSheet, 
  Dimensions, 
  Animated, 
  PanResponder,
  Platform,
  GestureResponderEvent,
  PanResponderGestureState,
  Keyboard,
  Modal,
  Pressable,
  Image,
  TextInput,
  FlatList,
  ScrollView,
} from 'react-native';
import { Redirect, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../auth/spacetimeSession';
import { useIsFocused } from '@react-navigation/native';

import { useLive } from '../../context/LiveContext';
import { useProfile } from '../../context/ProfileContext';
import { useWallet } from '../../context/WalletContext';
import { useRepositories } from '../../data/provider';
import { AppButton, AppScreen, AppText } from '../../components';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import type { LiveLeaderboardEntry, SocialUser } from '../../data/contracts';
import { colors, radius, spacing } from '../../theme';
import { hapticTap, hapticImpact, hapticWarn } from '../../utils/haptics';
import { toast } from '../../components/Toast';
import type { BoostMultiplier, FuelFillAmount, LiveUser } from '../liveroom/types';
import { BOOST_COSTS, MAX_FUEL_MINUTES } from '../liveroom/types';
import * as ImagePicker from 'expo-image-picker';
import {
  LiveTopBar,
  StreamersDisplay,
  LiveChat,
  LiveInputBar,
  ParticipantsDrawer,
  UnifiedBoostSheet,
  BoostCountdownBanner,
  FuelSheet,
  KickConfirmModal,
  EndLiveModal,
  LiveEndedScreen,
  ProfileViewsModal,
  BoostButton,
  InviteToStreamModal,
} from '../liveroom/components';
import { ProfileModal } from '../../components/ProfileModal';
import { LiveItem } from '../home/LiveSection';
import { MiniHostsGrid } from './components/MiniHostsGrid';
import { requestBackendRefresh } from '../../data/adapters/backend/refreshBus';
import { useAppIsActive } from '../../hooks/useAppIsActive';
import { spacetimeDb, subscribeLive, subscribeSpacetimeDataChanges } from '../../lib/spacetime';
import {
  publishLiveHostRequest,
  publishLiveHostRequestResponse,
  publishLiveInvite,
  publishLiveInviteResponse,
} from '../../utils/spacetimePersistence';
import {
  blurActiveWebElement,
  lockPortraitOrientationSafely,
  unlockOrientationSafely,
} from '../../utils/webRuntimeCompat';
import { purchaseFuelPack } from '../../data/adapters/backend/walletMutations';
import { submitReport } from '../reports/reportingClient';
import {
  type LiveControlEvent,
  derivePendingHostInviteIds,
  derivePendingHostRequestIds,
  parseLiveControlEvents,
} from './liveControlEvents';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const EDGE_THRESHOLD = SCREEN_WIDTH * 0.33;

// Single enum replaces ~10 boolean modal toggles
type ActiveSheet =
  | null
  | 'participants'
  | 'boost'
  | 'fuel'
  | 'profileViews'
  | 'kickConfirm'
  | 'switchLive'
  | 'exitLive'
  | 'inviteToStream'
  | 'hostOptions';  // Unified: Settings + Report + Invite

type HostOptionsTab = 'settings' | 'report' | 'invite';

// Height of input bar area (input row + padding)
const INPUT_BAR_HEIGHT = 60;
const HOST_OPTIONS_SETTINGS_MIN_HEIGHT_RATIO = 0.72;

const BOOST_DURATION = 60; // 60 seconds total boost time

function makeFallbackLiveUser(userId: string, preferredName?: string): LiveUser {
  const normalizedName = preferredName?.trim() || userId;
  return {
    id: userId,
    name: normalizedName,
    username: normalizedName,
    age: 0,
    country: '',
    bio: '',
    verified: false,
    avatarUrl: '',
  };
}

function formatLiveParticipantLabel(
  user: LiveUser | null,
  fallbackUserId: string | null,
  fallbackPrefix: string,
): string {
  const normalizedName = user?.name?.trim();
  if (normalizedName) {
    return normalizedName;
  }
  if (fallbackUserId) {
    return `${fallbackPrefix} ${fallbackUserId.slice(0, 8)}`;
  }
  return fallbackPrefix;
}

export default function LiveScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const params = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { userId, isLoaded: isAuthLoaded, isSignedIn, hasSession } = useAuth();
  const routeLiveId = typeof params.id === 'string' ? params.id.trim() : '';
  const { live: liveRepo, social: socialRepo } = useRepositories();
  const [liveDataRefreshNonce, setLiveDataRefreshNonce] = useState(0);
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isFocused && isAppActive;
  const lives = useMemo<LiveItem[]>(
    () => (queriesEnabled ? liveRepo.listLives({ limit: 120 }) : []),
    [liveDataRefreshNonce, liveRepo, queriesEnabled],
  );
  const liveLeaderboard = useMemo<LiveLeaderboardEntry[]>(
    () => (queriesEnabled ? liveRepo.listBoostLeaderboard({ limit: 100 }) : []),
    [liveDataRefreshNonce, liveRepo, queriesEnabled],
  );
  const knownLiveUsers = useMemo<LiveUser[]>(
    () => (queriesEnabled ? liveRepo.listKnownLiveUsers({ limit: 200 }) : []),
    [liveDataRefreshNonce, liveRepo, queriesEnabled],
  );
  const inviteCandidates = useMemo<SocialUser[]>(
    () => (queriesEnabled ? socialRepo.listUsers({ limit: 300 }) : []),
    [queriesEnabled, socialRepo],
  );
  const { selectedUser, showProfile } = useProfile();
  const {
    gems: userGems,
    cash: userCash,
    fuel,
    spendCash,
  } = useWallet();
  const {
    activeLive,
    liveRoom,
    liveState,
    isLiveEnding,
    liveEndDeadlineMs,
    isHost,
    minimizeLive,
    leaveLive,
    endLive,
    sendMessage,
    kickStreamer,
    banUser,
    unbanUser,
    boostLive,
    resetBoost,
    switchLiveRoom,
    toggleMic,
    currentUser,
    setTitle,
  } = useLive();
  const currentLiveId = liveRoom?.id ?? activeLive?.id;
  const subscriptionLiveId = liveRoom?.id ?? activeLive?.id ?? routeLiveId;
  const isProfileOpen = useRef(false);
  const isSheetOpen = useRef(false);
  const autoJoinAttemptedLiveIdRef = useRef<string | null>(null);
  const hasVisitedLiveSessionRef = useRef(false);
  const hasHandledClosedNavigationRef = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardAnimatedHeight = useRef(new Animated.Value(0)).current;

  // Lock orientation to portrait when screen mounts
  useEffect(() => {
    void lockPortraitOrientationSafely();
    
    return () => {
      // Unlock when leaving the screen
      void unlockOrientationSafely();
    };
  }, []);

  useEffect(() => {
    if (!queriesEnabled) return;
    requestBackendRefresh();
  }, [queriesEnabled]);

  useEffect(() => {
    if (!queriesEnabled || !subscriptionLiveId) {
      return;
    }
    return subscribeLive(subscriptionLiveId);
  }, [queriesEnabled, subscriptionLiveId]);

  useEffect(() => {
    if (!queriesEnabled || !subscriptionLiveId) {
      return;
    }
    return subscribeSpacetimeDataChanges((event) => {
      if (!event.scopes.includes('live')) {
        return;
      }
      setLiveDataRefreshNonce((current) => current + 1);
    });
  }, [queriesEnabled, subscriptionLiveId]);

  // Track profile open state in ref for pan responder
  useEffect(() => {
    isProfileOpen.current = !!selectedUser;
    if (selectedUser) {
      Keyboard.dismiss();
      blurActiveWebElement();
    }
  }, [selectedUser]);

  // Keyboard listeners with animated value for smooth transitions
  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const height = e.endCoordinates.height;
        setKeyboardHeight(height);
        Animated.timing(keyboardAnimatedHeight, {
          toValue: height,
          duration: Platform.OS === 'ios' ? e.duration : 250,
          useNativeDriver: false,
        }).start();
      }
    );
    
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        setKeyboardHeight(0);
        Animated.timing(keyboardAnimatedHeight, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? e.duration : 250,
          useNativeDriver: false,
        }).start();
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const [liveEndSecondsLeft, setLiveEndSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (activeLive && liveRoom) {
      hasVisitedLiveSessionRef.current = true;
      hasHandledClosedNavigationRef.current = false;
    }
  }, [activeLive, liveRoom]);

  useEffect(() => {
    if (!isLiveEnding || !liveEndDeadlineMs) {
      setLiveEndSecondsLeft(null);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = liveEndDeadlineMs - Date.now();
      setLiveEndSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 250);
    return () => clearInterval(timer);
  }, [isLiveEnding, liveEndDeadlineMs]);

  const sendLiveInvite = useCallback(
    async (targetUserId: string): Promise<boolean> => {
      const currentLiveId = liveRoom?.id ?? activeLive?.id;
      if (!currentLiveId || !isAuthLoaded || !isSignedIn) {
        return false;
      }

      try {
        await publishLiveInvite({
          liveId: currentLiveId,
          targetUserId,
        });
        return true;
      } catch (error) {
        if (__DEV__) {
          console.warn('[live] Failed to send invite', error);
        }
        return false;
      }
    },
    [
      activeLive?.id,
      isAuthLoaded,
      isSignedIn,
      liveRoom?.id,
    ],
  );

  // Initialize live stream from route parameters.
  // Important: only auto-join once per route liveId. If user is banned and later unbanned,
  // they should choose to rejoin manually instead of being auto-teleported back in.
  useEffect(() => {
    if (!routeLiveId) {
      autoJoinAttemptedLiveIdRef.current = null;
      return;
    }
    if (activeLive) return;
    if (autoJoinAttemptedLiveIdRef.current === routeLiveId) return;

    const live =
      lives.find((item) => item.id === routeLiveId) ??
      liveRepo.findLiveById(routeLiveId);
    if (!live) return;

    const joined = switchLiveRoom(live);
    if (joined) {
      autoJoinAttemptedLiveIdRef.current = routeLiveId;
    }
  }, [activeLive, lives, liveRepo, routeLiveId, switchLiveRoom]);

  // Keep explicit /live?id routes stable. Closed-room handling is rendered in-place
  // so reconnect/open loops don't immediately bounce back to Home.

  // UI State — single sheet controller replaces ~10 booleans
  const [activeSheet, setActiveSheetState] = useState<ActiveSheet>(null);
  const setActiveSheet = useCallback((nextSheet: ActiveSheet) => {
    if (nextSheet !== null) {
      Keyboard.dismiss();
      blurActiveWebElement();
    }
    setActiveSheetState(nextSheet);
  }, []);
  const [boostSheetTab, setBoostSheetTab] = useState<'boost' | 'league'>('boost');
  const [hostOptionsTab, setHostOptionsTab] = useState<HostOptionsTab>('settings');
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteFocused, setInviteFocused] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [reportStep, setReportStep] = useState<1 | 2>(1);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [reportScreenshot, setReportScreenshot] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [userToKick, setUserToKick] = useState<LiveUser | null>(null);
  const [nextLiveId, setNextLiveId] = useState<string | null>(null);
  const [pendingInviteUser, setPendingInviteUser] = useState<LiveUser | null>(null);
  const [isRespondingToHostRequest, setIsRespondingToHostRequest] = useState(false);
  const [isRespondingToHostInvite, setIsRespondingToHostInvite] = useState(false);
  const filteredInviteCandidates = useMemo(() => {
    const query = inviteQuery.trim().toLowerCase();
    if (!query) return inviteCandidates;
    return inviteCandidates.filter((friend) => {
      const name = friend.username.toLowerCase();
      const handle = friend.id.toLowerCase();
      return name.includes(query) || handle.includes(query);
    });
  }, [inviteCandidates, inviteQuery]);

  const bannedUsers = useMemo(() => {
    if (!liveRoom) return [];
    const bannedMap = new Map<string, LiveUser>();

    (liveRoom.bannedUsers || []).forEach((user) => {
      bannedMap.set(user.id, user);
    });

    const pool = [...liveRoom.streamers, ...liveRoom.watchers, ...knownLiveUsers];
    const poolMap = new Map(pool.map((user) => [user.id, user]));
    (liveRoom.bannedUserIds || []).forEach((id) => {
      if (!bannedMap.has(id)) {
        const resolvedUser = poolMap.get(id);
        bannedMap.set(
          id,
          resolvedUser || {
            id,
            name: id,
            username: id,
            age: 0,
            country: '',
            bio: '',
            avatarUrl: '',
          },
        );
      }
    });

    return Array.from(bannedMap.values());
  }, [knownLiveUsers, liveRoom]);

  const liveUserDirectory = useMemo(() => {
    const entries = new Map<string, LiveUser>();
    [liveRoom?.hostUser, ...(liveRoom?.streamers ?? []), ...(liveRoom?.watchers ?? []), ...knownLiveUsers]
      .filter((entry): entry is LiveUser => Boolean(entry))
      .forEach((entry) => entries.set(entry.id, entry));
    return entries;
  }, [knownLiveUsers, liveRoom?.hostUser, liveRoom?.streamers, liveRoom?.watchers]);

  const liveControlEvents = useMemo<LiveControlEvent[]>(() => {
    if (!currentLiveId) return [];

    const dbView = spacetimeDb.db as any;
    const rows: any[] = Array.from(
      dbView?.globalMessageItem?.iter?.() ??
      dbView?.global_message_item?.iter?.() ??
      [],
    );
    return parseLiveControlEvents(rows, currentLiveId);
  }, [currentLiveId, liveDataRefreshNonce]);

  const pendingHostRequestIds = useMemo(
    () => derivePendingHostRequestIds(liveControlEvents),
    [liveControlEvents],
  );

  const pendingHostInviteIds = useMemo(
    () => derivePendingHostInviteIds(liveControlEvents),
    [liveControlEvents],
  );

  const pendingHostRequestUserId = useMemo(() => {
    if (!isHost || pendingHostRequestIds.length === 0) return null;

    const streamerIds = new Set((liveRoom?.streamers ?? []).map((streamer) => streamer.id));
    const bannedIds = new Set(liveRoom?.bannedUserIds ?? []);
    const candidateId = pendingHostRequestIds.find(
      (userId) => !streamerIds.has(userId) && !bannedIds.has(userId),
    );
    if (!candidateId) return null;

    return candidateId;
  }, [
    isHost,
    liveRoom?.bannedUserIds,
    liveRoom?.streamers,
    pendingHostRequestIds,
  ]);

  const pendingHostRequestUser = useMemo(() => {
    if (!pendingHostRequestUserId) return null;
    return (
      liveUserDirectory.get(pendingHostRequestUserId) ??
      makeFallbackLiveUser(pendingHostRequestUserId)
    );
  }, [liveUserDirectory, pendingHostRequestUserId]);

  const hasPendingHostInvite = useMemo(() => {
    if (isHost || !userId) return false;
    return pendingHostInviteIds.includes(userId);
  }, [isHost, pendingHostInviteIds, userId]);

  const pendingInviteHostUserId = useMemo(() => {
    if (!hasPendingHostInvite) return null;
    return liveRoom?.hostUser?.id ?? null;
  }, [hasPendingHostInvite, liveRoom?.hostUser?.id]);

  const pendingInviteHostUser = useMemo(() => {
    if (!hasPendingHostInvite || !liveRoom) return null;
    if (liveRoom.hostUser) return liveRoom.hostUser;
    if (!pendingInviteHostUserId) return null;
    return makeFallbackLiveUser(pendingInviteHostUserId);
  }, [hasPendingHostInvite, liveRoom, pendingInviteHostUserId]);

  const canRespondToHostRequest = useMemo(() => {
    if (!pendingHostRequestUserId) return false;
    return isHost || (Boolean(userId) && liveRoom?.hostUser?.id === userId);
  }, [isHost, liveRoom?.hostUser?.id, pendingHostRequestUserId, userId]);

  const pendingHostRequestDisplayName = useMemo(
    () => formatLiveParticipantLabel(pendingHostRequestUser, pendingHostRequestUserId, 'Viewer'),
    [pendingHostRequestUser, pendingHostRequestUserId],
  );
  const pendingHostInviteDisplayName = useMemo(
    () => formatLiveParticipantLabel(pendingInviteHostUser, pendingInviteHostUserId, 'Host'),
    [pendingInviteHostUser, pendingInviteHostUserId],
  );

  // Fuel state (Premium GemPlus)
  // const [fuelMinutes, setFuelMinutes] = useState(45); // Replaced with global context
  
  // Track any sheet open state in ref for pan responder
  useEffect(() => {
    isSheetOpen.current = activeSheet !== null;
  }, [activeSheet]);

  useEffect(() => {
    if (activeSheet === 'hostOptions' && hostOptionsTab === 'settings' && liveRoom) {
      setTitleDraft(liveRoom.title);
    }
  }, [activeSheet, hostOptionsTab, liveRoom]);

  useEffect(() => {
    if (!isHost && activeSheet === 'hostOptions') {
      setActiveSheet(null);
    }
  }, [isHost, activeSheet]);
  
  // Speaking state (in production this comes from audio detection)
  const [speakingUserIds, setSpeakingUserIds] = useState<string[]>([]);
  // Boost state
  const [isBoosting, setIsBoosting] = useState(false);
  const [currentBoostAmount, setCurrentBoostAmount] = useState(0);
  // Boost timer state
  const [boostTimeLeft, setBoostTimeLeft] = useState(0);
  
  // Local speaking simulation - randomly toggle speaking for demo
  useEffect(() => {
    if (!liveRoom) return;
    
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const interval = setInterval(() => {
      // Randomly pick a streamer to be "speaking"
      const streamers = liveRoom.streamers;
      if (streamers.length > 0) {
        const randomIndex = Math.floor(Math.random() * streamers.length);
        const speakerId = streamers[randomIndex].id;
        setSpeakingUserIds([speakerId]);
        
        // Clear after a bit - track timeout for cleanup
        timeoutId = setTimeout(() => {
          setSpeakingUserIds([]);
        }, 1500);
      }
    }, 3000);
    
    return () => {
      clearInterval(interval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [liveRoom]);

  // Countdown timer
  useEffect(() => {
    if (boostTimeLeft <= 0) return;

    const timer = setInterval(() => {
      setBoostTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [boostTimeLeft]);

  // Handle boost expiration when timer hits 0
  const prevBoostTimeRef = useRef(boostTimeLeft);
  useEffect(() => {
    // Only trigger when transitioning from > 0 to 0
    if (prevBoostTimeRef.current > 0 && boostTimeLeft === 0) {
      hapticImpact('heavy'); // Alert haptic when boost dies
      resetBoost();
    }
    prevBoostTimeRef.current = boostTimeLeft;
  }, [boostTimeLeft, resetBoost]);

  // Reset boost-local UI state when switching between live rooms so timers do not leak across rooms.
  useEffect(() => {
    setBoostTimeLeft(0);
    setIsBoosting(false);
    setCurrentBoostAmount(0);
    prevBoostTimeRef.current = 0;
  }, [liveRoom?.id]);

  // Animation for swipe-down to minimize
  const pan = useRef(new Animated.ValueXY()).current;
  
  // PiP target constants (must match LiveOverlay.tsx)
  const PIP_WIDTH = 140;
  const PIP_HEIGHT = 220;
  const PIP_MARGIN = spacing.md;
  const PIP_TARGET_X = SCREEN_WIDTH - PIP_WIDTH - PIP_MARGIN;
  const PIP_TARGET_Y = SCREEN_HEIGHT - PIP_HEIGHT - 120;
  
  // Independent scales to match aspect ratio exactly
  const PIP_SCALE_X = PIP_WIDTH / SCREEN_WIDTH;
  const PIP_SCALE_Y = PIP_HEIGHT / SCREEN_HEIGHT;
  
  // Minimize animation state
  const [isMinimizing, setIsMinimizing] = useState(false);
  const minimizeAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const minimizeScaleXAnim = useRef(new Animated.Value(1)).current;
  const minimizeScaleYAnim = useRef(new Animated.Value(1)).current;
  const minimizeBorderRadiusAnim = useRef(new Animated.Value(0)).current;
  const uiOpacity = useRef(new Animated.Value(1)).current;
  const minimizeOpacity = useRef(new Animated.Value(1)).current; // For cross-fade
  
  // Interpolate border width to fade in during shrink
  const minimizeBorderWidth = minimizeScaleXAnim.interpolate({
    inputRange: [PIP_SCALE_X, 1],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Interpolate shadow opacity
  const minimizeShadowOpacity = minimizeScaleXAnim.interpolate({
    inputRange: [PIP_SCALE_X, 1],
    outputRange: [0.35, 0],
    extrapolate: 'clamp',
  });

  // Interpolate shadow radius
  const minimizeShadowRadius = minimizeScaleXAnim.interpolate({
    inputRange: [PIP_SCALE_X, 1],
    outputRange: [10, 0],
    extrapolate: 'clamp',
  });

  // Interpolate elevation (Android)
  const minimizeElevation = minimizeScaleXAnim.interpolate({
    inputRange: [PIP_SCALE_X, 1],
    outputRange: [12, 0],
    extrapolate: 'clamp',
  });
  
  // PiP preview opacity: visible when minimized
  const pipPreviewOpacity = minimizeScaleXAnim.interpolate({
    inputRange: [PIP_SCALE_X, 0.8, 1],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });

  // Main content opacity: inverse of PiP preview
  const mainContentOpacity = minimizeScaleXAnim.interpolate({
    inputRange: [PIP_SCALE_X, 0.8, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  
  // Gesture tracking refs
  const gestureType = useRef<'none' | 'minimize' | 'drawer'>('none');
  const startX = useRef(0);
  const startY = useRef(0);

  const MINIMIZE_AREA_HEIGHT = 300;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt: GestureResponderEvent) => {
        // Block gestures when any modal/sheet is open
        if (isProfileOpen.current || isSheetOpen.current) return false;
        
        const { pageX, pageY } = evt.nativeEvent;
        startX.current = pageX;
        startY.current = pageY;
        return false;
      },
      onMoveShouldSetPanResponder: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        // Block gestures when any modal/sheet is open
        if (isProfileOpen.current || isSheetOpen.current) return false;
        
        const { pageX, pageY } = evt.nativeEvent;
        
        if (pageX > SCREEN_WIDTH - EDGE_THRESHOLD && gestureState.dx < -20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
          gestureType.current = 'drawer';
          return true;
        }
        
        const isInTopArea = pageY < MINIMIZE_AREA_HEIGHT;
        if (isInTopArea && gestureState.dy > 20 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.5) {
          gestureType.current = 'minimize';
          return true;
        }
        
        return false;
      },
      onPanResponderGrant: () => {
        if (gestureType.current === 'minimize') {
          pan.setValue({ x: 0, y: 0 });
        }
      },
      onPanResponderMove: (_, gestureState: PanResponderGestureState) => {
        if (gestureType.current === 'minimize') {
          const newY = Math.max(0, gestureState.dy);
          pan.setValue({ x: 0, y: newY });
        }
      },
      onPanResponderRelease: (_, gestureState: PanResponderGestureState) => {
        if (gestureType.current === 'drawer') {
          if (gestureState.dx < -50 || gestureState.vx < -0.5) {
            hapticTap();
            setActiveSheet('participants');
          }
        } else if (gestureType.current === 'minimize') {
          if (gestureState.dy > 100 || gestureState.vy > 0.5) {
            handleMinimize();
          } else {
            Animated.spring(pan, { 
              toValue: { x: 0, y: 0 }, 
              useNativeDriver: false,
              friction: 20,
              tension: 200,
            }).start();
          }
        }
        gestureType.current = 'none';
      },
      onPanResponderTerminate: () => {
        gestureType.current = 'none';
        Animated.spring(pan, { 
          toValue: { x: 0, y: 0 }, 
          useNativeDriver: false,
          friction: 20,
          tension: 200,
        }).start();
      },
    })
  ).current;

  // Animations for minimize gesture
  const scale = pan.y.interpolate({
    inputRange: [0, SCREEN_HEIGHT],
    outputRange: [1, 0.85],
    extrapolate: 'clamp',
  });

  const opacity = pan.y.interpolate({
    inputRange: [0, SCREEN_HEIGHT / 3],
    outputRange: [1, 0.6],
    extrapolate: 'clamp',
  });

  const borderRadius = pan.y.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 24],
    extrapolate: 'clamp',
  });

  // Handlers
  const handleMinimize = useCallback(() => {
    hapticTap();
    
    // Already minimizing? Skip
    if (isMinimizing) return;
    
    setIsMinimizing(true);
    
    // Calculate target position accounting for scale transform origin (center)
    // We need independent offsets because scales are different
    const centerOffsetX = (SCREEN_WIDTH * (1 - PIP_SCALE_X)) / 2;
    const centerOffsetY = (SCREEN_HEIGHT * (1 - PIP_SCALE_Y)) / 2;
    const targetX = PIP_TARGET_X - centerOffsetX;
    const targetY = PIP_TARGET_Y - centerOffsetY;
    
    // Animate to PiP corner position with independent scaling
    Animated.parallel([
      Animated.timing(minimizeAnim.x, {
        toValue: targetX,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(minimizeAnim.y, {
        toValue: targetY,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(minimizeScaleXAnim, {
        toValue: PIP_SCALE_X,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(minimizeScaleYAnim, {
        toValue: PIP_SCALE_Y,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(minimizeBorderRadiusAnim, {
        toValue: radius.xl,
        duration: 300,
        useNativeDriver: false,
      }),
      // Fade out UI elements (chat, buttons) faster
      Animated.timing(uiOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Animation complete
      minimizeLive(); // Spawns overlay on top
      
      // Quick cross-fade out of the full screen view to reveal the overlay underneath/on-top
      Animated.timing(minimizeOpacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: false,
      }).start(() => {
        router.back();
      });
    });
  }, [minimizeLive, router, isMinimizing, minimizeAnim, minimizeScaleXAnim, minimizeScaleYAnim, minimizeBorderRadiusAnim, uiOpacity, minimizeOpacity]);

  const handleSendMessage = useCallback((text: string) => {
    if (text && text.trim()) {
      sendMessage(text.trim());
    }
  }, [sendMessage]);

  const handleRaiseHandRequest = useCallback(async () => {
    if (isHost) {
      return;
    }

    const currentLiveId = liveRoom?.id ?? activeLive?.id;
    if (!currentLiveId || !currentUser?.id) {
      toast.error('Host is unavailable right now.');
      return;
    }

    try {
      await publishLiveHostRequest({
        liveId: currentLiveId,
      });
      requestBackendRefresh({
        scopes: ['live'],
        source: 'manual',
        reason: 'live_host_request_sent',
      });
      toast.success('Raise-hand request sent.');
    } catch (error) {
      if (__DEV__) {
        console.warn('[live] Failed to send raise-hand request', error);
      }
      toast.error('Could not send request. Try again.');
    }
  }, [
    activeLive?.id,
    currentUser?.id,
    isHost,
    liveRoom?.id,
  ]);

  const handleInviteToStream = useCallback((user: LiveUser) => {
    hapticTap();
    setPendingInviteUser(user);
    setActiveSheet('inviteToStream');
  }, []);

  const handleAcceptInvite = useCallback(async () => {
    if (!pendingInviteUser || !currentLiveId) {
      setActiveSheet(null);
      setPendingInviteUser(null);
      return;
    }

    const inviteSent = await sendLiveInvite(pendingInviteUser.id);
    if (inviteSent) {
      requestBackendRefresh({
        scopes: ['live'],
        source: 'manual',
        reason: 'live_host_invite_sent',
      });
      toast.success(`Invite sent to ${pendingInviteUser.name}`);
    } else {
      toast.error(`Could not invite ${pendingInviteUser.name}. Try again.`);
    }
    setActiveSheet(null);
    setPendingInviteUser(null);
  }, [currentLiveId, pendingInviteUser, sendLiveInvite, setActiveSheet]);

  const respondToHostRequest = useCallback(
    async (accepted: boolean) => {
      if (!currentLiveId || !pendingHostRequestUserId || isRespondingToHostRequest) {
        return;
      }

      setIsRespondingToHostRequest(true);
      try {
        await publishLiveHostRequestResponse({
          liveId: currentLiveId,
          targetUserId: pendingHostRequestUserId,
          accepted,
        });
        requestBackendRefresh({
          scopes: ['live'],
          source: 'manual',
          reason: accepted ? 'live_host_request_accepted' : 'live_host_request_declined',
        });
        toast.success(
          accepted
            ? `${pendingHostRequestDisplayName} is now a co-host.`
            : `${pendingHostRequestDisplayName}'s request was declined.`,
        );
      } catch (error) {
        if (__DEV__) {
          console.warn('[live] Failed to respond to host request', error);
        }
        toast.error('Could not process request. Try again.');
      } finally {
        setIsRespondingToHostRequest(false);
      }
    },
    [
      currentLiveId,
      isRespondingToHostRequest,
      pendingHostRequestDisplayName,
      pendingHostRequestUserId,
    ],
  );

  const respondToHostInvite = useCallback(
    async (accepted: boolean) => {
      if (!currentLiveId || !hasPendingHostInvite || isRespondingToHostInvite) {
        return;
      }

      setIsRespondingToHostInvite(true);
      try {
        await publishLiveInviteResponse({
          liveId: currentLiveId,
          accepted,
        });
        requestBackendRefresh({
          scopes: ['live'],
          source: 'manual',
          reason: accepted ? 'live_host_invite_accepted' : 'live_host_invite_declined',
        });
        if (accepted) {
          toast.success('You are now a co-host.');
        } else {
          toast.success('Invite declined.');
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('[live] Failed to respond to host invite', error);
        }
        toast.error('Could not process invite. Try again.');
      } finally {
        setIsRespondingToHostInvite(false);
      }
    },
    [currentLiveId, hasPendingHostInvite, isRespondingToHostInvite],
  );

  const handleCancelInvite = useCallback(() => {
    setActiveSheet(null);
    setPendingInviteUser(null);
  }, []);

  const handleKickStreamer = useCallback((user: LiveUser) => {
    setUserToKick(user);
    setActiveSheet('kickConfirm');
  }, []);

  const handleConfirmKick = useCallback(() => {
    if (userToKick) {
      kickStreamer(userToKick);
    }
    setActiveSheet(null);
    setUserToKick(null);
  }, [userToKick, kickStreamer]);

  const handleBanUser = useCallback(
    (user: LiveUser) => {
      banUser(user);
    },
    [banUser],
  );

  const handleBoost = useCallback((multiplier: BoostMultiplier) => {
    const cost = BOOST_COSTS[multiplier];
    
    if (spendCash(cost)) {
      hapticImpact('heavy'); // Strong haptic on boost
      boostLive(multiplier);
      // Reset timer when boosting
      setBoostTimeLeft(BOOST_DURATION);
      // Set boosting state for the button
      setIsBoosting(true);
      setCurrentBoostAmount(multiplier);
      // Reset boosting state after animation duration
      setTimeout(() => {
        setIsBoosting(false);
        setCurrentBoostAmount(0);
      }, 2000);
    } else {
      hapticWarn();
      toast.warning('Not enough cash to boost this live.');
    }
  }, [boostLive, spendCash]);

  const handleJoinLive = useCallback((liveId: string) => {
    setNextLiveId(liveId);
    setActiveSheet(null); // Close boost sheet first
    
    // Small delay to allow sheet to dismiss before showing modal
    // preventing modal conflict on iOS
    setTimeout(() => {
      setActiveSheet('switchLive');
    }, 500);
    
    hapticTap();
  }, []);

  const handleConfirmSwitchLive = useCallback(() => {
    if (nextLiveId) {
      const selectedLeaderboardLive = liveLeaderboard.find((entry) => entry.id === nextLiveId);
      if (selectedLeaderboardLive) {
        const liveItem: LiveItem = {
          id: selectedLeaderboardLive.id,
          title: selectedLeaderboardLive.title,
          viewers: 0,
          images: selectedLeaderboardLive.hostAvatars,
          hosts: selectedLeaderboardLive.hostAvatars.map((avatar, index) => ({
            name: `Host ${index + 1}`,
            age: 25,
            country: 'US',
            bio: 'Live streamer',
            verified: true,
            avatar,
          })),
        };
        switchLiveRoom(liveItem);
      } else {
        const nextLiveRoom = lives.find((item) => item.id === nextLiveId);
        if (nextLiveRoom) {
          switchLiveRoom(nextLiveRoom);
        }
      }
    }
    setActiveSheet(null);
    setNextLiveId(null);
  }, [nextLiveId, switchLiveRoom, liveLeaderboard, lives]);

  const handlePostLiveNavigation = useCallback(() => {
    if (hasHandledClosedNavigationRef.current) return;
    hasHandledClosedNavigationRef.current = true;
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [activeLive, liveRoom, liveState, routeLiveId, router]);

  const handleConfirmLeaveOrEnd = useCallback(() => {
    setActiveSheet(null);
    if (isHost) {
      endLive();
    } else {
      leaveLive();
    }
    handlePostLiveNavigation();
  }, [endLive, handlePostLiveNavigation, isHost, leaveLive]);

  const handleCloseLiveEndedScreen = useCallback(() => {
    leaveLive();
    handlePostLiveNavigation();
  }, [handlePostLiveNavigation, leaveLive]);

  const handleFillFuel = useCallback(async (amount: FuelFillAmount, paymentType: 'gems' | 'cash') => {
    if (!userId) {
      toast.error('Sign in required to refuel.');
      return;
    }

    const result = await purchaseFuelPack(
      userId,
      amount,
      paymentType,
      'live_screen_refuel',
    );
    if (result.ok) {
      hapticImpact('medium');
      return;
    }

    hapticImpact('heavy');
    if (result.code === 'insufficient_balance') {
      toast.warning('Not enough balance to refuel.');
    } else {
      toast.error(result.message ?? 'Refuel failed.');
    }
  }, [userId]);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (!hasVisitedLiveSessionRef.current) return;
    if (routeLiveId) return;
    if (activeLive || liveRoom) return;
    if (liveState !== 'LIVE_CLOSED') return;

    const timeout = setTimeout(() => {
      handlePostLiveNavigation();
    }, 0);
    return () => clearTimeout(timeout);
  }, [activeLive, handlePostLiveNavigation, liveRoom, liveState, routeLiveId]);

  if (!isAuthLoaded) {
    return (
      <AppScreen noPadding edges={[]} style={styles.container}>
        <View style={styles.emptyStateContainer}>
          <AppText>Loading live…</AppText>
        </View>
      </AppScreen>
    );
  }

  if (!isSignedIn || !userId) {
    if (hasSession) {
      return (
        <AppScreen noPadding edges={[]} style={styles.container}>
          <View style={styles.emptyStateContainer}>
            <AppText>Loading live…</AppText>
          </View>
        </AppScreen>
      );
    }
    return <Redirect href="/(auth)" />;
  }

  if ((!activeLive || !liveRoom) && liveState !== 'LIVE_CLOSED') {
    return (
      <AppScreen noPadding edges={[]} style={styles.container}>
        <View style={styles.emptyStateContainer}>
          <AppText style={styles.emptyStateTitle}>Preparing your live…</AppText>
        </View>
      </AppScreen>
    );
  }

  // Never render a blank screen when no room is active.
  if (!activeLive || !liveRoom) {
    return (
      <AppScreen noPadding edges={[]} style={styles.container}>
        <View style={styles.emptyStateContainer}>
          <AppText style={styles.emptyStateTitle}>No live selected</AppText>
          <AppText variant="small" secondary style={styles.emptyStateSubtitle}>
            Open a live from Home to start watching.
          </AppText>
          <AppButton
            title="Go To Home"
            onPress={() => router.replace('/(tabs)')}
            style={styles.emptyStateButton}
          />
        </View>
      </AppScreen>
    );
  }

  const viewerCount = liveRoom.watchers.length + liveRoom.streamers.length;
  const chatBottomMargin =
    INPUT_BAR_HEIGHT +
    (keyboardHeight > 0 ? keyboardHeight : insets.bottom) +
    spacing.sm;
  const showCountdownBanner = boostTimeLeft > 0 && boostTimeLeft <= 10;
  const isAnySheetOpen = activeSheet !== null;
  const showKeyboardDismissOverlay = keyboardHeight > 0 && !isAnySheetOpen;
  const keyboardDismissOverlayBottom = keyboardHeight + INPUT_BAR_HEIGHT;
  const showLiveOverBanner = isLiveEnding;
  const liveOverSecondsLabel = liveEndSecondsLeft ?? 5;
  const showWebHostRequestPrompt =
    Platform.OS === 'web' && Boolean(canRespondToHostRequest && pendingHostRequestUserId);
  const showWebHostInvitePrompt =
    Platform.OS === 'web' && Boolean(!isHost && hasPendingHostInvite);

  return (
    <AppScreen noPadding edges={[]} style={styles.container}>
      <Animated.View
        style={[
          styles.animatedContainer,
          {
            transform: [
              { translateX: isMinimizing ? minimizeAnim.x : 0 },
              { translateY: isMinimizing ? minimizeAnim.y : pan.y },
              { scaleX: isMinimizing ? minimizeScaleXAnim : scale },
              { scaleY: isMinimizing ? minimizeScaleYAnim : scale },
            ],
            opacity: isMinimizing ? minimizeOpacity : opacity,
            borderRadius: isMinimizing ? minimizeBorderRadiusAnim : borderRadius,
            borderWidth: isMinimizing ? minimizeBorderWidth : 0,
            borderColor: colors.borderSubtle,
            ...(Platform.OS === 'web'
              ? {
                  boxShadow: isMinimizing
                    ? `0px 6px 16px rgba(255, 255, 255, 0.35)`
                    : 'none',
                }
              : {
                  shadowColor: colors.textOnLight,
                  shadowOpacity: isMinimizing ? minimizeShadowOpacity : 0,
                  shadowRadius: isMinimizing ? minimizeShadowRadius : 0,
                  shadowOffset: { width: 0, height: 6 },
                }),
            elevation: isMinimizing ? minimizeElevation : 0,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.fullScreen, styles.pointerEventsBoxNone]}>
          {/* Drag Handle Area (visual-only overlay) */}
          <View style={[styles.dragHandleArea, styles.pointerEventsNone]} />
          
          {/* Top Bar - Fixed at top */}
          <Animated.View
            style={[styles.topBarWrapper, { opacity: uiOpacity }, styles.pointerEventsBoxNone]}
          >
            <LiveTopBar
            viewerCount={viewerCount}
            profileViewCount={1137}
            onMinimize={handleMinimize}
            onExitPress={() => {
              hapticTap();
              setActiveSheet('exitLive');
            }}
            onViewersPress={() => {
              hapticTap();
              setActiveSheet('participants');
            }}
            onProfileViewsPress={() => {
              hapticTap();
              setActiveSheet('profileViews');
            }}
            topInset={insets.top}
            showMediaControls={true}
            isMuted={!!currentUser?.isMuted}
            onToggleMic={toggleMic}
            isHost={isHost}
            fuelMinutes={fuel}
            isFuelDraining={true}
            onFuelPress={() => {
              hapticTap();
              setActiveSheet('fuel');
            }}
          />
          </Animated.View>

          {showLiveOverBanner && (
            <LiveEndedScreen
              onClose={handleCloseLiveEndedScreen}
              hostName={liveRoom.hostUser.name}
              totalViewers={viewerCount}
              totalBoosts={liveRoom.totalBoosts}
              duration={`${liveOverSecondsLabel}s`}
            />
          )}

          {/* Main Content Area */}
          <View style={[styles.contentArea, { paddingTop: insets.top + 70 }, styles.pointerEventsBoxNone]}>
            {/* Main Full Screen Content - Fades OUT during minimize */}
            <Animated.View style={[{ opacity: mainContentOpacity }, styles.pointerEventsBoxNone]}>
              <StreamersDisplay
                streamers={liveRoom.streamers}
                onStreamerTap={(user) => {
                  hapticTap();
                  showProfile(user);
                }}
                speakingUserIds={speakingUserIds}
              />
            </Animated.View>
            
            {/* PiP preview content - fades in during minimize */}
            {/* Positioned absolutely to match the main content area */}
            <Animated.View 
              style={{ 
                ...StyleSheet.absoluteFillObject, 
                opacity: pipPreviewOpacity,
                zIndex: 10,
                justifyContent: 'center',
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <View
                style={{
                  width: 140,
                  height: 220,
                  overflow: 'hidden',
                  borderRadius: radius.xl,
                }}
              >
                <MiniHostsGrid 
                  hosts={liveRoom.streamers} 
                  fallbackImage={liveRoom.streamers[0]?.avatarUrl} 
                />
              </View>
            </Animated.View>

            {/* Spacer - tapping here dismisses keyboard */}
            <Pressable onPress={dismissKeyboard} style={styles.spacer} />

            {/* Chat stays outside keyboard-dismiss pressable so it can scroll */}
            <Animated.View style={{ marginBottom: chatBottomMargin, opacity: uiOpacity }}>
              <LiveChat
                messages={liveRoom.chatMessages}
              />
            </Animated.View>
          </View>

          {/* Boost Countdown Banner - shows above input when 10 seconds left */}
          <Animated.View style={{ opacity: uiOpacity }}>
            <BoostCountdownBanner
              timeLeft={boostTimeLeft}
              onBoostPress={() => {
                hapticTap();
                setBoostSheetTab('boost');
                setActiveSheet('boost');
              }}
              onQuickBoost={() => {
                handleBoost(1);
              }}
              visible={showCountdownBanner && !isAnySheetOpen}
            />
          </Animated.View>


          {/* Input Bar - Absolutely positioned at bottom, moves with keyboard */}
          {!isLiveEnding && (
            <Animated.View
              style={[
                styles.inputContainer,
                {
                  bottom: keyboardHeight > 0 ? keyboardAnimatedHeight : 0,
                  opacity: uiOpacity,
                },
              ]}
            >
              <LiveInputBar
                onSend={handleSendMessage}
                onRaiseHandRequest={handleRaiseHandRequest}
                isHost={isHost}
                bottomInset={keyboardHeight > 0 ? 0 : insets.bottom}
              />
            </Animated.View>
          )}
        </View>

        {showKeyboardDismissOverlay && (
          <Pressable
            style={[styles.keyboardDismissOverlay, { bottom: keyboardDismissOverlayBottom }]}
            onPress={dismissKeyboard}
          />
        )}

        {/* Circular Boost Button - Inside animated container so drawer overlays it */}
        {!isAnySheetOpen && (
          <Animated.View style={[styles.boostButtonContainer, { opacity: uiOpacity }]}>
            <BoostButton
              onPress={() => {
                hapticTap();
                setBoostSheetTab('boost');
                setActiveSheet('boost');
              }}
              onSwipeDown={handleMinimize}
              boostCount={liveRoom.totalBoosts}
              boostRank={liveRoom.boostRank}
              boostTimeLeft={boostTimeLeft}
              boostTotalTime={BOOST_DURATION}
              isBoosting={isBoosting}
              boostAmount={currentBoostAmount}
            />
          </Animated.View>
        )}

        {/* Participants Drawer */}
        <ParticipantsDrawer
          visible={activeSheet === 'participants'}
          onClose={() => setActiveSheet(null)}
          liveRoom={liveRoom}
          isHost={isHost}
          onInviteToStream={handleInviteToStream}
          onKickStreamer={handleKickStreamer}
          onBanUser={handleBanUser}
          onReport={() => {
            hapticTap();
            setHostOptionsTab('report');
            setActiveSheet('hostOptions');
          }}
          onInviteFriends={() => {
            hapticTap();
            setHostOptionsTab('invite');
            setActiveSheet('hostOptions');
          }}
          onOpenSettings={() => {
            hapticTap();
            setHostOptionsTab('settings');
            setActiveSheet('hostOptions');
          }}
        />

        {/* Unified Boost Sheet */}
        <UnifiedBoostSheet
          visible={activeSheet === 'boost'}
          onClose={() => setActiveSheet(null)}
          onBoost={handleBoost}
          currentRank={liveRoom.boostRank}
          totalBoosts={liveRoom.totalBoosts}
          boostTimeLeft={boostTimeLeft}
          leaderboard={liveLeaderboard}
          onJoinLive={handleJoinLive}
          yourLiveId="1"
          initialTab={boostSheetTab}
          userCash={userCash}
        />

        {/* Fuel Sheet (Premium GemPlus) */}
        <FuelSheet
          visible={activeSheet === 'fuel'}
          onClose={() => setActiveSheet(null)}
          onFill={handleFillFuel}
          currentFuel={fuel}
          userGems={userGems}
          userCash={userCash}
        />

        <KickConfirmModal
          visible={activeSheet === 'kickConfirm'}
          onClose={() => {
            setActiveSheet(null);
            setUserToKick(null);
          }}
          user={userToKick}
          onConfirm={handleConfirmKick}
        />

        <EndLiveModal
          visible={activeSheet === 'switchLive'}
          onClose={() => {
            setActiveSheet(null);
            setNextLiveId(null);
          }}
          onEndLive={handleConfirmSwitchLive}
          isHost={false} // Always treat as viewer when switching via leaderboard
          title="Switch Live?"
          subtitle="You will leave this live and join the selected live."
          confirmText="Switch Live"
        />

        <EndLiveModal
          visible={activeSheet === 'exitLive'}
          onClose={() => {
            setActiveSheet(null);
          }}
          onEndLive={handleConfirmLeaveOrEnd}
          isHost={isHost}
        />

        <ProfileViewsModal
          visible={activeSheet === 'profileViews'}
          onClose={() => setActiveSheet(null)}
          viewers={liveRoom.streamers}
          totalViews={1137}
          isPremiumUser={true} // Set to true for testing
        />

        <InviteToStreamModal
          visible={activeSheet === 'inviteToStream'}
          onClose={() => {
            setActiveSheet(null);
            setPendingInviteUser(null);
          }}
          user={pendingInviteUser}
          onInvite={handleAcceptInvite}
          onCancel={handleCancelInvite}
        />

        {Platform.OS !== 'web' ? (
          <>
            <ConfirmSheet
              visible={Boolean(canRespondToHostRequest && pendingHostRequestUserId)}
              title={
                pendingHostRequestUserId
                  ? `${pendingHostRequestDisplayName} wants to co-host`
                  : 'Co-host request'
              }
              message="Accept to promote this viewer to co-host, or decline to keep them as a viewer."
              confirmLabel={isRespondingToHostRequest ? 'Accepting…' : 'Accept'}
              cancelLabel="Decline"
              icon="hand-left-outline"
              iconColor={colors.accentPrimary}
              confirmColor={colors.accentSuccess}
              onConfirm={() => {
                void respondToHostRequest(true);
              }}
              onCancel={() => {
                void respondToHostRequest(false);
              }}
            />

            <ConfirmSheet
              visible={Boolean(!isHost && hasPendingHostInvite)}
              title={
                pendingInviteHostUserId
                  ? `${pendingHostInviteDisplayName} invited you to co-host`
                  : 'Host invite'
              }
              message="Accept to join as a co-host, or decline to keep watching."
              confirmLabel={isRespondingToHostInvite ? 'Joining…' : 'Accept'}
              cancelLabel="Decline"
              icon="person-add-outline"
              iconColor={colors.accentPrimary}
              confirmColor={colors.accentSuccess}
              onConfirm={() => {
                void respondToHostInvite(true);
              }}
              onCancel={() => {
                void respondToHostInvite(false);
              }}
            />
          </>
        ) : null}

        {showWebHostRequestPrompt ? (
          <View style={styles.webLivePromptOverlay}>
            <View style={styles.webLivePromptCard}>
              <AppText
                testID="live-host-request-title"
                style={styles.webLivePromptTitle}
              >
                {pendingHostRequestUser
                  ? `${pendingHostRequestDisplayName} wants to co-host`
                  : 'Co-host request'}
              </AppText>
              <AppText variant="small" secondary style={styles.webLivePromptMessage}>
                Accept to promote this viewer to co-host, or decline to keep them as a viewer.
              </AppText>
              <View style={styles.webLivePromptActions}>
                <Pressable
                  testID="live-host-request-decline"
                  style={styles.webLivePromptDecline}
                  onPress={() => {
                    void respondToHostRequest(false);
                  }}
                >
                  <AppText style={styles.webLivePromptDeclineText}>Decline</AppText>
                </Pressable>
                <Pressable
                  testID="live-host-request-accept"
                  style={styles.webLivePromptAccept}
                  onPress={() => {
                    void respondToHostRequest(true);
                  }}
                >
                  <AppText style={styles.webLivePromptAcceptText}>
                    {isRespondingToHostRequest ? 'Accepting…' : 'Accept'}
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {showWebHostInvitePrompt ? (
          <View style={styles.webLivePromptOverlay}>
            <View style={styles.webLivePromptCard}>
              <AppText
                testID="live-host-invite-title"
                style={styles.webLivePromptTitle}
              >
                {pendingInviteHostUser
                  ? `${pendingHostInviteDisplayName} invited you to co-host`
                  : 'Host invite'}
              </AppText>
              <AppText variant="small" secondary style={styles.webLivePromptMessage}>
                Accept to join as a co-host, or decline to keep watching.
              </AppText>
              <View style={styles.webLivePromptActions}>
                <Pressable
                  testID="live-host-invite-decline"
                  style={styles.webLivePromptDecline}
                  onPress={() => {
                    void respondToHostInvite(false);
                  }}
                >
                  <AppText style={styles.webLivePromptDeclineText}>Decline</AppText>
                </Pressable>
                <Pressable
                  testID="live-host-invite-accept"
                  style={styles.webLivePromptAccept}
                  onPress={() => {
                    void respondToHostInvite(true);
                  }}
                >
                  <AppText style={styles.webLivePromptAcceptText}>
                    {isRespondingToHostInvite ? 'Joining…' : 'Accept'}
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {/* Unified Host Options Sheet — Settings / Report / Invite as tabs */}
        <ActionSheet
          visible={activeSheet === 'hostOptions'}
          title=""
          onClose={() => {
            setActiveSheet(null);
            setReportStep(1);
            setReportReason(null);
            setReportDetails('');
            setReportScreenshot(null);
            setIsSubmittingReport(false);
            setInviteQuery('');
            setInviteFocused(false);
          }}
          bottomInset={insets.bottom}
          keyboardOffset={hostOptionsTab === 'settings' ? keyboardHeight : 0}
          minHeight={
            hostOptionsTab === 'report' || hostOptionsTab === 'invite'
              ? SCREEN_HEIGHT * 0.9
              : SCREEN_HEIGHT * HOST_OPTIONS_SETTINGS_MIN_HEIGHT_RATIO
          }
        >
          {/* Tab bar */}
          <View style={styles.hostOptionsTabs}>
            {([
              { key: 'settings' as HostOptionsTab, icon: 'settings-outline' as const, label: 'Settings' },
              { key: 'report' as HostOptionsTab, icon: 'flag-outline' as const, label: 'Report' },
              { key: 'invite' as HostOptionsTab, icon: 'person-add-outline' as const, label: 'Invite' },
            ]).map((tab) => {
              const active = hostOptionsTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.hostOptionsTab, active && styles.hostOptionsTabActive]}
                  onPress={() => setHostOptionsTab(tab.key)}
                >
                  <Ionicons
                    name={tab.icon}
                    size={18}
                    color={active ? colors.textPrimary : colors.textMuted}
                  />
                  <AppText
                    style={[
                      styles.hostOptionsTabLabel,
                      active && styles.hostOptionsTabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* ---- Settings tab ---- */}
          {hostOptionsTab === 'settings' && (
            <>
              <View style={styles.settingsBlock}>
                <AppText style={styles.settingsLabel}>Live title</AppText>
                <TextInput
                  style={styles.settingsInput}
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  placeholder="Enter live title"
                  placeholderTextColor={colors.textMuted}
                  maxLength={80}
                />
                <Pressable
                  style={styles.settingsSave}
                  onPress={() => {
                    if (titleDraft.trim()) {
                      setTitle(titleDraft.trim());
                      toast.success('Title updated');
                    } else {
                      toast.warning('Title cannot be empty');
                    }
                  }}
                >
                  <AppText style={styles.settingsSaveText}>Save title</AppText>
                </Pressable>
              </View>

              <View style={styles.settingsBlock}>
                <AppText style={styles.settingsLabel}>Banned users</AppText>
                {bannedUsers.length === 0 ? (
                  <AppText style={styles.settingsEmpty}>No banned users yet</AppText>
                ) : (
                  <View style={styles.bannedList}>
                    {bannedUsers.map((user) => (
                      <View key={user.id} style={styles.bannedRow}>
                        {user.avatarUrl?.trim() ? (
                          <Image source={{ uri: user.avatarUrl }} style={styles.bannedAvatar} />
                        ) : (
                          <View style={styles.bannedAvatarPlaceholder}>
                            <Ionicons name="person" size={18} color={colors.textMuted} />
                          </View>
                        )}
                        <View style={styles.bannedInfo}>
                          <AppText style={styles.bannedName}>{user.name}</AppText>
                          <AppText variant="tiny" muted>
                            @{user.username}
                          </AppText>
                        </View>
                        <Pressable
                          style={styles.unbanButton}
                          onPress={() => {
                            unbanUser(user);
                            toast.success(`${user.name} was unbanned.`);
                          }}
                        >
                          <AppText style={styles.unbanButtonText}>Unban</AppText>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <SheetButton
                label="Close"
                variant="secondary"
                onPress={() => setActiveSheet(null)}
              />
            </>
          )}

          {/* ---- Report tab ---- */}
          {hostOptionsTab === 'report' && (
            <>
              {reportStep === 1 ? (
                <View style={styles.reportStepContainer}>
                  <AppText style={styles.reportQuestion}>
                    Why are you reporting this live?
                  </AppText>
                  <View style={styles.reportReasonList}>
                    {[
                      'Spam',
                      'Harassment',
                      'Hate speech',
                      'Sexual content',
                      'Impersonation',
                      'Other',
                    ].map((reason) => (
                      <Pressable
                        key={reason}
                        style={styles.reportReasonButton}
                        onPress={() => {
                          setReportReason(reason);
                          setReportStep(2);
                        }}
                      >
                        <AppText style={styles.reportReasonText}>{reason}</AppText>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <Pressable onPress={Keyboard.dismiss} accessible={false} style={styles.reportStepContainer}>
                    <Pressable
                      style={styles.reportBackRow}
                      onPress={() => {
                        Keyboard.dismiss();
                        setReportStep(1);
                      }}
                    >
                      <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                      <AppText style={styles.reportBackText}>Back</AppText>
                    </Pressable>

                    <AppText style={styles.reportQuestion}>
                      Tell us what happened
                    </AppText>
                    <TextInput
                      style={styles.reportInput}
                      placeholder="Explain what's wrong..."
                      placeholderTextColor={colors.textMuted}
                      value={reportDetails}
                      onChangeText={setReportDetails}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />

                    <AppText style={[styles.reportQuestion, { marginTop: spacing.lg }]}>
                      Add photos or videos
                    </AppText>
                    {reportScreenshot ? (
                      <View style={styles.reportScreenshotRow}>
                        <Image source={{ uri: reportScreenshot }} style={styles.reportScreenshot} />
                        <Pressable
                          style={styles.reportRemove}
                          onPress={() => setReportScreenshot(null)}
                        >
                          <AppText style={styles.reportRemoveText}>Remove</AppText>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.reportAttachButton}
                        onPress={async () => {
                          const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ImagePicker.MediaTypeOptions.Images,
                            quality: 0.7,
                          });
                          if (!result.canceled) {
                            setReportScreenshot(result.assets[0].uri);
                          }
                        }}
                      >
                        <View style={styles.reportAddIcon}>
                          <Ionicons name="add-circle" size={32} color={colors.accentPrimary} />
                        </View>
                      </Pressable>
                    )}

                    <View style={{ flex: 1 }} />

                    <SheetButton
                      label={isSubmittingReport ? 'Submitting...' : 'Report'}
                      onPress={async () => {
                        if (isSubmittingReport) return;
                        if (!reportReason) {
                          toast.error('Choose a reason before sending the report.');
                          return;
                        }
                        setIsSubmittingReport(true);
                        try {
                          await submitReport({
                            targetType: 'live',
                            targetId: currentLiveId || routeLiveId,
                            surface: 'live_room',
                            reason: reportReason,
                            details: reportDetails,
                            context: {
                              liveTitle: liveRoom?.title ?? activeLive?.title ?? null,
                              liveHostUserId: liveRoom?.hostUser?.id ?? null,
                              liveHostUsername: liveRoom?.hostUser?.username ?? liveRoom?.hostUser?.name ?? null,
                              liveViewerCount:
                                (liveRoom?.watchers?.length ?? 0) +
                                (liveRoom?.streamers?.length ?? 0) +
                                (liveRoom?.hostUser ? 1 : 0),
                              evidenceLocalUri: reportScreenshot,
                            },
                          });
                          Keyboard.dismiss();
                          setActiveSheet(null);
                          setReportStep(1);
                          setReportReason(null);
                          setReportDetails('');
                          setReportScreenshot(null);
                          toast.success('Report sent.');
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Unable to send report.');
                        } finally {
                          setIsSubmittingReport(false);
                        }
                      }}
                    />
                </Pressable>
              )}
            </>
          )}

          {/* ---- Invite tab ---- */}
          {hostOptionsTab === 'invite' && (
            <>
              {!inviteFocused && (
                <View style={styles.inviteHeader}>
                  <View style={styles.inviteHeaderRight}>
                    <View style={styles.inviteQuotaPill}>
                      <AppText style={styles.inviteQuotaText}>
                        {Math.max(0, 20 - invitedIds.size)} left
                      </AppText>
                    </View>
                  </View>
                </View>
              )}

              <View style={styles.inviteSearchRow}>
                <View style={styles.inviteSearch}>
                  <Ionicons name="search" size={18} color={colors.textMuted} />
                  <TextInput
                    style={styles.inviteSearchInput}
                    placeholder="Search"
                    placeholderTextColor={colors.textMuted}
                    value={inviteQuery}
                    onChangeText={setInviteQuery}
                    onFocus={() => setInviteFocused(true)}
                    onBlur={() => setInviteFocused(false)}
                    returnKeyType="search"
                  />
                  {inviteQuery.length > 0 && (
                    <Pressable
                      style={styles.inviteClear}
                      onPress={() => setInviteQuery('')}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
                {inviteFocused && (
                  <Pressable
                    onPress={() => {
                      setInviteQuery('');
                      setInviteFocused(false);
                      Keyboard.dismiss();
                    }}
                  >
                    <AppText style={styles.inviteCancel}>Cancel</AppText>
                  </Pressable>
                )}
              </View>
              <FlatList
                data={filteredInviteCandidates}
                keyExtractor={(item) => item.id}
                style={styles.inviteListContainer}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={styles.inviteList}
                renderItem={({ item }) => {
                  const alreadyInvited = invitedIds.has(item.id);
                  return (
                    <View style={styles.inviteRow}>
                      <View style={styles.inviteInfo}>
                        {item.avatarUrl?.trim() ? (
                          <Image source={{ uri: item.avatarUrl }} style={styles.inviteAvatar} />
                        ) : (
                          <View style={styles.inviteAvatarPlaceholder}>
                            <Ionicons name="person" size={18} color={colors.textMuted} />
                          </View>
                        )}
                        <View style={styles.inviteText}>
                          <AppText style={styles.inviteName}>{item.username}</AppText>
                          <AppText style={styles.inviteHandle}>@{item.id}</AppText>
                        </View>
                      </View>
                      {alreadyInvited ? (
                        <AppText style={styles.inviteAlreadyText}>Already in live</AppText>
                      ) : (
                        <Pressable
                          style={styles.inviteButton}
                          onPress={async () => {
                            if (invitedIds.size >= 20) {
                              toast.warning('Invite limit reached');
                              return;
                            }
                            if (item.id === userId) {
                              toast.warning('You are already in this live');
                              return;
                            }

                            const inviteSent = await sendLiveInvite(item.id);
                            if (!inviteSent) {
                              toast.error(`Could not invite ${item.username}. Try again.`);
                              return;
                            }

                            setInvitedIds((prev) => new Set(prev).add(item.id));
                            toast.success(`Invite sent to ${item.username}`);
                          }}
                        >
                          <AppText style={styles.inviteButtonText}>Invite</AppText>
                        </Pressable>
                      )}
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <AppText style={styles.emptyInviteText}>No matches found</AppText>
                }
              />
            </>
          )}
        </ActionSheet>

      </Animated.View>

      {/* Profile Modal - rendered here to appear above transparent modal */}
      <ProfileModal />
    </AppScreen>
  );
}

type ActionSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  bottomInset?: number;
  keyboardOffset?: number;
  minHeight?: number;
  animationType?: 'none' | 'slide' | 'fade';
  children: React.ReactNode;
};

function ActionSheet({
  visible,
  title,
  onClose,
  bottomInset = 0,
  keyboardOffset = 0,
  minHeight,
  animationType = 'none',
  children,
}: ActionSheetProps) {
  const [isVisible, setIsVisible] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(0);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const springConfig = useMemo(
    () => ({
      stiffness: 160,
      damping: 22,
      mass: 1,
    }),
    [],
  );
  const hiddenY = sheetHeight > 0 ? sheetHeight : SCREEN_HEIGHT;
  const snapThreshold = Math.max(sheetHeight * 0.28, 120);
  const dragDamping = 0.4;
  const maxHeight = SCREEN_HEIGHT - spacing.xl;
  const backdropOpacity = translateY.interpolate({
    inputRange: [0, hiddenY * 0.45, hiddenY],
    outputRange: [1, 0.4, 0],
    extrapolate: 'clamp',
  });

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const snapThresholdRef = useRef(snapThreshold);
  useEffect(() => { snapThresholdRef.current = snapThreshold; }, [snapThreshold]);

  const hiddenYRef = useRef(hiddenY);
  useEffect(() => { hiddenYRef.current = hiddenY; }, [hiddenY]);

  const isVisibleRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setIsVisible(true);
      isVisibleRef.current = true;
      translateY.setValue(hiddenYRef.current);
      Animated.spring(translateY, {
        toValue: 0,
        ...springConfig,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (isVisibleRef.current) {
      Animated.spring(translateY, {
        toValue: hiddenYRef.current,
        ...springConfig,
        useNativeDriver: true,
      }).start(() => {
        setIsVisible(false);
        isVisibleRef.current = false;
      });
    }
  }, [visible, springConfig, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 2,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => Math.abs(gestureState.dy) > 2,
      onPanResponderGrant: () => {
        Keyboard.dismiss();
        translateY.stopAnimation();
        translateY.extractOffset();
      },
      onPanResponderMove: (_, gestureState) => {
        const rawDrag = gestureState.dy;
        const dampedDrag = rawDrag < 0 ? rawDrag * dragDamping : rawDrag;
        translateY.setValue(dampedDrag);
      },
      onPanResponderRelease: (_, gestureState) => {
        translateY.flattenOffset();
        const shouldClose =
          gestureState.dy > snapThresholdRef.current ||
          (gestureState.vy > 1.2 && gestureState.dy > 24);
        if (shouldClose) {
          onCloseRef.current();
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          stiffness: 160,
          damping: 22,
          mass: 1,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} transparent animationType={animationType} onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]} />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              paddingBottom: bottomInset + spacing.lg,
              marginBottom: keyboardOffset,
              transform: [{ translateY }],
              maxHeight,
              minHeight,
            },
          ]}
          onLayout={(e) => {
            const nextHeight = e.nativeEvent.layout.height;
            if (nextHeight !== sheetHeight) {
              setSheetHeight(nextHeight);
            }
          }}
        >
          <View style={styles.sheetDragHandle} {...panResponder.panHandlers}>
            <View style={styles.sheetHandle} />
          </View>
          {title ? <AppText style={styles.sheetTitle}>{title}</AppText> : null}
          <View style={styles.sheetContent}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

type SheetButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

function SheetButton({ label, onPress, variant = 'primary' }: SheetButtonProps) {
  return (
    <Pressable
      style={[styles.sheetButton, variant === 'secondary' && styles.sheetButtonSecondary]}
      onPress={onPress}
    >
      <AppText style={styles.sheetButtonText}>{label}</AppText>
    </Pressable>
  );
}

const LIVE_BG_COLOR = colors.background;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
    backgroundColor: LIVE_BG_COLOR,
  },
  emptyStateTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyStateSubtitle: {
    textAlign: 'center',
  },
  emptyStateButton: {
    marginTop: spacing.md,
    minWidth: 180,
  },
  animatedContainer: {
    flex: 1,
    backgroundColor: LIVE_BG_COLOR,
    overflow: 'hidden',
  },
  fullScreen: {
    flex: 1,
  },
  pointerEventsBoxNone: {
    pointerEvents: 'box-none',
  },
  pointerEventsNone: {
    pointerEvents: 'none',
  },
  dragHandleArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 5,
  },
  topBarWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  liveOverBanner: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    zIndex: 25,
  },
  liveOverTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  liveOverSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  contentArea: {
    flex: 1,
  },
  spacer: {
    flex: 1,
    minHeight: 0,
  },
  inputContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: LIVE_BG_COLOR,
  },
  keyboardDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 150,
  },
  boostButtonContainer: {
    position: 'absolute',
    bottom: 120, // Moved up from 80 to avoid text field overlay
    right: 20,
    zIndex: 100, // Higher zIndex to ensure it's above other gesture handlers
  },

  // Action sheets
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  sheetDragHandle: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  sheetContent: {
    flex: 1,
    gap: spacing.sm,
  },
  sheetButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  sheetButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sheetButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },

  // Host options tabs
  hostOptionsTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  hostOptionsTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  hostOptionsTabActive: {
    backgroundColor: colors.accentPrimary,
  },
  hostOptionsTabLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  hostOptionsTabLabelActive: {
    color: colors.textPrimary,
  },

  // Invite sheet
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  inviteHeaderRight: {
    minWidth: 64,
    alignItems: 'flex-end',
  },
  inviteQuotaPill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  inviteQuotaText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  inviteSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  inviteSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flex: 1,
  },
  inviteSearchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    marginLeft: spacing.sm,
  },
  inviteClear: {
    paddingLeft: spacing.xs,
  },
  inviteCancel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  inviteList: {
    flexGrow: 1,
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  inviteListContainer: {
    flex: 1,
    minHeight: 200,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  inviteInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  inviteAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
  },
  inviteAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: {
    flex: 1,
    minWidth: 0,
  },
  inviteName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  inviteHandle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  inviteButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  inviteButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  inviteAlreadyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  emptyInviteText: {
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  // Report sheet
  reportBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  reportBackText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  reportStepContainer: {
    flex: 1,
  },
  reportQuestion: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  reportReasonList: {
    gap: 0,
  },
  reportReasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  reportReasonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  reportInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    color: colors.textPrimary,
    minHeight: 80,
    fontSize: 15,
  },
  reportAttachButton: {
    width: 72,
    height: 72,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportAddIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportScreenshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  reportScreenshot: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  reportRemove: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  reportRemoveText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  webLivePromptOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1600,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  webLivePromptCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  webLivePromptTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  webLivePromptMessage: {
    lineHeight: 20,
  },
  webLivePromptActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  webLivePromptDecline: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.sm,
  },
  webLivePromptAccept: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSuccess,
    paddingVertical: spacing.sm,
  },
  webLivePromptDeclineText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  webLivePromptAcceptText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Settings sheet
  settingsLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  settingsBlock: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  settingsInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
  },
  settingsSave: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  settingsSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  settingsEmpty: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  bannedList: {
    gap: spacing.sm,
  },
  bannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  bannedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  bannedAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannedInfo: {
    flex: 1,
  },
  bannedName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  unbanButton: {
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  unbanButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
