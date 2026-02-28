import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Modal, Pressable, PanResponder, Animated, Dimensions, FlatList, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { BoostMultiplier, BOOST_COSTS } from '../types';
import { hapticTap } from '../../../utils/haptics';
import { CashIcon } from '../../../components/CashIcon';
import { normalizeImageUri } from '../../../utils/imageSource';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Unified boost color
const BOOST_RED = '#FF6B6B';

// Types
type LeaderboardLive = {
  id: string;
  title: string;
  boostCount: number;
  rank: number;
  hostAvatars: string[];
  isYourLive?: boolean;
};

type UnifiedBoostSheetProps = {
  visible: boolean;
  onClose: () => void;
  // Boost Props
  onBoost: (multiplier: BoostMultiplier) => void;
  currentRank?: number | null;
  totalBoosts?: number;
  boostTimeLeft?: number;
  // League Props
  leaderboard: LeaderboardLive[];
  onJoinLive: (liveId: string) => void;
  yourLiveId?: string;
  initialTab?: 'boost' | 'league';
  userCash?: number;
};

const MULTIPLIERS: BoostMultiplier[] = [1, 5, 10, 30];

export function UnifiedBoostSheet({
  visible,
  onClose,
  onBoost,
  currentRank,
  totalBoosts = 0,
  boostTimeLeft = 0,
  leaderboard,
  onJoinLive,
  yourLiveId,
  initialTab = 'boost',
  userCash = 0,
}: UnifiedBoostSheetProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'boost' | 'league'>(initialTab);
  const [selectedMultiplier, setSelectedMultiplier] = useState<BoostMultiplier>(1);
  const [timeLeft, setTimeLeft] = useState(boostTimeLeft);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const onCloseRef = useRef(onClose);

  // Keep onClose ref updated
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset tab when opening
  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

  // Animate in when modal opens
  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    }
  }, [visible]);

  // Pan responder for swipe-down to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5 || Math.abs(gestureState.dy) > 8;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return gestureState.dy > 15;
      },
      onPanResponderGrant: () => {
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  // Timer countdown
  useEffect(() => {
    setTimeLeft(boostTimeLeft);
  }, [boostTimeLeft]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleBoost = () => {
    hapticTap();
    onBoost(selectedMultiplier);
    // onClose() removed to prevent auto-closing after boost
  };

  const getRankMessage = () => {
    if (!currentRank) return null;
    if (currentRank === 1) return 'Your live is at the top!';
    if (currentRank <= 3) return 'Almost at the top!';
    return `Keep boosting to climb higher!`;
  };

  const getOrdinalSuffix = (n: number): string => {
    const v = n % 100;
    if (v >= 11 && v <= 13) return 'th';
    const s = ['th', 'st', 'nd', 'rd'];
    return s[n % 10] || 'th';
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return '#F2D24A'; // Cash
      case 2: return '#C0C0C0'; // Silver  
      case 3: return '#CD7F32'; // Bronze
      default: return colors.surfaceAlt;
    }
  };

  const currentCost = BOOST_COSTS[selectedMultiplier];
  const canAfford = userCash >= currentCost;

  // Render Boost Content
  const renderBoostContent = () => (
    <View style={styles.tabContent} {...panResponder.panHandlers}>
      {/* Boost Badge */}
      <View style={styles.boostBadge}>
        <View style={styles.boostIconCircle}>
          <Ionicons name="flash" size={28} color="#fff" />
        </View>
        <AppText style={styles.boostCount}>{totalBoosts}</AppText>
      </View>

      {/* Title */}
      <AppText style={styles.title}>Boost the live</AppText>
      <AppText style={styles.subtitle}>
        Keep the party going and get more people to join!
      </AppText>

      {/* Cash Balance Pill */}
      <View style={styles.balanceContainer}>
        <View style={styles.cashPill}>
          <CashIcon size={16} color={colors.accentSuccess} />
          <AppText style={styles.cashBalanceText}>{userCash}</AppText>
        </View>
      </View>

      {/* Stats Card */}
      {(timeLeft > 0 || currentRank) && (
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            {timeLeft > 0 && (
              <View style={styles.statItem}>
                <AppText style={styles.statValue}>{formatTime(timeLeft)}</AppText>
                <AppText style={styles.statLabel}>left</AppText>
              </View>
            )}

            {timeLeft > 0 && currentRank && <View style={styles.statDivider} />}

            {currentRank && (
              <View style={styles.statItem}>
                <AppText style={[styles.statValue, styles.statValueCash]}>
                  {currentRank}{getOrdinalSuffix(currentRank)}
                </AppText>
                <AppText style={styles.statLabel}>place</AppText>
              </View>
            )}

            {/* Info button -> Switches to League tab */}
            <Pressable
              style={styles.infoButton}
              onPress={() => {
                hapticTap();
                setActiveTab('league');
              }}
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {getRankMessage() && (
            <AppText style={styles.rankMessage}>{getRankMessage()}</AppText>
          )}
        </View>
      )}

      {/* Multiplier Pills */}
      <View style={styles.multipliersRow}>
        {MULTIPLIERS.map((mult) => (
          <Pressable
            key={mult}
            style={[
              styles.multiplierPill,
              selectedMultiplier === mult && styles.multiplierPillSelected,
            ]}
            onPress={() => {
              hapticTap();
              setSelectedMultiplier(mult);
            }}
          >
            <AppText style={[
              styles.multiplierText,
              selectedMultiplier === mult && styles.multiplierTextSelected,
            ]}>
              {mult}×
            </AppText>
          </Pressable>
        ))}
      </View>

      {/* Boost Button */}
      <Pressable
        style={[styles.boostButton, !canAfford && styles.boostButtonDisabled]}
        onPress={canAfford ? handleBoost : undefined}
      >
        <AppText style={styles.boostButtonText}>
          {canAfford ? 'Boost now' : 'Not enough Cash'}
        </AppText>
        <View style={styles.costBadge}>
          <CashIcon size={18} color={canAfford ? colors.accentSuccess : colors.textSecondary} />
          <AppText style={[styles.costText, !canAfford && { color: colors.textSecondary }]}>{currentCost}</AppText>
        </View>
      </Pressable>
    </View>
  );

  // Render League Content
  const renderLeagueContent = () => (
    <View style={[styles.tabContent, styles.leagueTabContent]}>
      <View style={styles.leagueHeader} {...panResponder.panHandlers}>
        <View style={styles.trophyContainer}>
          <AppText style={styles.trophyEmoji}>🏆</AppText>
        </View>
        <AppText style={styles.headerSubtitle}>
          Top boosted lives right now
        </AppText>
      </View>

      <FlatList
        data={leaderboard}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        renderItem={({ item }) => {
          const isYours = item.id === yourLiveId;
          return (
            <Pressable
              style={[styles.leaderboardItem, isYours && styles.yourLiveItem]}
              onPress={() => {
                if (!isYours) {
                  hapticTap();
                  onJoinLive(item.id);
                  onClose();
                }
              }}
              disabled={isYours}
            >
              <View style={[styles.rankBadge, { backgroundColor: getRankColor(item.rank) }]}>
                <AppText style={[
                  styles.rankNumber,
                  item.rank <= 3 && styles.rankNumberTop3
                ]}>
                  {item.rank === 1 ? '1st' : item.rank === 2 ? '2nd' : item.rank === 3 ? '3rd' : `${item.rank}th`}
                </AppText>
              </View>

              <View style={styles.liveInfo}>
                <AppText style={styles.liveTitle} numberOfLines={1}>
                  {isYours ? 'Your live' : item.title}
                </AppText>
                <View style={styles.avatarsRow}>
                  {item.hostAvatars
                    .map((avatar) => normalizeImageUri(avatar))
                    .filter((avatar): avatar is string => Boolean(avatar))
                    .slice(0, 4)
                    .map((avatar, index) => (
                      <Image
                        key={`${item.id}-${index}`}
                        source={{ uri: avatar }}
                        style={[styles.avatar, { marginLeft: index > 0 ? -8 : 0 }]}
                      />
                    ))}
                </View>
              </View>

              <View style={styles.boostCountPill}>
                <Ionicons name="flash" size={14} color={BOOST_RED} />
                <AppText style={styles.boostCountText}>{item.boostCount}</AppText>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          style={[
            styles.sheet,
            {
              // Use safe area bottom or minimal padding if no safe area
              paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.md,
              transform: [{ translateY }],
              maxHeight: SCREEN_HEIGHT * 0.9,
            }
          ]}
        >
          <View {...panResponder.panHandlers}>
            {/* Drag Handle */}
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>

            {/* Close Button & Tabs Header */}
            <View style={styles.header}>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Ionicons name="chevron-down" size={28} color={colors.textSecondary} />
              </Pressable>

              {/* Tabs */}
              <View style={styles.tabsContainer}>
                <Pressable
                  style={[styles.tab, activeTab === 'boost' && styles.activeTab]}
                  onPress={() => {
                    hapticTap();
                    setActiveTab('boost');
                  }}
                >
                  <AppText style={[styles.tabText, activeTab === 'boost' && styles.activeTabText]}>Boost</AppText>
                </Pressable>
                <Pressable
                  style={[styles.tab, activeTab === 'league' && styles.activeTab]}
                  onPress={() => {
                    hapticTap();
                    setActiveTab('league');
                  }}
                >
                  <AppText style={[styles.tabText, activeTab === 'league' && styles.activeTabText]}>League</AppText>
                </Pressable>
              </View>

              {/* Spacer to balance close button */}
              <View style={styles.closeButton} />
            </View>
          </View>

          {/* Content */}
          <View>
            {activeTab === 'boost' ? renderBoostContent() : renderLeagueContent()}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    // height removed to allow auto-sizing
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 100,
    padding: 4,
  },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: 100,
  },
  activeTab: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },

  tabContent: {
    // flex: 1 removed to allow auto-height
  },
  leagueTabContent: {
    height: SCREEN_HEIGHT * 0.75, // Fixed height for scrolling list
  },

  // Boost Content Styles
  boostBadge: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  boostIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BOOST_RED,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BOOST_RED,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  boostCount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: BOOST_RED,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: -8,
    overflow: 'hidden',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  statsCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: BOOST_RED,
  },
  statValueCash: {
    color: colors.accentCash,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.borderSubtle,
  },
  infoButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: spacing.xs,
  },
  rankMessage: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  multipliersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  balanceContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cashPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25, 250, 152, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.xl,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(25, 250, 152, 0.2)',
  },
  cashBalanceText: {
    color: colors.accentSuccess,
    fontWeight: '800',
    fontSize: 15,
  },
  multiplierPill: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  multiplierPillSelected: {
    borderColor: '#fff',
    backgroundColor: colors.surfaceAlt,
  },
  multiplierText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  multiplierTextSelected: {
    color: '#fff',
  },
  boostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BOOST_RED,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    shadowColor: BOOST_RED,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  boostButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
    shadowOpacity: 0,
  },
  boostButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  boostButtonTextDisabled: {
    backgroundColor: colors.surfaceAlt,
    shadowOpacity: 0,
  },
  costBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coinEmoji: {
    fontSize: 18,
  },
  costText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },

  // League Content Styles
  leagueHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  trophyContainer: {
    marginBottom: spacing.sm,
  },
  trophyEmoji: {
    fontSize: 40,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  yourLiveItem: {
    borderWidth: 1,
    borderColor: BOOST_RED,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rankNumberTop3: {
    color: '#000',
  },
  liveInfo: {
    flex: 1,
    gap: 4,
  },
  liveTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  avatarsRow: {
    flexDirection: 'row',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.surfaceAlt,
  },
  boostCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  boostCountText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
