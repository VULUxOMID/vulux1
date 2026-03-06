import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Modal,
  Pressable,
  Image,
  TextInput,
  StyleSheet,
  PanResponder,
  Animated,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText } from './AppText';
import { useProfile } from '../context/ProfileContext';
import { useFriendshipsRepo, useNotificationsRepo } from '../data/provider';
import { useAuth as useSessionAuth } from '../auth/spacetimeSession';
import { useUserProfile } from '../context/UserProfileContext';
import { trackSpacetimeProfileView } from '../lib/spacetime';
import { colors, radius, spacing } from '../theme';
import { hapticConfirm, hapticTap } from '../utils/haptics';
import { UserRole } from '../features/liveroom/types';
import type { FriendRequestNotification } from '../features/notifications/types';

// Snap points for card position
const SNAP_DEFAULT = 0; // Default position (card at top)
const CLOSE_THRESHOLD_RATIO = 0.35; // Close if dragged past 35% of screen height

// Role configuration with Discord-inspired colors
const ROLE_CONFIG: Record<UserRole, { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  Music: { color: '#1ED760', icon: 'musical-notes', label: 'Music' },
  Withdrawal: { color: '#F0B232', icon: 'wallet', label: 'Withdrawal' },
  Image: { color: '#EB459E', icon: 'image', label: 'Image' },
  Creator: { color: colors.accentPrimary, icon: 'star', label: 'Creator' },
};

function hasImageUri(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeStorySegments(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry): entry is string => entry.length > 0);
}

function getRelationshipStatus(
  selectedUser: { id: string; isSelfPreview?: boolean } | null,
  userProfileId: string,
  acceptedFriendIds: Set<string>,
  friendNotifications: FriendRequestNotification[],
): 'none' | 'requested' | 'friends' {
  if (!selectedUser) return 'none';

  const selfPreview = !!selectedUser.isSelfPreview || selectedUser.id === userProfileId;
  if (selfPreview) return 'none';

  if (acceptedFriendIds.has(selectedUser.id)) {
    return 'friends';
  }

  if (
    friendNotifications.some(
      (notification) =>
        notification.type === 'friend_request' &&
        notification.fromUser.id === selectedUser.id &&
        notification.status === 'accepted',
    )
  ) {
    return 'friends';
  }

  if (
    friendNotifications.some(
      (notification) =>
        notification.type === 'friend_request' &&
        notification.fromUser.id === selectedUser.id &&
        notification.status === 'pending',
    )
  ) {
    return 'requested';
  }

  return 'none';
}

