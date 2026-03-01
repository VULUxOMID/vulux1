import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, LayoutAnimation, Animated, Easing, ScrollView, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth as useSessionAuth } from '../../../auth/spacetimeSession';

import { AppText, CashIcon } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { Friend } from '../ActivitiesRow';
import { HomePillCard } from './HomePillCard';
import { useWallet } from '../../../context';
import { EventEntryModal } from './EventEntryModal';
import {
  fetchAccountState as fetchBackendAccountState,
  upsertAccountState as upsertBackendAccountState,
} from '../../../data/adapters/backend/accountState';

const PROGRESS_TICK_MS = 500;
const WINNER_VISIBILITY_MS = 10000;

function parseEnvNumber(name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return 0;
  return parsed;
}

const EVENT_DRAW_MINUTES = parseEnvNumber('EXPO_PUBLIC_EVENT_DRAW_MINUTES', 1, 1440);
const EVENT_ENTRY_COST = parseEnvNumber('EXPO_PUBLIC_EVENT_ENTRY_COST', 0, 1000000);
const EVENT_PRIZE_POOL = parseEnvNumber('EXPO_PUBLIC_EVENT_PRIZE_POOL', 0, 1000000000);
const EVENT_INITIAL_ENTRIES = parseEnvNumber('EXPO_PUBLIC_EVENT_INITIAL_ENTRIES', 0, 10000);

export type EventWidgetProps = {
  onAnnounceWinner: (message: string) => void;
  friends: Friend[];
};

