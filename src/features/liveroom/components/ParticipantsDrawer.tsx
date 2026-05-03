import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Animated,
  PanResponder,
  Modal,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { LiveUser, LiveRoom } from '../types';
import { hapticTap } from '../../../utils/haptics';
import { useProfile } from '../../../context/ProfileContext';

const DRAWER_WIDTH_RATIO = 0.78;

type ParticipantsDrawerProps = {
  visible: boolean;
  onClose: () => void;
  liveRoom: LiveRoom;
  isHost: boolean;
  onInviteToStream: (user: LiveUser) => void;
  onKickStreamer: (user: LiveUser) => void;
  onBanUser: (user: LiveUser) => void;
  onReport: () => void;
  onInviteFriends: () => void;
  onOpenSettings: () => void;
};

export function ParticipantsDrawer({
  visible,
  onClose,
  liveRoom,
  isHost,
  onInviteToStream,
  onKickStreamer,
  onBanUser,
  onReport,
  onInviteFriends,
  onOpenSettings,
}: ParticipantsDrawerProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const DRAWER_WIDTH = screenWidth * DRAWER_WIDTH_RATIO;
  const translateX = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const { showProfile } = useProfile();
  const [showBanConfirm, setShowBanConfirm] = React.useState(false);
  const [userToBan, setUserToBan] = React.useState<LiveUser | null>(null);
  const closeDrawerRef = useRef<() => void>(() => { });

  const openDrawer = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 20,
        tension: 200,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateX, backdropOpacity]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: DRAWER_WIDTH,
        useNativeDriver: true,
        friction: 20,
        tension: 200,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [translateX, backdropOpacity, onClose]);

  useEffect(() => {
    closeDrawerRef.current = closeDrawer;
  }, [closeDrawer]);

  useEffect(() => {
    if (visible) {
      openDrawer();
    }
  }, [visible, openDrawer]);

  useEffect(() => {
    if (!isHost && showBanConfirm) {
      setShowBanConfirm(false);
      setUserToBan(null);
    }
  }, [isHost, showBanConfirm]);

  const panResponder = React.useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && gestureState.dx > 5;
      },
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        const newValue = Math.max(0, gestureState.dx);
        translateX.setValue(newValue);
        const progress = 1 - (newValue / DRAWER_WIDTH);
        backdropOpacity.setValue(Math.max(0, progress));
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > DRAWER_WIDTH * 0.3 || gestureState.vx > 0.5) {
          closeDrawerRef.current();
        } else {
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              friction: 20,
              tension: 200,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 1,
              duration: 100,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 20,
          tension: 200,
        }).start();
      },
    }),
    [DRAWER_WIDTH, translateX, backdropOpacity],
  );

  if (!visible) return null;

  // All streamers are "Hosts" (including the main host)
  const allHosts = liveRoom.streamers;

  return (
    <View style={[styles.container, styles.pointerEventsBoxNone]}>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }, visible ? styles.pointerEventsAuto : styles.pointerEventsNone]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX }],
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.md,
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Handle */}
        <View style={styles.handleArea}>
          <View style={styles.handle} />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Pressable
            style={styles.actionButton}
            onPress={() => {
              hapticTap();
              onInviteFriends();
            }}
          >
            <Ionicons name="person-add-outline" size={20} color={colors.textPrimary} />
            <AppText style={styles.actionButtonText}>Invite</AppText>
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={() => {
              hapticTap();
              onReport();
            }}
          >
            <Ionicons name="flag-outline" size={20} color={colors.textPrimary} />
            <AppText style={styles.actionButtonText}>Report</AppText>
          </Pressable>

          {isHost && (
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                hapticTap();
                onOpenSettings();
              }}
            >
              <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
              <AppText style={styles.actionButtonText}>Settings</AppText>
            </Pressable>
          )}
        </View>

        <View style={styles.divider} />

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces={true}
        >
          {/* Hosts Section */}
          <View style={styles.section}>
            <AppText style={styles.sectionTitle}>
              Hosts ({allHosts.length})
            </AppText>
            {allHosts.map((user) => {
              const isMainHost = user.id === liveRoom.hostUser.id;
              return (
                <ParticipantRow
                  key={user.id}
                  user={user}
                  isMainHost={isMainHost}
                  showKick={isHost && !isMainHost}
                  showBan={isHost && !isMainHost}
                  onKick={() => {
                    hapticTap();
                    onKickStreamer(user);
                  }}
                  onBan={() => {
                    if (!isHost) return;
                    hapticTap();
                    setUserToBan(user);
                    setShowBanConfirm(true);
                  }}
                  onProfilePress={() => {
                    hapticTap();
                    closeDrawer();
                    setTimeout(() => showProfile(user), 150);
                  }}
                />
              );
            })}
          </View>

          {/* Viewers Section */}
          <View style={styles.section}>
            <AppText style={styles.sectionTitle}>
              Viewers ({liveRoom.watchers.length})
            </AppText>
            {liveRoom.watchers.length === 0 ? (
              <AppText style={styles.emptyText}>No viewers yet</AppText>
            ) : (
              liveRoom.watchers.map((user) => (
                <ParticipantRow
                  key={user.id}
                  user={user}
                  showInvite={isHost}
                  showBan={isHost}
                  onInvite={() => {
                    hapticTap();
                    onInviteToStream(user);
                  }}
                  onBan={() => {
                    if (!isHost) return;
                    hapticTap();
                    setUserToBan(user);
                    setShowBanConfirm(true);
                  }}
                  onProfilePress={() => {
                    hapticTap();
                    closeDrawer();
                    setTimeout(() => showProfile(user), 150);
                  }}
                />
              ))
            )}
          </View>
        </ScrollView>
      </Animated.View>

      <Modal
        visible={showBanConfirm}
        animationType="fade"
        transparent
        onRequestClose={() => setShowBanConfirm(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowBanConfirm(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              {userToBan && (
                userToBan.avatarUrl?.trim() ? (
                  <Image source={{ uri: userToBan.avatarUrl }} style={styles.modalAvatar} />
                ) : (
                  <View style={styles.modalAvatarPlaceholder}>
                    <Ionicons name="person" size={22} color={colors.textMuted} />
                  </View>
                )
              )}
              <AppText variant="h3" style={styles.modalTitle}>
                Ban {userToBan?.name}?
              </AppText>
              <AppText style={styles.modalSubtitle}>
                They will be removed from the live and blocked from rejoining.
              </AppText>
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => {
                  hapticTap();
                  setShowBanConfirm(false);
                  setUserToBan(null);
                }}
              >
                <AppText style={styles.modalCancelText}>Cancel</AppText>
              </Pressable>
              <Pressable
                style={styles.modalConfirm}
                onPress={() => {
                  if (userToBan && isHost) {
                    onBanUser(userToBan);
                  }
                  hapticTap();
                  setShowBanConfirm(false);
                  setUserToBan(null);
                }}
              >
                <AppText style={styles.modalConfirmText}>Ban user</AppText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ParticipantRow({
  user,
  isMainHost,
  showKick,
  showBan,
  showInvite,
  onKick,
  onBan,
  onInvite,
  onProfilePress,
}: {
  user: LiveUser;
  isMainHost?: boolean;
  showKick?: boolean;
  showBan?: boolean;
  showInvite?: boolean;
  onKick?: () => void;
  onBan?: () => void;
  onInvite?: () => void;
  onProfilePress?: () => void;
}) {
  const hasActions = showKick || showBan || showInvite;
  const normalizedUserId = user.id.replace(/[^a-zA-Z0-9_-]/g, '_');

  return (
    <Pressable style={styles.participantRow} onPress={onProfilePress} testID={`live-participant-row-${normalizedUserId}`}>
      {user.avatarUrl?.trim() ? (
        <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={18} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.participantInfo}>
        <View style={styles.nameRow}>
          <AppText style={styles.participantName} numberOfLines={1}>
            {user.name}
          </AppText>
          {isMainHost && (
            <View style={styles.crownBadge}>
              <Ionicons name="star" size={10} color="#fff" />
            </View>
          )}
        </View>
        <AppText style={styles.participantUsername} numberOfLines={1}>
          @{user.username}
        </AppText>
      </View>

      {hasActions && (
        <View style={styles.actionRow}>
          {/* X button to kick co-hosts */}
          {showKick && (
            <Pressable style={styles.kickButton} onPress={onKick} testID={`live-host-kick-${normalizedUserId}`}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          )}

          {/* Ban button */}
          {showBan && (
            <Pressable style={styles.banButton} onPress={onBan} testID={`live-host-ban-${normalizedUserId}`}>
              <Ionicons name="ban" size={16} color="#fff" />
            </Pressable>
          )}

          {/* + button to invite viewers to become hosts */}
          {showInvite && (
            <Pressable style={styles.inviteButton} onPress={onInvite} testID={`live-viewer-invite-${normalizedUserId}`}>
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  pointerEventsAuto: {
    pointerEvents: 'auto',
  },
  pointerEventsNone: {
    pointerEvents: 'none',
  },
  pointerEventsBoxNone: {
    pointerEvents: 'box-none',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 999,
  },
  drawer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '78%',
    backgroundColor: '#121318', // Darker than main background
    borderTopLeftRadius: radius.xl,
    borderBottomLeftRadius: radius.xl,
    ...Platform.select({
      web: {
        boxShadow: '8px 0px 25px rgba(0, 0, 0, 0.4)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 25,
        shadowOffset: { width: -8, height: 0 },
      },
    }),
    elevation: 1000,
    zIndex: 1000,
  },
  handleArea: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  handle: {
    width: 4,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },

  // Action buttons
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    marginLeft: 16,
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionButtonText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: spacing.lg,
    marginLeft: spacing.lg + 16,
    marginBottom: spacing.md,
  },

  scrollView: {
    flex: 1,
    marginLeft: 16,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },

  // Participant row
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  participantName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  participantUsername: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  crownBadge: {
    backgroundColor: colors.accentWarning,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kickButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentDanger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentDanger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
  },

  // Ban confirm modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    width: '100%',
    maxWidth: 300,
    overflow: 'hidden',
  },
  modalHeader: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  modalAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    marginBottom: spacing.md,
  },
  modalAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 18,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirm: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  modalConfirmText: {
    color: colors.accentDanger,
    fontSize: 16,
    fontWeight: '600',
  },
});