export function ProfileModal() {
  const { selectedUser, hideProfile } = useProfile();
  const { userId: viewerUserId } = useSessionAuth();
  const { userProfile } = useUserProfile();
  const friendshipsRepo = useFriendshipsRepo();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const CARD_HEIGHT = SCREEN_HEIGHT * 0.70;
  const SNAP_MINI = SCREEN_HEIGHT * 0.25;
  const CLOSE_THRESHOLD = SCREEN_HEIGHT * CLOSE_THRESHOLD_RATIO;
  const notificationsRepo = useNotificationsRepo();
  const acceptedFriendIds = useMemo(
    () => new Set(friendshipsRepo.listAcceptedFriendIds()),
    [friendshipsRepo],
  );
  const friendNotifications = useMemo(
    () => notificationsRepo.listNotifications({ limit: 240, types: ['friend_request'] }) as FriendRequestNotification[],
    [notificationsRepo],
  );
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [commentMessage, setCommentMessage] = useState('');
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [showBio, setShowBio] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'none' | 'requested' | 'friends'>('none');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'unfriend' | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [optimisticRequestUntil, setOptimisticRequestUntil] = useState(0);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const lastSnap = useRef(SNAP_DEFAULT);

  // Reset and animate only when opening a different profile.
  useEffect(() => {
    if (selectedUser) {
      // Reset to off-screen first
      translateY.setValue(SCREEN_HEIGHT);
      lastSnap.current = SNAP_DEFAULT;
      setCurrentStoryIndex(0);
      setShowBio(false);
      setCommentMessage('');
      setIsFriend(false);
      setFriendStatus('none');
      setIsLiked(false);
      setToastMessage(null);
      setOptimisticRequestUntil(0);

      // Animate to default position
      Animated.spring(translateY, {
        toValue: SNAP_DEFAULT,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    }
  }, [selectedUser?.id, translateY]);

  // Keep friend status current without re-running full modal open animation.
  useEffect(() => {
    if (!selectedUser) return;
    const relationshipStatus = getRelationshipStatus(
      selectedUser,
      userProfile.id,
      acceptedFriendIds,
      friendNotifications,
    );
    const hasOptimisticRequestLock =
      relationshipStatus === 'none' &&
      friendStatus === 'requested' &&
      optimisticRequestUntil > Date.now();
    if (hasOptimisticRequestLock) {
      return;
    }
    setIsFriend(relationshipStatus === 'friends');
    setFriendStatus(relationshipStatus);
    if (relationshipStatus === 'requested' || relationshipStatus === 'friends') {
      setOptimisticRequestUntil(0);
    }
  }, [
    acceptedFriendIds,
    friendNotifications,
    friendStatus,
    optimisticRequestUntil,
    selectedUser,
    userProfile.id,
  ]);

  useEffect(() => {
    if (!selectedUser?.id || !viewerUserId) {
      return;
    }

    const openedAtMs = Date.now();
    void trackSpacetimeProfileView({
      viewerUserId,
      profileUserId: selectedUser.id,
      openedAtMs,
      source: 'profile_modal_open',
    }).catch((error) => {
      if (__DEV__) {
        console.warn('[profile] Failed to track profile view', error);
      }
    });
  }, [selectedUser?.id, viewerUserId]);

  useEffect(() => {
    if (optimisticRequestUntil <= 0) return;
    const delay = Math.max(0, optimisticRequestUntil - Date.now());
    const timeout = setTimeout(() => {
      setOptimisticRequestUntil(0);
    }, delay + 20);
    return () => clearTimeout(timeout);
  }, [optimisticRequestUntil]);

  // Story segments (photos) - loops in circle
  const selectedStorySegments = normalizeStorySegments(selectedUser?.photos);
  const ownStorySegments =
    selectedUser && (!!selectedUser.isSelfPreview || selectedUser.id === userProfile.id)
      ? normalizeStorySegments(userProfile.photos.map((photo) => photo.uri))
      : [];
  const primaryImageUri = hasImageUri(selectedUser?.avatarUrl)
    ? selectedUser.avatarUrl
    : hasImageUri(userProfile.avatarUrl)
      ? userProfile.avatarUrl
      : null;
  const storySegments =
    selectedStorySegments.length > 0
      ? selectedStorySegments
      : ownStorySegments.length > 0
        ? ownStorySegments
        : primaryImageUri
          ? [primaryImageUri]
          : [];
  const currentStoryUri = storySegments[currentStoryIndex] ?? null;

  // Total segments including bio
  const totalSegments = storySegments.length + 1;

  const closeModal = () => {
    hideProfile();
  };

  // Find nearest snap point
  const getSnapPoint = (y: number, velocity: number) => {
    // If dragged past close threshold or fast swipe down, close
    if (y > CLOSE_THRESHOLD || velocity > 0.5) {
      return 'close';
    }

    // If fast swipe up, go to default
    if (velocity < -1) {
      return SNAP_DEFAULT;
    }

    // Find nearest snap point
    const snapPoints = [SNAP_DEFAULT, SNAP_MINI];
    let nearest = snapPoints[0];
    let minDist = Math.abs(y - snapPoints[0]);

    for (const snap of snapPoints) {
      const dist = Math.abs(y - snap);
      if (dist < minDist) {
        minDist = dist;
        nearest = snap;
      }
    }

    return nearest;
  };

  // Pan responder for drag up/down - recreated when dependencies change to avoid stale closures
  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Capture vertical drags more easily
        return gestureState.dy > 5 || Math.abs(gestureState.dy) > 8;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Capture the gesture if dragging down
        return gestureState.dy > 15;
      },
      onPanResponderGrant: () => {
        // Stop any running animation
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        // Allow dragging up (negative) and down (positive)
        const newY = lastSnap.current + gestureState.dy;
        // Clamp to prevent going too far above screen
        const clampedY = Math.max(-20, newY);
        translateY.setValue(clampedY);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentY = lastSnap.current + gestureState.dy;
        const snapPoint = getSnapPoint(currentY, gestureState.vy);

        if (snapPoint === 'close') {
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            closeModal();
          });
        } else {
          lastSnap.current = snapPoint;
          Animated.spring(translateY, {
            toValue: snapPoint,
            useNativeDriver: true,
            friction: 8,
            tension: 100,
          }).start();
        }
      },
    }),
    [getSnapPoint, closeModal, translateY, SCREEN_HEIGHT],
  );

  if (!selectedUser) return null;

  const isSelfPreview = !!selectedUser.isSelfPreview || selectedUser.id === userProfile.id;

  const getCurrentPosition = () => {
    if (showBio) return storySegments.length;
    return currentStoryIndex;
  };

  const handleNextStory = () => {
    if (showBio) {
      setShowBio(false);
      setCurrentStoryIndex(0);
    } else if (currentStoryIndex < storySegments.length - 1) {
      setCurrentStoryIndex(prev => prev + 1);
    } else {
      setShowBio(true);
    }
  };

  const handlePrevStory = () => {
    if (showBio) {
      setShowBio(false);
      setCurrentStoryIndex(storySegments.length - 1);
    } else if (currentStoryIndex > 0) {
      setCurrentStoryIndex(prev => prev - 1);
    } else {
      setShowBio(true);
    }
  };

  const handleInfoPress = () => {
    setShowBio(true);
  };

  // Show toast notification
  const showToast = (message: string) => {
    setToastMessage(message);
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setToastMessage(null));
  };

  // Handle sending a comment on the photo
  const handleSendComment = () => {
    if (!commentMessage.trim()) return;
    hapticConfirm();
    Keyboard.dismiss();
    showToast('Comment sent');
    setCommentMessage('');
    // In a real app, this would send the comment to the backend
  };

  // Handle liking the photo
  const handleLikePhoto = () => {
    hapticTap();
    setIsLiked(!isLiked);
    showToast(isLiked ? 'Like removed' : 'Like sent');
    // In a real app, this would send the like to the backend
  };

  // Handle friend status changes
  const handleToggleFriend = async () => {
    hapticConfirm();

    if (friendStatus === 'none') {
      if (selectedUser?.id) {
        try {
          await notificationsRepo.sendFriendRequest({ toUserId: selectedUser.id });
        } catch (error) {
          if (__DEV__) {
            console.warn('[profile] Failed to send friend request', error);
          }
          showToast('Could not send friend request');
          return;
        }
      }
      setOptimisticRequestUntil(Date.now() + 10_000);
      setFriendStatus('requested');
      showToast('Friend request sent');
    } else if (friendStatus === 'requested') {
      // Show confirmation popup before cancelling request
      setConfirmAction('cancel');
      setShowConfirmModal(true);
    } else if (friendStatus === 'friends') {
      // Show confirmation popup before unfriending
      setConfirmAction('unfriend');
      setShowConfirmModal(true);
    }
    // In a real app, this would update friend status on the backend
  };

  // Execute confirmed action
  const executeConfirmAction = async () => {
    const selectedId = selectedUser?.id;
    if (!selectedId) {
      setShowConfirmModal(false);
      setConfirmAction(null);
      return;
    }

    try {
      await notificationsRepo.removeFriendRelationship({ otherUserId: selectedId });

      if (confirmAction === 'cancel') {
        showToast('Friend request cancelled');
        setFriendStatus('none');
        setOptimisticRequestUntil(0);
      } else if (confirmAction === 'unfriend') {
        showToast('Friend removed');
        setFriendStatus('none');
        setIsFriend(false);
        setOptimisticRequestUntil(0);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[profile] Failed to remove friend relationship', error);
      }
      showToast('Could not update friend status');
    }
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  // Cancel confirmation
  const cancelConfirm = () => {
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  // Handle navigating to DMs
  const handleOpenDM = () => {
    hapticTap();
    hideProfile();
    router.push(`/chat/${selectedUser?.id || selectedUser?.username}`);
  };

  // Handle profile preview
  const handleProfilePreview = () => {
    hapticTap();
    setIsPreviewMode(true);
  };

  // Close preview mode
  const closePreviewMode = () => {
    setIsPreviewMode(false);
  };

  const currentPosition = getCurrentPosition();

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={true}
      onRequestClose={closeModal}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Blurred background */}
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

        {/* Backdrop tap to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />

        {/* Card wrapper - drag from anywhere */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.cardWrapper,
            {
              paddingTop: insets.top + 8,
              transform: [{ translateY }]
            }
          ]}
        >
          {/* Drag handle area (visual only) */}
          <View style={styles.dragHandleArea}>
            <View style={styles.dragHandle} />
            {/* Username above card */}
            <AppText style={styles.usernameAbove}>@{selectedUser.username}</AppText>
          </View>

          <View style={styles.card}>
            <Pressable onPress={handleProfilePreview} style={styles.imagePressable}>
              {showBio ? (
                <View style={styles.bioContainer}>
                  {primaryImageUri ? (
                    <Image
                      source={{ uri: primaryImageUri }}
                      style={styles.cardImage}
                      resizeMode="cover"
                      blurRadius={20}
                    />
                  ) : (
                    <View style={[styles.cardImage, styles.cardImageFallback]} />
                  )}
                  <View style={styles.bioDarkOverlay} />
                  <View style={styles.bioContent}>
                    {selectedUser.isListening && selectedUser.currentTrack && (
                      <View style={styles.musicWidget}>
                        <View style={styles.musicHeader}>
                          <View style={styles.equalizer}>
                            <View style={[styles.eqBar, { height: 10 }]} />
                            <View style={[styles.eqBar, { height: 16 }]} />
                            <View style={[styles.eqBar, { height: 8 }]} />
                          </View>
                          <AppText style={styles.musicLabel}>Listening to</AppText>
                        </View>
                        <View style={styles.musicTrackRow}>
                          {hasImageUri(selectedUser.currentTrack.artwork) ? (
                            <Image source={{ uri: selectedUser.currentTrack.artwork }} style={styles.musicArtwork} />
                          ) : (
                            <View style={[styles.musicArtwork, styles.musicArtworkFallback]} />
                          )}
                          <View style={styles.musicTrackText}>
                            <AppText style={styles.musicTrackTitle} numberOfLines={1}>
                              {selectedUser.currentTrack.title}
                            </AppText>
                            <AppText style={styles.musicTrackArtist} numberOfLines={1}>
                              {selectedUser.currentTrack.artist}
                            </AppText>
                          </View>
                        </View>
                      </View>
                    )}

                    {selectedUser.bio ? (
                      <AppText style={styles.bioText}>{selectedUser.bio}</AppText>
                    ) : null}

                    {/* Roles Section */}
                    <View style={styles.rolesContainer}>
                      <AppText style={styles.rolesTitle}>Roles</AppText>
                      <View style={styles.rolesRow}>
                        {selectedUser.roles && selectedUser.roles.length > 0 ? (
                          selectedUser.roles.map((role) => {
                            const config = ROLE_CONFIG[role];
                            return (
                              <View key={role} style={[styles.rolePill, { backgroundColor: config.color + '20', borderColor: config.color }]}>
                                <Ionicons name={config.icon} size={14} color={config.color} />
                                <AppText style={[styles.roleText, { color: config.color }]}>{config.label}</AppText>
                              </View>
                            );
                          })
                        ) : (
                          <AppText style={styles.noRolesText}>No roles</AppText>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <>
                  {currentStoryUri ? (
                    <Image
                      source={{ uri: currentStoryUri }}
                      style={styles.cardImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.cardImage, styles.cardImageFallback]} />
                  )}
                  <LinearGradient
                    colors={['rgba(0,0,0,0.4)', 'transparent', 'transparent', 'rgba(0,0,0,0.7)']}
                    locations={[0, 0.25, 0.6, 1]}
                    style={styles.gradientOverlay}
                  />
                </>
              )}
            </Pressable>

            {/* Touch areas for story navigation */}
            <View style={styles.storyTouchAreas}>
              <Pressable style={styles.storyTouchLeft} onPress={handlePrevStory} />
              <Pressable style={styles.storyTouchRight} onPress={handleNextStory} />
            </View>

            {/* Top section */}
            <View style={styles.topSection}>
              <View style={styles.storySegments}>
                {Array.from({ length: totalSegments }).map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.segmentBar,
                      index === currentPosition && styles.segmentBarActive,
                      index < currentPosition && styles.segmentBarCompleted,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.topBar}>
                <Pressable onPress={closeModal} style={styles.closeButton}>
                  <Ionicons name="chevron-down" size={28} color="#fff" />
                </Pressable>

                <View style={styles.topSpacer} />

                <View style={styles.topActions}>
                  <Pressable style={styles.actionButton} onPress={handleInfoPress}>
                    <Ionicons name="information-circle-outline" size={24} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Bottom section - inside card */}
            {!showBio && !isSelfPreview && (
              <View style={styles.bottomSection}>
                <View style={styles.nameRow}>
                  <AppText style={styles.displayName}>{selectedUser.name}</AppText>
                </View>

                {/* Comment input row */}
                <View style={styles.chatInputRow}>
                  <Pressable
                    style={[styles.heartButton, isLiked && styles.heartButtonActive]}
                    onPress={handleLikePhoto}
                  >
                    <Ionicons
                      name={isLiked ? "heart" : "heart-outline"}
                      size={24}
                      color={isLiked ? colors.accentDanger : "rgba(255,255,255,0.6)"}
                    />
                  </Pressable>
                  <View style={styles.chatInputContainer}>
                    <TextInput
                      style={styles.chatInput}
                      placeholder="Comment on photo..."
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      value={commentMessage}
                      onChangeText={setCommentMessage}
                      returnKeyType="send"
                      onSubmitEditing={handleSendComment}
                    />
                    {commentMessage.trim().length > 0 && (
                      <Pressable onPress={handleSendComment} style={styles.sendButton}>
                        <Ionicons name="send" size={20} color={colors.accentPrimary} />
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Action buttons - outside card, below it */}
          {!isSelfPreview && (
            <View style={styles.externalActionsRow}>
              <Pressable
                style={[styles.externalActionBtn, (friendStatus === 'friends' || friendStatus === 'requested') && styles.externalActionBtnActive]}
                onPress={handleToggleFriend}
              >
                <Ionicons
                  name={friendStatus === 'friends' ? 'person' : friendStatus === 'requested' ? 'person-remove-outline' : 'person-add'}
                  size={24}
                  color={(friendStatus === 'friends' || friendStatus === 'requested') ? "#fff" : "rgba(255,255,255,0.7)"}
                />
              </Pressable>

              {/* Only show DM button if user is a friend */}
              {friendStatus === 'friends' && (
                <Pressable style={styles.dmButton} onPress={handleOpenDM}>
                  <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
                </Pressable>
              )}
            </View>
          )}
        </Animated.View>

        {/* Toast notification */}
        {toastMessage && (
          <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
            <BlurView intensity={80} tint="dark" style={styles.toastBlur}>
              <View style={styles.toastContent}>
                <Ionicons
                  name={toastMessage.includes('Like') ? 'heart' : toastMessage.includes('Comment') ? 'chatbubble' : 'checkmark-circle'}
                  size={20}
                  color={colors.accentPrimary}
                />
                <AppText style={styles.toastText}>{toastMessage}</AppText>
              </View>
            </BlurView>
          </Animated.View>
        )}

        {/* Profile Preview Modal */}
        {isPreviewMode && (
          <Modal
            visible={true}
            animationType="fade"
            transparent={true}
            statusBarTranslucent
            onRequestClose={closePreviewMode}
          >
            <View style={styles.previewContainer}>
              <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />

              {/* Full screen image */}
              <Pressable style={StyleSheet.absoluteFill} onPress={closePreviewMode}>
                {primaryImageUri ? (
                  <Image
                    source={{ uri: primaryImageUri }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.previewImageFallback} />
                )}
              </Pressable>

              {/* Close button */}
              <Pressable style={styles.previewCloseButton} onPress={closePreviewMode}>
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
            </View>
          </Modal>
        )}
      </View>

      {/* Confirmation Modal - Full Screen Overlay */}
      {showConfirmModal && (
        <Modal
          visible={true}
          animationType="fade"
          transparent={true}
          statusBarTranslucent
          onRequestClose={cancelConfirm}
        >
          {/* Full screen blur background */}
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

          <Pressable style={styles.confirmOverlay} onPress={cancelConfirm}>
            <Pressable style={styles.confirmModal} onPress={(e) => e.stopPropagation()}>
              <View style={styles.confirmIconContainer}>
                <Ionicons
                  name={confirmAction === 'cancel' ? 'person-remove-outline' : 'person-remove'}
                  size={32}
                  color={colors.accentDanger}
                />
              </View>

              <AppText style={styles.confirmTitle}>
                {confirmAction === 'cancel' ? 'Cancel Request?' : 'Unfriend?'}
              </AppText>

              <AppText style={styles.confirmMessage}>
                {confirmAction === 'cancel'
                  ? 'Are you sure you want to cancel your friend request?'
                  : `Are you sure you want to remove ${selectedUser?.name} from your friends list?`}
              </AppText>

              <View style={styles.confirmButtons}>
                <Pressable style={styles.confirmCancel} onPress={cancelConfirm}>
                  <AppText style={styles.confirmCancelText}>Cancel</AppText>
                </Pressable>

                <Pressable style={styles.confirmYes} onPress={executeConfirmAction}>
                  <AppText style={styles.confirmYesText}>
                    {confirmAction === 'cancel' ? 'Yes, Cancel' : 'Remove'}
                  </AppText>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  cardWrapper: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dragHandleArea: {
    alignItems: 'center',
    paddingVertical: 12,
    width: '100%',
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 3,
    marginBottom: 8,
  },
  usernameAbove: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    ...Platform.select({
      web: {
        textShadow: '0px 1px 4px rgba(0, 0, 0, 0.5)',
      },
      default: {
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
      },
    }),
  },
  card: {
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cardImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  cardImageFallback: {
    backgroundColor: colors.surfaceAlt,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bioContainer: {
    flex: 1,
  },
  bioDarkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  bioContent: {
    flex: 1,
    padding: spacing.xl,
    paddingTop: 80,
    justifyContent: 'center',
  },
  bioText: {
    fontSize: 18,
    color: '#fff',
    lineHeight: 28,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  musicWidget: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  musicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  equalizer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
  },
  eqBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.accentSuccess,
  },
  musicLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accentSuccess,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  musicTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  musicArtwork: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  musicArtworkFallback: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  musicTrackText: {
    flex: 1,
    minWidth: 0,
  },
  musicTrackTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  musicTrackArtist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  rolesContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  rolesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: spacing.sm,
    opacity: 0.9,
  },
  rolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  noRolesText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  storyTouchAreas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 100,
    flexDirection: 'row',
    zIndex: 5,
  },
  storyTouchLeft: {
    flex: 1,
  },
  storyTouchRight: {
    flex: 1,
  },
  topSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    zIndex: 10,
  },
  storySegments: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: 4,
    marginBottom: spacing.sm,
  },
  segmentBar: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  segmentBarActive: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  segmentBarCompleted: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  closeButton: {
    padding: spacing.xs,
  },
  topSpacer: {
    flex: 1,
  },
  topActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: spacing.xs,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    zIndex: 10,
  },
  displayName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heartButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatInputContainer: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    height: 48,
    justifyContent: 'center',
  },
  chatInput: {
    color: '#fff',
    fontSize: 16,
  },
  addFriendContainer: {
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  addFriendButton: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
    }),
    elevation: 8,
    flexDirection: 'row',
  },
  addFriendText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  // New styles for updated bottom section
  heartButtonActive: {
    backgroundColor: 'rgba(255,100,100,0.2)',
  },
  sendButton: {
    position: 'absolute',
    right: spacing.md,
    padding: spacing.xs,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentPrimary,
  },
  actionBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  actionBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtnTextSecondary: {
    color: '#fff',
  },
  actionBtnDM: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentPrimarySoft,
  },
  actionBtnTextDM: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Toast styles
  toastContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  toastBlur: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // External action buttons (below card)
  externalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  externalActionBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  externalActionBtnActive: {
    backgroundColor: 'rgba(123,97,255,0.3)',
    borderColor: 'rgba(123,97,255,0.5)',
  },
  dmButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: `0px 4px 8px ${colors.accentPrimary}66`,
      },
      default: {
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
    }),
    elevation: 8,
  },
  // Confirmation modal styles
  confirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  confirmModal: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
    ...Platform.select({
      web: {
        boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.5)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
    }),
    elevation: 20,
  },
  confirmIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 94, 94, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  confirmTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  confirmMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  confirmCancel: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confirmYes: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentDanger,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: `0px 4px 8px ${colors.accentDanger}4D`,
      },
      default: {
        shadowColor: colors.accentDanger,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
    }),
    elevation: 4,
  },
  confirmYesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Preview styles
  imagePressable: {
    flex: 1,
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewImageFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceAlt,
  },
  previewCloseButton: {
    position: 'absolute',
    top: 60, // Fixed value instead of insets.top
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