export function EventWidget({ onAnnounceWinner, friends }: EventWidgetProps) {
  const { getToken, isLoaded: isAuthLoaded, isSignedIn, userId } = useSessionAuth();
  const { cash, spendCash } = useWallet();
  const drawDurationMs = EVENT_DRAW_MINUTES * 60 * 1000;
  const entryCost = EVENT_ENTRY_COST;
  const prizePool = EVENT_PRIZE_POOL;
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastWinner, setLastWinner] = useState<string | null>(null);
  const [winnerHighlight, setWinnerHighlight] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entries, setEntries] = useState(EVENT_INITIAL_ENTRIES);
  const [displayEntries, setDisplayEntries] = useState(EVENT_INITIAL_ENTRIES);
  const [hasEntered, setHasEntered] = useState(false);
  const [eventHydrated, setEventHydrated] = useState(false);

  const progressRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const winnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Animate entries counter
  useEffect(() => {
    if (displayEntries === entries) return;

    const diff = entries - displayEntries;
    const step = diff > 0 ? 1 : -1;

    const timer = setInterval(() => {
      setDisplayEntries(prev => {
        if (prev === entries) {
          clearInterval(timer);
          return prev;
        }
        return prev + step;
      });
    }, 50); // Fast counting effect

    return () => clearInterval(timer);
  }, [entries, displayEntries]);

  useEffect(() => {
    let active = true;

    if (!isAuthLoaded) {
      return () => {
        active = false;
      };
    }

    if (!isSignedIn || !userId) {
      setEventHydrated(true);
      return () => {
        active = false;
      };
    }

    setEventHydrated(false);

    const hydrateEventState = async () => {
      const accountState = await fetchBackendAccountState(null, getToken, userId);
      if (!active) return;

      const eventState =
        accountState?.eventWidget && typeof accountState.eventWidget === 'object'
          ? (accountState.eventWidget as Record<string, unknown>)
          : {};

      if (typeof eventState.entries === 'number' && Number.isFinite(eventState.entries)) {
        const normalizedEntries = Math.max(0, Math.floor(eventState.entries));
        setEntries(normalizedEntries);
        setDisplayEntries(normalizedEntries);
      }

      if (typeof eventState.hasEntered === 'boolean') {
        setHasEntered(eventState.hasEntered);
      }

      if (typeof eventState.lastWinner === 'string') {
        setLastWinner(eventState.lastWinner);
      }

      setEventHydrated(true);
    };

    void hydrateEventState();

    return () => {
      active = false;
    };
  }, [getToken, isAuthLoaded, isSignedIn, userId]);

  useEffect(() => {
    if (!eventHydrated || !isAuthLoaded || !isSignedIn || !userId) {
      return;
    }

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      void upsertBackendAccountState(null, getToken, {
        eventWidget: {
          entries,
          hasEntered,
          lastWinner,
          updatedAt: Date.now(),
        },
      }, userId);
    }, 450);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [
    entries,
    eventHydrated,
    getToken,
    hasEntered,
    isAuthLoaded,
    isSignedIn,
    lastWinner,
    userId,
  ]);

  // Shimmer animation for prize pool with proper cleanup
  useEffect(() => {
    shimmerAnimRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(1000),
      ])
    );
    shimmerAnimRef.current.start();

    return () => {
      if (shimmerAnimRef.current) {
        shimmerAnimRef.current.stop();
      }
    };
  }, [shimmerAnim]);

  // Pulse animation with proper cleanup
  useEffect(() => {
    // Stop any existing pulse animation
    if (pulseAnimRef.current) {
      pulseAnimRef.current.stop();
      pulseAnimRef.current = null;
    }

    if (progress > 0.9) {
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimRef.current.start();
    } else {
      pulseAnim.setValue(1);
    }

    return () => {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
      }
    };
  }, [progress, pulseAnim]);

  const handleWinner = useCallback(() => {
    const usernames = friends.length ? friends.map((f) => f.name) : ['player'];
    const winner = usernames[Math.floor(Math.random() * usernames.length)];
    setLastWinner(winner);
    setWinnerHighlight(true);
    onAnnounceWinner(`@${winner} won ${formatCurrencyLong(prizePool)} in the event draw.`);

    if (winnerTimerRef.current) {
      clearTimeout(winnerTimerRef.current);
    }
    winnerTimerRef.current = setTimeout(() => setWinnerHighlight(false), WINNER_VISIBILITY_MS);
  }, [friends, onAnnounceWinner, prizePool]);

  useEffect(() => {
    if (drawDurationMs <= 0) {
      setProgress(0);
      progressRef.current = 0;
      return;
    }

    intervalRef.current = setInterval(() => {
      const increment = PROGRESS_TICK_MS / drawDurationMs;
      const next = progressRef.current + increment;
      if (next >= 1) {
        progressRef.current = 0;
        setProgress(0);
        setHasEntered(false); // Reset entry state for new draw
        handleWinner();
        return;
      }
      progressRef.current = next;
      setProgress(next);
    }, PROGRESS_TICK_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (winnerTimerRef.current) {
        clearTimeout(winnerTimerRef.current);
        winnerTimerRef.current = null;
      }
    };
  }, [drawDurationMs, handleWinner]);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  const handleEntryPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Animate button press
    Animated.sequence([
      Animated.timing(buttonScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    setShowEntryModal(true);
  };

  const confirmEntry = useCallback((): boolean => {
    if (hasEntered) {
      return false;
    }

    const didSpend = spendCash(entryCost);
    if (!didSpend) {
      return false;
    }

    setEntries((prev) => prev + 1);
    setHasEntered(true);
    return true;
  }, [entryCost, hasEntered, spendCash]);

  const remainingMs = Math.max(drawDurationMs * (1 - progress), 0);
  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000)
    .toString()
    .padStart(2, '0');
  const progressPercent = Math.min(progress * 100, 100);
  const progressBarHeight = expanded ? 6 : 3;
  const winnerLine = lastWinner
    ? winnerHighlight
      ? `Winner: @${lastWinner}`
      : `Last winner: @${lastWinner}`
    : 'Next draw soon';

  // Collapsed state content - shown below header
  const collapsedContent = (
    <View style={styles.collapsedContent}>
      <View style={styles.progressContainer}>
        <Animated.View
          style={[
            styles.progressTrack,
            {
              transform: [{ scaleX: progress > 0.9 ? pulseAnim : 1 }],
            }
          ]}
        >
          <View
            style={[styles.progressFill, { width: `${progressPercent}%` }]}
          />
        </Animated.View>
      </View>
      <View style={styles.winnerRow}>
        <AppText
          variant="small"
          style={[
            styles.winnerText,
            winnerHighlight && styles.winnerTextHighlight
          ]}
        >
          {winnerLine}
        </AppText>
      </View>
    </View>
  );

  return (
    <>
      <HomePillCard
        title="Event"
        onPress={toggle}
        expanded={expanded}
        collapsedContent={collapsedContent}
      >
        <View style={styles.eventDetails}>
          <AppText variant="small" secondary style={styles.eventDescription}>
            {prizePool > 0
              ? `Enter now for the next ${formatCurrencyLong(prizePool)} draw.`
              : 'Enter now for the next draw.'}
          </AppText>
          <View style={styles.eventStatsRow}>
            <StatBox
              value={`${remainingMinutes}:${remainingSeconds}`}
              label="Time Left"
              icon="time-outline"
              highlight
              color={colors.accentSuccess}
            />
            <StatBox
              value={formatCurrencyCompact(prizePool)}
              label="Prize Pool"
              customIcon={<CashIcon size={16} color={colors.textPrimary} />}
              color={colors.textPrimary}
              shimmer={shimmerAnim}
            />
            <StatBox
              value={displayEntries.toLocaleString()}
              label="Entries"
              icon="people-outline"
              color={colors.textSecondary}
            />
          </View>

          <Pressable
            onPress={hasEntered ? undefined : handleEntryPress}
            disabled={hasEntered}
          >
            <Animated.View style={[
              styles.eventButtonContainer,
              { transform: [{ scale: buttonScaleAnim }] },
              hasEntered && styles.eventButtonDisabled
            ]}>
              {hasEntered ? (
                <View style={styles.eventButtonEntered}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.accentSuccess} />
                  <AppText style={styles.eventButtonEnteredText}>Entered • Waiting for Draw</AppText>
                </View>
              ) : (
                <LinearGradient
                  colors={[colors.accentSuccess, '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.eventButton}
                >
                  <AppText style={styles.eventButtonText}>
                    {entryCost > 0 ? `$${entryCost} to Enter` : 'Enter Event'}
                  </AppText>
                </LinearGradient>
              )}
            </Animated.View>
          </Pressable>
        </View>
      </HomePillCard>

      <EventEntryModal
        visible={showEntryModal}
        onClose={() => setShowEntryModal(false)}
        onConfirm={confirmEntry}
        entryCost={entryCost}
        currentBalance={cash}
        prizePool={prizePool}
        drawMinutes={EVENT_DRAW_MINUTES}
      />
    </>
  );
}

function formatCurrencyLong(value: number): string {
  if (value <= 0) return '$0';
  return `$${Math.round(value).toLocaleString()}`;
}

function formatCurrencyCompact(value: number): string {
  if (value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1).replace('.0', '')}k`;
  return `$${Math.round(value)}`;
}

function StatBox({
  value,
  label,
  icon,
  customIcon,
  highlight,
  color = colors.textPrimary,
  shimmer
}: {
  value: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  customIcon?: React.ReactNode;
  highlight?: boolean;
  color?: string;
  shimmer?: Animated.Value;
}) {
  const shimmerTranslate = shimmer?.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  return (
    <LinearGradient
      colors={[colors.surfaceAlt, colors.surface]}
      style={[styles.statBox, highlight && styles.statBoxHighlight]}
    >
      {shimmer && (
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: radius.md }]}>
          <Animated.View
            style={{
              width: 30,
              height: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              transform: [{ skewX: '-20deg' }, { translateX: shimmerTranslate }] as any,
            }}
          />
        </View>
      )}
      {customIcon || <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={16} color={color} style={{ marginBottom: 4 }} />}
      <AppText
        variant="body"
        style={[
          styles.statValue,
          styles.statValueSmall,
          { color: highlight ? colors.accentPrimary : colors.textPrimary }
        ]}
      >
        {value}
      </AppText>
      <AppText variant="small" muted style={[styles.statLabel, styles.statLabelSmall]}>
        {label}
      </AppText>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  eventSecondaryContent: {
    alignItems: 'flex-end',
    minWidth: 100,
  },
  collapsedContent: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  progressContainer: {
    width: '100%',
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  winnerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accentSuccess,
  },
  winnerText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  winnerTextHighlight: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  eventDetails: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  eventDescription: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  eventStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  statBox: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
  },
  statBoxHighlight: {
    borderColor: colors.accentPrimary,
    borderWidth: 1,
  },
  statValue: {
    color: colors.textPrimary,
  },
  statLabel: {
    marginTop: 2,
    color: colors.textMuted,
  },
  statValueSmall: {
    fontSize: 15,
    fontWeight: '700',
  },
  statLabelSmall: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventButtonContainer: {
    marginTop: spacing.sm,
  },
  eventButton: {
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  eventButtonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  eventButtonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  eventButtonEntered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentSuccess,
  },
  eventButtonEnteredText: {
    color: colors.accentSuccess,
    fontWeight: '700',
    fontSize: 14,
  },
});
