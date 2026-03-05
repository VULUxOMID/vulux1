import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Pressable, Dimensions, Animated, Easing, Platform } from 'react-native';
import { Svg, Polyline } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { differenceInDays, isSameDay, parseISO } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { AppText } from '../../src/components';
import { toast } from '../../src/components/Toast';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { colors, spacing, radius } from '../../src/theme';
import { useWallet } from '../../src/context';
import { GameSelectionMenu } from '../../src/features/play/components/GameSelectionMenu';
import { PlayHeader } from '../../src/features/play/components/PlayHeader';
import { SlotsControls, SlotsHeader } from '../../src/features/play/components/SlotsHeader';
import { GameOverlay, PaytableModal, type OverlayState } from '../../src/features/play/components/PlayOverlays';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Responsive slot dimensions
const getSlotDimensions = () => {
  const minWidth = 320;
  const maxWidth = 500;
  const clampedWidth = Math.min(Math.max(SCREEN_WIDTH, minWidth), maxWidth);
  
  // Reserve space for side indicators and padding
  const indicatorSpace = 40; // 20px each side
  const paddingSpace = 8; // 4px each side
  const availableWidth = clampedWidth - indicatorSpace - paddingSpace;
  const baseWidth = availableWidth / 5;
  const reelWidth = Math.floor(Math.min(baseWidth, 60));
  const reelHeight = Math.floor(reelWidth * 3);
  const itemHeight = Math.floor(reelHeight / 3);
  const gap = Math.floor(Math.max(2, reelWidth * 0.1)); // Min 2px gap
  const padding = Math.floor(reelWidth * 0.06); // Smaller padding
  
  return { reelWidth, reelHeight, itemHeight, gap, padding, screenWidth: SCREEN_WIDTH };
};

function withOpacity(color: string, opacity: number): string {
  if (opacity >= 1) {
    return color;
  }

  const hex = color.trim().replace('#', '');
  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  return color;
}

function shadowStyle(
  color: string,
  radius: number,
  opacity = 1,
  offset: { width: number; height: number } = { width: 0, height: 0 },
) {
  if (Platform.OS === 'web') {
    return {
      boxShadow: `${offset.width}px ${offset.height}px ${radius}px ${withOpacity(color, opacity)}`,
    };
  }

  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: offset,
  };
}

function textShadowStyle(
  color: string,
  radius: number,
  offset: { width: number; height: number } = { width: 0, height: 0 },
) {
  if (Platform.OS === 'web') {
    return {
      textShadow: `${offset.width}px ${offset.height}px ${radius}px ${color}`,
    };
  }

  return {
    textShadowColor: color,
    textShadowRadius: radius,
    textShadowOffset: offset,
  };
}

// Storage Keys
const STORAGE_KEYS = {
  LAST_LOGIN_DATE: '@vulu_last_login_date',
  STREAK_COUNT: '@vulu_streak_count',
  LAST_DAILY_CLAIM: '@vulu_last_daily_claim',
};

// Sound effects setup
const useSlotSounds = () => {
  const [audioEnabled, setAudioEnabled] = useState(false);
  // Use ref to track sounds for cleanup to avoid stale closure
  const soundsRef = useRef<Record<string, AudioPlayer>>({});

  useEffect(() => {
    const setupAudio = async () => {
      try {
        // Set audio mode for Expo
        await setAudioModeAsync({
          allowsRecording: false,
          shouldPlayInBackground: false,
          playsInSilentMode: true,
          interruptionMode: 'duckOthers',
          shouldRouteThroughEarpiece: false,
        });
        setAudioEnabled(true);
        if (__DEV__) {
          console.log('Audio mode set successfully');
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to set audio mode:', error instanceof Error ? error.message : 'Unknown error');
        }
      }
    };

    const loadSounds = async () => {
      try {
        const soundFiles = {
          spinLoop: require('../../assets/sounds/spin_loop.mp3'),
          win: require('../../assets/sounds/win.mp3'),
          button: require('../../assets/sounds/button.mp3'),
          bonus: require('../../assets/sounds/bonus.mp3'),
          reelStop: require('../../assets/sounds/reel_stop.mp3'),
        };

        const loadedSounds: Record<string, AudioPlayer> = {};
        let successCount = 0;
        
        for (const [key, source] of Object.entries(soundFiles)) {
          try {
            const player = createAudioPlayer(source, { keepAudioSessionActive: true });
            player.volume = 0.8;
            player.loop = false;
            loadedSounds[key] = player;
            successCount++;
          } catch (error) {
            if (__DEV__) {
              console.warn(`Failed to load sound ${key}:`, error instanceof Error ? error.message : 'Unknown error');
            }
          }
        }
        
        // Store in ref for cleanup access
        soundsRef.current = loadedSounds;
        if (__DEV__) {
          console.log(`Sounds loaded: ${successCount}/${Object.keys(soundFiles).length}`);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to initialize sound loading:', error instanceof Error ? error.message : 'Unknown error');
        }
      }
    };

    setupAudio();
    loadSounds();

    return () => {
      // Cleanup using ref to avoid stale closure
      Object.values(soundsRef.current).forEach(sound => {
        if (sound) {
          try {
            sound.pause();
            sound.remove();
          } catch (error) {
            if (__DEV__) {
              console.warn('Failed to cleanup sound:', error instanceof Error ? error.message : 'Unknown error');
            }
          }
        }
      });
    };
  }, []);

  const playSound = async (soundName: string, loop = false) => {
    if (!audioEnabled) {
      if (__DEV__) {
        console.debug('Audio not enabled yet');
      }
      return;
    }
    
    // Use ref to avoid stale closure - sounds state may not be updated yet
    const sound = soundsRef.current[soundName];
    if (sound) {
      try {
        sound.loop = loop;
        if (loop) {
          sound.play();
        } else {
          await sound.seekTo(0);
          sound.play();
        }
        if (__DEV__) {
          console.debug(`Playing sound: ${soundName} (loop: ${loop})`);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn(`Failed to play sound ${soundName}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    } else {
      if (__DEV__) {
        console.debug(`Sound not found: ${soundName}`);
      }
    }
  };

  const stopSound = async (soundName: string) => {
    // Use ref to avoid stale closure
    const sound = soundsRef.current[soundName];
    if (sound) {
      try {
        sound.pause();
        await sound.seekTo(0);
        if (__DEV__) {
          console.debug(`Stopped sound: ${soundName}`);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn(`Failed to stop sound ${soundName}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }
  };

  return { playSound, stopSound };
};

function parseEnvNumber(name: string, fallback = 0): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

// Config
const DAILY_REWARD_BASE = parseEnvNumber('EXPO_PUBLIC_PLAY_DAILY_REWARD_BASE', 50);
const DAILY_STREAK_BONUS_PER_DAY = parseEnvNumber('EXPO_PUBLIC_PLAY_DAILY_STREAK_BONUS_PER_DAY', 10);
const DAILY_STREAK_BONUS_CAP_DAYS = parseEnvNumber('EXPO_PUBLIC_PLAY_DAILY_STREAK_BONUS_CAP_DAYS', 7);
const PLAY_GAME_PLAYER_COUNTS: Record<string, number> = {
  slots: parseEnvNumber('EXPO_PUBLIC_PLAY_SLOTS_PLAYERS', 0),
  mines: parseEnvNumber('EXPO_PUBLIC_PLAY_MINES_PLAYERS', 0),
  dice: parseEnvNumber('EXPO_PUBLIC_PLAY_DICE_PLAYERS', 0),
  plinko: parseEnvNumber('EXPO_PUBLIC_PLAY_PLINKO_PLAYERS', 0),
  hilo: parseEnvNumber('EXPO_PUBLIC_PLAY_HILO_PLAYERS', 0),
  dragon: parseEnvNumber('EXPO_PUBLIC_PLAY_DRAGON_PLAYERS', 0),
};

const SLOTS_CONFIG = {
  initialJackpot: parseEnvNumber('EXPO_PUBLIC_PLAY_SLOTS_INITIAL_JACKPOT', 0),
  jackpotIncrementMax: parseEnvNumber('EXPO_PUBLIC_PLAY_SLOTS_JACKPOT_INCREMENT_MAX', 50),
  autoSpinDelayMs: parseEnvNumber('EXPO_PUBLIC_PLAY_SLOTS_AUTO_SPIN_DELAY_MS', 500),
  spinDurationMs: parseEnvNumber('EXPO_PUBLIC_PLAY_SLOTS_SPIN_DURATION_MS', 2000),
  buyBonusMultiplier: parseEnvNumber('EXPO_PUBLIC_PLAY_SLOTS_BONUS_MULTIPLIER', 100),
  freeSpinAward: parseEnvNumber('EXPO_PUBLIC_PLAY_SLOTS_FREE_SPIN_AWARD', 10),
  bigWinMultiplier: parseEnvNumber('EXPO_PUBLIC_PLAY_SLOTS_BIG_WIN_MULTIPLIER', 5),
  historyWindow: parseEnvNumber('EXPO_PUBLIC_PLAY_SLOTS_HISTORY_WINDOW', 20),
};

export default function PlayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cash, gems, addCash, spendCash } = useWallet();
  const [streak, setStreak] = useState(0);
  const [canClaimDaily, setCanClaimDaily] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState<string | null>(null);

  // Initialize Data
  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const lastClaim = await AsyncStorage.getItem(STORAGE_KEYS.LAST_DAILY_CLAIM);
      const storedStreak = await AsyncStorage.getItem(STORAGE_KEYS.STREAK_COUNT);
      
      const today = new Date();
      const streakCount = storedStreak ? parseInt(storedStreak, 10) : 0;
      
      // Validate streak count
      if (isNaN(streakCount) || streakCount < 0) {
        console.warn('Invalid streak count found, resetting to 0');
        setStreak(0);
      } else {
        setStreak(streakCount);
      }

      if (!lastClaim) {
        setCanClaimDaily(true);
      } else {
        try {
          const lastDate = parseISO(lastClaim);
          if (!isSameDay(lastDate, today)) {
            setCanClaimDaily(true);
            
            // Check if streak is broken (more than 1 day difference)
            if (differenceInDays(today, lastDate) > 1) {
              setStreak(0);
              await AsyncStorage.setItem(STORAGE_KEYS.STREAK_COUNT, '0');
            }
          } else {
            setCanClaimDaily(false);
          }
        } catch (dateError) {
          console.warn('Invalid date format in storage, resetting streak');
          setStreak(0);
          setCanClaimDaily(true);
          await AsyncStorage.multiSet([
            [STORAGE_KEYS.STREAK_COUNT, '0'],
            [STORAGE_KEYS.LAST_DAILY_CLAIM, '']
          ]);
        }
      }
    } catch (e) {
      console.error('Failed to load user data', e);
      // Set safe defaults on error
      setStreak(0);
      setCanClaimDaily(true);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimDaily = async () => {
    const previousStreak = streak;
    const newStreak = streak + 1;
    const bonus = Math.min(newStreak, DAILY_STREAK_BONUS_CAP_DAYS) * DAILY_STREAK_BONUS_PER_DAY;
    const totalReward = DAILY_REWARD_BASE + bonus;

    try {
      // Optimistically update UI
      setStreak(newStreak);
      setCanClaimDaily(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const today = new Date().toISOString();

      // Persist to storage first before adding cash
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.LAST_DAILY_CLAIM, today],
        [STORAGE_KEYS.STREAK_COUNT, newStreak.toString()]
      ]);

      // Only add cash after successful persistence
      addCash(totalReward);

      toast.success(`You claimed ${totalReward} Cash! (Base: ${DAILY_REWARD_BASE} + Streak: ${bonus})`);
    } catch (error) {
      console.error('Failed to claim daily bonus:', error);
      toast.error('Failed to claim daily bonus. Please try again.');
      // Revert all state on error
      setStreak(previousStreak);
      setCanClaimDaily(true);
    }
  };

  const handleSelectGame = useCallback((id: string) => {
    setActiveGame(id);
  }, []);

  const handlePressEarn = useCallback(() => {
    router.push('/shop');
  }, [router]);

  return (
    <View style={styles.container}>
      <PlayHeader
        topInset={insets.top}
        gems={gems}
        cash={cash}
        streak={streak}
        canClaimDaily={canClaimDaily}
        onClaimDaily={handleClaimDaily}
        onPressEarn={handlePressEarn}
        showStats={!activeGame}
      />

      {/* Main Content Area */}
      {activeGame ? (
        <View style={styles.fullScreenGameContainer}>
            {activeGame === 'slots' ? (
              <ErrorBoundary fallback={
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <AppText style={{ color: colors.textMuted, marginBottom: spacing.md }}>Game Error</AppText>
                  <Pressable onPress={() => setActiveGame(null)} style={styles.backToMenuBtn}>
                    <Ionicons name="arrow-back" size={20} color="#fff" />
                    <AppText style={{ color: '#fff', fontWeight: 'bold' }}>Back to Menu</AppText>
                  </Pressable>
                </View>
              }>
                <SlotsGame 
                  cash={cash} 
                  onPlay={(bet) => spendCash(bet)} 
                  onWin={(amount) => addCash(amount)} 
                  onBack={() => setActiveGame(null)}
                  config={SLOTS_CONFIG}
                />
              </ErrorBoundary>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Pressable onPress={() => setActiveGame(null)} style={styles.backToMenuBtn}>
                  <Ionicons name="arrow-back" size={20} color="#fff" />
                  <AppText style={{ color: '#fff', fontWeight: 'bold' }}>Back to Menu</AppText>
                </Pressable>
                <View style={styles.placeholderGame}>
                  <Ionicons name="construct-outline" size={64} color={colors.textMuted} />
                  <AppText style={{ marginTop: 16, color: colors.textMuted }}>Coming Soon</AppText>
                </View>
              </View>
            )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <GameSelectionMenu
            onSelectGame={handleSelectGame}
            gamePlayers={PLAY_GAME_PLAYER_COUNTS}
          />
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

// --- Casino Games ---

const NEON_GREEN = '#ccff00';
const NEON_PINK = '#ff00cc';
const BG_DARK = '#0f0f0f';

const SLOT_ICONS = {
  'skull': { icon: 'skull' as const, color: '#FFFFFF', weight: 1, multiplier: 50 },
  'nuclear': { icon: 'nuclear' as const, color: NEON_PINK, weight: 3, multiplier: 20 },
  'cross': { icon: 'close' as const, color: NEON_PINK, weight: 5, multiplier: 15 },
  'smile': { icon: 'happy' as const, color: NEON_GREEN, weight: 8, multiplier: 10 },
  'bug': { icon: 'bug' as const, color: NEON_GREEN, weight: 12, multiplier: 5 },
  'flash': { icon: 'flash' as const, color: NEON_GREEN, weight: 15, multiplier: 3 },
};

const SYMBOLS = Object.keys(SLOT_ICONS);

const PAYLINES = [
  [1, 1, 1, 1, 1], // 1: Middle
  [0, 0, 0, 0, 0], // 2: Top
  [2, 2, 2, 2, 2], // 3: Bottom
  [0, 1, 2, 1, 0], // 4: V shape
  [2, 1, 0, 1, 2], // 5: Inverted V
  [1, 0, 0, 0, 1], // 6: M shape
  [1, 2, 2, 2, 1], // 7: W shape
  [0, 0, 1, 2, 2], // 8: Step down
  [2, 2, 1, 0, 0], // 9: Step up
];

// Generate weighted reel strips for a more authentic feel
const generateReelStrip = () => {
  const strip: string[] = [];
  // Approximate the weights in a 20-symbol strip
  // skull: 1 (5%), nuclear: 1-2, cross: 2, smile: 3, bug: 4, flash: 5+
  const distribution = [
    { s: 'skull', c: 1 }, { s: 'nuclear', c: 2 }, { s: 'cross', c: 3 },
    { s: 'smile', c: 4 }, { s: 'bug', c: 5 }, { s: 'flash', c: 8 }
  ];
  
  distribution.forEach(({s, c}) => {
    for(let i=0; i<c; i++) strip.push(s);
  });
  
  // Shuffle
  return strip.sort(() => Math.random() - 0.5);
};

const REEL_STRIPS = Array(5).fill(null).map(() => generateReelStrip());

function SlotReel({ symbols, spinning, delay, stopDelay, winningIndices, dimensions }: { 
  symbols: string[], 
  spinning: boolean, 
  delay: number, 
  stopDelay: number, 
  winningIndices: boolean[],
  dimensions: ReturnType<typeof getSlotDimensions>
}) {
  const { itemHeight, reelWidth, reelHeight } = dimensions;
  const translateY = useRef(new Animated.Value(0)).current;
  const [visualSpinning, setVisualSpinning] = useState(false);
  
  const winPulse = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const burstScale = useRef(new Animated.Value(1)).current;
  const hasWin = winningIndices.some(w => w);

  // Animation refs for proper cleanup
  const winAnimationsRef = useRef<Animated.CompositeAnimation | null>(null);
  const spinAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Stop previous animations
    if (winAnimationsRef.current) {
      winAnimationsRef.current.stop();
    }

    if (hasWin && !visualSpinning) {
      winAnimationsRef.current = Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(winPulse, { toValue: 1.15, duration: 500, useNativeDriver: true }),
            Animated.timing(winPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowOpacity, { toValue: 0.8, duration: 500, useNativeDriver: true }),
            Animated.timing(glowOpacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(burstScale, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
            Animated.timing(burstScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ])
        )
      ]);
      winAnimationsRef.current.start();
    } else {
      winPulse.setValue(1);
      glowOpacity.setValue(0);
      burstScale.setValue(1);
    }

    // Cleanup on unmount or when conditions change
    return () => {
      if (winAnimationsRef.current) {
        winAnimationsRef.current.stop();
      }
    };
  }, [hasWin, visualSpinning]);

  // Sync visual state with prop state, applying delays
  useEffect(() => {
    let timeout: any;
    if (spinning) {
      // Start delay
      timeout = setTimeout(() => setVisualSpinning(true), delay);
    } else {
      // Stop delay (staggered)
      timeout = setTimeout(() => setVisualSpinning(false), stopDelay);
    }
    return () => clearTimeout(timeout);
  }, [spinning, delay, stopDelay]);

  // Handle Animation Physics with proper cleanup
  useEffect(() => {
    // Stop previous spin animation
    if (spinAnimationRef.current) {
      spinAnimationRef.current.stop();
    }

    if (visualSpinning) {
      translateY.setValue(0);
      spinAnimationRef.current = Animated.loop(
        Animated.timing(translateY, {
          toValue: -itemHeight * 10,
          duration: 600, // Faster spin
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinAnimationRef.current.start();
    } else {
      translateY.stopAnimation();
      translateY.setValue(-itemHeight * 10); // Start position for landing
      spinAnimationRef.current = Animated.spring(translateY, {
        toValue: 0,
        stiffness: 150, // Higher stiffness for "snap"
        damping: 15,    // Damping to prevent too much bounce
        mass: 1.2,      // Weighty feel
        useNativeDriver: true,
      });
      spinAnimationRef.current.start();
    }

    // Cleanup
    return () => {
      if (spinAnimationRef.current) {
        spinAnimationRef.current.stop();
      }
    };
  }, [visualSpinning, itemHeight]);

  const renderSymbol = (symbol: string, index: number) => {
    const iconData = SLOT_ICONS[symbol as keyof typeof SLOT_ICONS] || SLOT_ICONS['flash'];
    const isWinning = !visualSpinning && winningIndices[index]; 
    // Scale icon size based on reel width
    const iconSize = Math.min(48, Math.max(32, Math.floor(reelWidth * 0.65)));
    
    return (
      <View key={index} style={[styles.reelItem, { height: itemHeight }]}>
        <Animated.View style={isWinning ? { transform: [{ scale: winPulse }] } : {}}>
          {/* Primary Glow */}
          <Animated.View style={isWinning ? { opacity: glowOpacity, position: 'absolute' } : { display: 'none' }}>
            <Ionicons 
              name={iconData.icon} 
              size={iconSize} 
              color={iconData.color} 
              style={{ opacity: 0.5, ...shadowStyle(iconData.color, 20, 1) }}
            />
          </Animated.View>
          
          {/* Burst Glow Layer */}
          <Animated.View style={isWinning ? { opacity: Animated.multiply(glowOpacity, 0.3), transform: [{ scale: burstScale }], position: 'absolute' } : { display: 'none' }}>
            <Ionicons 
              name={iconData.icon} 
              size={iconSize} 
              color={iconData.color} 
              style={shadowStyle(iconData.color, 30, 1)}
            />
          </Animated.View>

          <Ionicons 
            name={iconData.icon} 
            size={iconSize} 
            color={iconData.color} 
            style={[
              styles.iconGlow, 
              isWinning && styles.winningSymbol,
              isWinning && { ...shadowStyle(iconData.color, 10, 1), ...textShadowStyle(iconData.color, 10) }
            ]} 
          />
        </Animated.View>
      </View>
    );
  };

  // Create a long strip for spinning effect
  // Memoize to prevent regeneration on every render
  const spinSymbols = useMemo(() => [...SYMBOLS, ...SYMBOLS, ...SYMBOLS].sort(() => Math.random() - 0.5), []);
  const totalHeight = reelHeight;

  return (
    <View style={[styles.reelContainer, { width: reelWidth, height: totalHeight }]}>
      <Animated.View style={[
        styles.reelInner,
        visualSpinning ? { transform: [{ translateY }] } : {}
      ]}>
        {visualSpinning ? (
          <View>
             {spinSymbols.map((s, i) => renderSymbol(s, i))}
             {spinSymbols.map((s, i) => renderSymbol(s, i + spinSymbols.length))}
          </View>
        ) : (
          <View>
            {symbols.map((s, i) => renderSymbol(s, i))}
          </View>
        )}
      </Animated.View>
      
      {/* 3D Depth Overlays - Reduced thickness */}
      <LinearGradient
        colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.4)', 'transparent']}
        style={[styles.reelGradientTop, styles.pointerEventsNone]}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.9)']}
        style={[styles.reelGradientBottom, styles.pointerEventsNone]}
      />
      
      {/* Glass reflection effect */}
      <View style={[styles.reelGlass, styles.pointerEventsNone]} />
    </View>
  );
}

function SlotsGame({
  cash,
  onPlay,
  onWin,
  onBack,
  config,
}: {
  cash: number;
  onPlay: (amount: number) => boolean;
  onWin: (amount: number) => void;
  onBack: () => void;
  config: typeof SLOTS_CONFIG;
}) {
  // Get safe area insets for handling notches
  const insets = useSafeAreaInsets();

  const {
    initialJackpot,
    jackpotIncrementMax,
    autoSpinDelayMs,
    spinDurationMs,
    buyBonusMultiplier,
    freeSpinAward,
    bigWinMultiplier,
    historyWindow,
  } = config;
  
  // Sound effects
  const { playSound, stopSound } = useSlotSounds();
  
  // Get responsive dimensions
  const dimensions = getSlotDimensions();
  const { reelWidth, gap, padding, itemHeight } = dimensions;
  const [grid, setGrid] = useState<string[][]>(Array(5).fill(['flash', 'flash', 'flash']));
  const [spinning, setSpinning] = useState(false);
  const [betPerLine, setBetPerLine] = useState(1);
  const [lines, setLines] = useState(9);
  const [history, setHistory] = useState<number[]>([0]);
  const [currentSessionWinLoss, setCurrentSessionWinLoss] = useState(0);
  const [winningLines, setWinningLines] = useState<number[]>([]);
  const [winningCells, setWinningCells] = useState<boolean[][]>(Array(5).fill(null).map(() => [false, false, false]));
  const [freeSpins, setFreeSpins] = useState(0);
  const [bonusTotalWin, setBonusTotalWin] = useState(0);
  const [overlay, setOverlay] = useState<OverlayState>({ type: 'none', message: '' });
  const [paytableVisible, setPaytableVisible] = useState(false);
  const [jackpot, setJackpot] = useState(initialJackpot);

  // Refs for cleanup
  const timeoutRef = useRef<number | null>(null);
  const jackpotIntervalRef = useRef<number | null>(null);
  const autoSpinTimeoutRef = useRef<number | null>(null);
  const reelStopTimeoutsRef = useRef<number[]>([]);
  const bonusEndTimeoutRef = useRef<number | null>(null);

  // Comprehensive cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (jackpotIntervalRef.current) clearInterval(jackpotIntervalRef.current);
      if (autoSpinTimeoutRef.current) clearTimeout(autoSpinTimeoutRef.current);
      // Clear reel stop timeouts
      reelStopTimeoutsRef.current.forEach(t => clearTimeout(t));
      reelStopTimeoutsRef.current = [];
      // Clear bonus end timeout
      if (bonusEndTimeoutRef.current) clearTimeout(bonusEndTimeoutRef.current);
    };
  }, []);

  // Jackpot ticker effect with proper ref management
  useEffect(() => {
    if (jackpotIncrementMax <= 0) {
      return;
    }

    jackpotIntervalRef.current = setInterval(() => {
      setJackpot(prev => prev + Math.floor(Math.random() * jackpotIncrementMax));
    }, 2000);
    return () => {
      if (jackpotIntervalRef.current) clearInterval(jackpotIntervalRef.current);
    };
  }, [jackpotIncrementMax]);

  // Auto-spin effect for Free Spins with proper cleanup
  // Note: spin is intentionally not in deps as it's stable (not wrapped in useCallback)
  // and we want to avoid re-triggering the effect unnecessarily
  useEffect(() => {
    if (freeSpins > 0 && !spinning && overlay.type === 'none') {
      autoSpinTimeoutRef.current = setTimeout(() => {
        spin();
      }, autoSpinDelayMs);
    }
    return () => {
      if (autoSpinTimeoutRef.current) clearTimeout(autoSpinTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeSpins, spinning, overlay.type]);

  const totalBet = betPerLine * lines;

  const handleReset = useCallback(() => {
    // Reset all game state consistently
    setHistory([0]);
    setCurrentSessionWinLoss(0);
    setWinningLines([]);
    setWinningCells(Array(5).fill(null).map(() => [false, false, false]))
    setFreeSpins(0);
    setBonusTotalWin(0);
    setOverlay({ type: 'none', message: '' });
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('button');
  }, [playSound]);

  const handleBuyBonus = () => {
    if (buyBonusMultiplier <= 0 || freeSpinAward <= 0) {
      toast.info('Bonus mode is not configured.');
      return;
    }

    const bonusCost = totalBet * buyBonusMultiplier;
    if (cash < bonusCost) {
      toast.warning(`Need ${bonusCost} cash to buy bonus!`);
      return;
    }
    
    // Deduct cost immediately
    const success = onPlay(bonusCost);
    if (!success) return;

    setBonusTotalWin(0);
    setFreeSpins(freeSpinAward);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playSound('bonus');
    setOverlay({
        type: 'bonus_start',
        message: `${freeSpinAward} FREE SPINS ACTIVATED! GOOD LUCK!`
    });
  };

  const handleOpenPaytable = useCallback(() => {
    setPaytableVisible(true);
  }, []);

  const handleClosePaytable = useCallback(() => {
    setPaytableVisible(false);
  }, []);

  const handleCloseOverlay = useCallback(() => {
    setOverlay({ type: 'none', message: '' });
  }, []);

  const handleDecreaseBet = useCallback(() => {
    setBetPerLine((prev) => Math.max(1, prev - 1));
  }, []);

  const handleIncreaseBet = useCallback(() => {
    setBetPerLine((prev) => Math.min(10, prev + 1));
  }, []);

  const handleDecreaseLines = useCallback(() => {
    setLines((prev) => Math.max(1, prev - 1));
  }, []);

  const handleIncreaseLines = useCallback(() => {
    setLines((prev) => Math.min(9, prev + 1));
  }, []);

  // Add spinning state ref to prevent race conditions
  const isSpinningRef = useRef(false);

  const spin = () => {
    // Prevent concurrent spin calls
    if (isSpinningRef.current || spinning) {
      return;
    }
    
    isSpinningRef.current = true;

    // Check funds only if NOT in free spins
    if (freeSpins === 0) {
      if (cash < totalBet) {
        toast.warning('Need more cash to spin!');
        isSpinningRef.current = false;
        return;
      }
      const success = onPlay(totalBet);
      if (!success) {
        isSpinningRef.current = false;
        return;
      }
    }

    setSpinning(true);
    setWinningLines([]); // Clear previous wins
    setWinningCells(Array(5).fill(null).map(() => [false, false, false]));
    // Removed heavy haptic feedback
    // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Start looping spin sound
    playSound('spinLoop', true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // Spin duration before stopping reels
    timeoutRef.current = setTimeout(() => {
      finalizeSpin();
      isSpinningRef.current = false;
    }, spinDurationMs);
  };

  const finalizeSpin = () => {
    // Spin the reels: Pick a random stop index for each reel strip
    const newGrid = REEL_STRIPS.map(strip => {
      const stopIndex = Math.floor(Math.random() * strip.length);
      // Get 3 symbols starting from stopIndex, wrapping around
      return [
        strip[stopIndex],
        strip[(stopIndex + 1) % strip.length],
        strip[(stopIndex + 2) % strip.length]
      ];
    });
    
    setGrid(newGrid);
    setSpinning(false);
    
    // Schedule stopping sounds relative to when spinning set to false
    // Reels stop at i * 300ms - track timeouts for cleanup
    reelStopTimeoutsRef.current.forEach(t => clearTimeout(t));
    reelStopTimeoutsRef.current = [];
    [0, 1, 2, 3, 4].forEach((i) => {
        const t = setTimeout(() => {
            // Removed reel stop sound and haptic feedback
            // playSound('reelStop');
            // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            
            // Stop the loop when the last reel stops
            if (i === 4) {
                stopSound('spinLoop');
            }
        }, i * 300);
        reelStopTimeoutsRef.current.push(t as unknown as number);
    });

    let totalWin = 0;
    const newWinningLines: number[] = [];
    // Initialize 5x3 boolean grid
    const newWinningCells: boolean[][] = Array(5).fill(null).map(() => [false, false, false]);

    // Check Paylines
    for (let i = 0; i < lines; i++) {
      const lineIndices = PAYLINES[i];
      const s0 = newGrid[0][lineIndices[0]];
      const s1 = newGrid[1][lineIndices[1]];
      const s2 = newGrid[2][lineIndices[2]];
      const s3 = newGrid[3][lineIndices[3]];
      const s4 = newGrid[4][lineIndices[4]];

      // Check first 3
      if (s0 === s1 && s1 === s2) {
        let matchCount = 3;
        if (s2 === s3) matchCount = 4;
        if (matchCount === 4 && s3 === s4) matchCount = 5;

        const multiplier = SLOT_ICONS[s0 as keyof typeof SLOT_ICONS].multiplier;
        // Simple win calc: BetPerLine * Multiplier * (MatchCount - 2)
        // Adjust multiplier logic as needed
        const lineWin = betPerLine * multiplier * (matchCount - 2); 
        totalWin += lineWin;
        newWinningLines.push(i + 1);

        // Mark winning cells
        for (let m = 0; m < matchCount; m++) {
            const rowIdx = lineIndices[m];
            newWinningCells[m][rowIdx] = true;
        }
      }
    }

    setWinningLines(newWinningLines);
    setWinningCells(newWinningCells);

    if (totalWin > 0) {
      onWin(totalWin);
      // Removed success haptic feedback
      // Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Removed win sound effect
      // playSound('win');
      
      if (totalWin > totalBet * bigWinMultiplier) {
         // Only alert big win if not in bonus (interferes with flow)
         if (freeSpins === 0) {
            setOverlay({
                type: 'big_win',
                message: 'You hit a massive win!',
                amount: totalWin
            });
         }
      }
    }

    // Update session stats
    const newWinLoss = currentSessionWinLoss - (freeSpins === 0 ? totalBet : 0) + totalWin;
    setCurrentSessionWinLoss(newWinLoss);
    setHistory(prev => [...prev.slice(-(Math.max(historyWindow, 1) - 1)), newWinLoss]);

    // Handle Bonus Progression
    if (freeSpins > 0) {
        const currentBonusWin = bonusTotalWin + totalWin;
        setBonusTotalWin(currentBonusWin);
        
        const remaining = freeSpins - 1;
        setFreeSpins(remaining);
        
        if (remaining === 0) {
            // Bonus Finished - track timeout for cleanup
            if (bonusEndTimeoutRef.current) clearTimeout(bonusEndTimeoutRef.current);
            bonusEndTimeoutRef.current = setTimeout(() => {
                setOverlay({
                    type: 'bonus_end',
                    message: 'Congratulations!',
                    amount: currentBonusWin
                });
            }, 500) as unknown as number;
        }
    }
  };

  const showGraph = SCREEN_WIDTH > 350;

  return (
    <ScrollView 
      style={styles.chaosScrollView}
      contentContainerStyle={[
        styles.chaosContainer, 
        { paddingBottom: Math.max(insets.bottom, spacing.sm) }
      ]}
      showsVerticalScrollIndicator={false}
    >
      <GameOverlay state={overlay} onClose={handleCloseOverlay} />
      <PaytableModal
        visible={paytableVisible}
        onClose={handleClosePaytable}
        slotIcons={SLOT_ICONS}
        paylines={PAYLINES}
        bonusFreeSpins={freeSpinAward}
        buyBonusMultiplier={buyBonusMultiplier}
      />
      
      {/* Header */}
      <SlotsHeader
        onBack={onBack}
        onOpenPaytable={handleOpenPaytable}
        onReset={handleReset}
        history={history}
        sessionWinLoss={currentSessionWinLoss}
        showGraph={showGraph}
      />

      {/* Jackpot Machine Topper */}
      <View style={styles.jackpotContainer}>
        <AppText style={styles.jackpotLabel}>GRAND CHAOS JACKPOT</AppText>
        <AppText style={styles.jackpotValue}>${jackpot.toLocaleString()}</AppText>
      </View>

      {/* Machine Casing for better framing */}
      <View style={styles.machineCasing}>
        <LinearGradient
          colors={['#444', '#1a1a1a', '#333', '#111', '#222']}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.machineBody}
        >
          {/* Decorative Machine Texture */}
          <View style={[StyleSheet.absoluteFill, styles.pointerEventsNone]}>
            {/* Horizontal Grid */}
            <View style={styles.machineTextureLine} />
            <View style={[styles.machineTextureLine, { top: '25%' }]} />
            <View style={[styles.machineTextureLine, { top: '50%' }]} />
            <View style={[styles.machineTextureLine, { top: '75%' }]} />
            
            {/* Vertical Highlights */}
            <View style={styles.machineTextureVertical} />
            <View style={[styles.machineTextureVertical, { left: '25%' }]} />
            <View style={[styles.machineTextureVertical, { left: '50%' }]} />
            <View style={[styles.machineTextureVertical, { left: '75%' }]} />
          </View>

          {/* Left Indicators */}
          <View style={styles.indicatorsColumn}>
             {[4, 2, 1, 8, 6].map(n => (
               <View key={n} style={[styles.lineIndicator, winningLines.includes(n) && styles.lineIndicatorActive]}>
                 <AppText style={[styles.lineIndicatorText, winningLines.includes(n) && styles.lineIndicatorTextActive]}>{n}</AppText>
               </View>
             ))}
          </View>

          {/* 5x3 Grid */}
          <View style={[styles.chaosGrid, { gap, padding }]}>
              {/* Payline Visuals */}
              {winningLines.length > 0 && (
              <View style={[StyleSheet.absoluteFill, styles.pointerEventsNone]}>
                  <Svg height="100%" width="100%">
                  {winningLines.map(lineIdx => {
                      const pattern = PAYLINES[lineIdx - 1];
                      const points = pattern.map((row, col) => {
                        // Grid Logic: Dynamic padding + Col * (reelWidth + gap) + Center
                        // Note: SVG starts at grid origin, so no need to account for indicators
                        const x = padding + col * (reelWidth + gap) + reelWidth / 2;
                        // Row Logic: Dynamic padding + Row * itemHeight + Center
                        const y = padding + row * itemHeight + itemHeight / 2;
                        return `${x},${y}`;
                      }).join(' ');
                      
                      return (
                      <Polyline 
                          key={lineIdx}
                          points={points}
                          stroke={NEON_GREEN}
                          strokeWidth="3"
                          strokeOpacity="0.8"
                          fill="none"
                      />
                      );
                  })}
                  </Svg>
              </View>
              )}
              {grid.map((reelSymbols, i) => (
              <SlotReel 
                  key={i} 
                  symbols={reelSymbols} 
                  spinning={spinning} 
                  delay={i * 50} 
                  stopDelay={i * 300} 
                  winningIndices={winningCells[i]}
                  dimensions={dimensions}
              />
              ))}
          </View>

          {/* Right Indicators */}
          <View style={styles.indicatorsColumn}>
             {[5, 3, 9, 7].map(n => (
               <View key={n} style={[styles.lineIndicator, winningLines.includes(n) && styles.lineIndicatorActive]}>
                 <AppText style={[styles.lineIndicatorText, winningLines.includes(n) && styles.lineIndicatorTextActive]}>{n}</AppText>
               </View>
             ))}
          </View>
        </LinearGradient>
      </View>

      {/* Chaos Machine Footer - Energy Meter */}
      <View style={styles.chaosStatusBar}>
        <View style={styles.chaosMeterContainer}>
          <View style={[styles.chaosMeterFill, { width: `${Math.min(100, (history.length % 20) * 5 + 20)}%` }]} />
        </View>
        <AppText style={styles.chaosStatusText}>
          {spinning ? 'RIDING THE CHAOS...' : winningLines.length > 0 ? `CHAOS PAYS! ${winningLines.length} LINES WON` : 'CHAOS ENERGY BUILDING...'}
        </AppText>
      </View>

      {/* Controls */}
      <SlotsControls
        betPerLine={betPerLine}
        lines={lines}
        spinning={spinning}
        onDecreaseBet={handleDecreaseBet}
        onIncreaseBet={handleIncreaseBet}
        onDecreaseLines={handleDecreaseLines}
        onIncreaseLines={handleIncreaseLines}
        onSpin={spin}
      />

      {/* Bonus Buy Button */}
      {freeSpins === 0 && (
        <Pressable 
          onPress={handleBuyBonus} 
          style={({ pressed }) => [
            styles.buyBonusBtn,
            pressed && styles.buyBonusBtnPressed
          ]}
        >
          <Ionicons name="flash" size={14} color="#FFD700" />
          <AppText style={styles.buyBonusText}>BUY BONUS</AppText>
          <AppText variant="tiny" style={styles.buyBonusCost}>{totalBet * buyBonusMultiplier}</AppText>
        </Pressable>
      )}

      {/* Bonus Indicator */}
      {freeSpins > 0 && (
        <View style={styles.bonusBanner}>
          <AppText style={styles.bonusBannerText}>🎰 FREE SPINS: {freeSpins} 🎰</AppText>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xl,
  },
  fullScreenGameContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backToMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: spacing.sm,
  },
  placeholderGame: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reelContainer: {
    backgroundColor: BG_DARK,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  reelInner: {
    width: '100%',
  },
  reelItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 25,
    zIndex: 10,
  },
  reelGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 25,
    zIndex: 10,
  },
  reelGlass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.03)',
    zIndex: 5,
  },
  chaosScrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chaosContainer: {
    flex: 1,
    paddingHorizontal: 2,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 0,
  },
  machineBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
    borderRadius: radius.lg,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  machineTextureLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pointerEventsNone: {
    pointerEvents: 'none',
  },
  bonusBanner: {
    backgroundColor: NEON_PINK,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  bonusBannerText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  jackpotContainer: {
    width: '85%',
    alignItems: 'center',
    marginBottom: -12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 2,
    borderColor: '#333',
    borderBottomWidth: 0,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#0a0a0a',
    zIndex: 0,
  },
  jackpotLabel: {
    fontSize: 8,
    color: NEON_PINK,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 2,
    ...textShadowStyle(NEON_PINK, 8),
  },
  jackpotValue: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '900',
    ...textShadowStyle(NEON_GREEN, 12),
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  chaosStatusBar: {
    width: '85%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -12,
    marginBottom: 4,
    paddingTop: 16,
    paddingBottom: 6,
    backgroundColor: '#0a0a0a',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 2,
    borderColor: '#333',
    borderTopWidth: 0,
    zIndex: 0,
    overflow: 'hidden',
  },
  chaosMeterContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 0,
  },
  chaosMeterFill: {
    height: '100%',
    backgroundColor: 'rgba(204, 255, 0, 0.3)',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    ...shadowStyle(NEON_GREEN, 10, 0.5),
  },
  chaosStatusText: {
    fontSize: 10,
    color: NEON_GREEN,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    ...textShadowStyle(NEON_GREEN, 4),
    zIndex: 1,
  },
  machineCasing: {
    backgroundColor: '#050505',
    padding: 2,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderTopColor: '#666',
    borderLeftColor: '#444',
    borderRightColor: '#111',
    borderBottomColor: '#000',
    ...shadowStyle('#000', 8, 0.8, { width: 0, height: 6 }),
    maxWidth: '100%',
    zIndex: 10,
  },
  machineTextureVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },

  indicatorsColumn: {
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    width: 20,
  },
  lineIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  lineIndicatorActive: {
    backgroundColor: NEON_GREEN,
    borderColor: '#fff',
    ...shadowStyle(NEON_GREEN, 2, 0.8),
  },
  lineIndicatorText: {
    fontSize: 6,
    fontWeight: 'bold',
    color: '#666',
  },
  lineIndicatorTextActive: {
    color: '#000',
  },
  chaosGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222',
    ...shadowStyle('#000', 4, 0.8, { width: 0, height: 2 }),
    overflow: 'hidden',
  },
  gridOverlayLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    zIndex: 0,
  },
  iconGlow: {
    ...shadowStyle('white', 4, 0.3),
  },
  winningSymbol: {
    ...shadowStyle(NEON_GREEN, 10, 1),
    ...textShadowStyle(NEON_GREEN, 10),
  },
  buyBonusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#FFD700',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  buyBonusBtnPressed: {
    backgroundColor: '#2a2a00',
  },
  buyBonusText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFD700',
    letterSpacing: 1,
  },
  buyBonusCost: {
    color: '#FFD700',
    fontWeight: 'bold',
    opacity: 0.8,
  },
  iconBtn: {
    padding: 4,
  },
});
