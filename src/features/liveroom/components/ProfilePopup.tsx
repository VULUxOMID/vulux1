import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
  GestureResponderEvent,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { LiveUser } from '../types';
import { hapticTap } from '../../../utils/haptics';
import { normalizeImageUri } from '../../../utils/imageSource';

const SWIPE_THRESHOLD = 80;

type ProfilePopupProps = {
  visible: boolean;
  onClose: () => void;
  user: LiveUser | null;
  photos?: string[];
  isSelfPreview?: boolean;
};

export function ProfilePopup({ visible, onClose, user, photos, isSelfPreview }: ProfilePopupProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [startY, setStartY] = useState(0);

  if (!user) return null;

  const sanitizedPhotos = (photos ?? [])
    .map((photo) => normalizeImageUri(photo))
    .filter((photo): photo is string => Boolean(photo));
  const fallbackAvatar = normalizeImageUri(user.avatarUrl);
  // Use provided photos or fall back to user avatar
  const userPhotos = sanitizedPhotos.length > 0 ? sanitizedPhotos : fallbackAvatar ? [fallbackAvatar] : [];

  // Add bio page if bio exists
  const hasBio = !!user.bio;
  const totalPages = userPhotos.length + (hasBio ? 1 : 0);
  const trackArtworkUri = normalizeImageUri(user.currentTrack?.artwork);

  const handleNextPhoto = () => {
    if (currentPhotoIndex < totalPages - 1) {
      setCurrentPhotoIndex(currentPhotoIndex + 1);
    }
  };

  const handlePrevPhoto = () => {
    if (currentPhotoIndex > 0) {
      setCurrentPhotoIndex(currentPhotoIndex - 1);
    }
  };

  const handleClose = () => {
    hapticTap();
    setCurrentPhotoIndex(0);
    onClose();
  };

  // Simple swipe detection
  const handleTouchStart = (e: GestureResponderEvent) => {
    setStartY(e.nativeEvent.pageY);
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    const endY = e.nativeEvent.pageY;
    const deltaY = endY - startY;
    if (deltaY > SWIPE_THRESHOLD) {
      handleClose();
    }
  };

  const renderContent = () => {
    // Check if we are on the bio page (last page if bio exists)
    if (hasBio && currentPhotoIndex === userPhotos.length) {
      return (
        <View style={styles.bioContainer}>
          {userPhotos[0] ? (
            <Image
              source={{ uri: userPhotos[0] }}
              style={[styles.photo, styles.bioBackground]}
              blurRadius={20}
            />
          ) : (
            <View style={[styles.photo, styles.bioBackground, styles.photoFallback]}>
              <Ionicons name="person" size={40} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.bioOverlay} />
          <View style={styles.bioContent}>
            {/* Unified Bio Card */}
            <View style={styles.unifiedCard}>
              {/* Music Listening Widget - Only shown when listening */}
              {user.isListening && user.currentTrack && (
                <View style={styles.sectionContainer}>
                  <View style={styles.musicHeader}>
                    <View style={styles.equalizer}>
                      <View style={[styles.bar, { height: 8 }]} />
                      <View style={[styles.bar, { height: 12 }]} />
                      <View style={[styles.bar, { height: 6 }]} />
                    </View>
                    <AppText variant="tiny" style={styles.listeningText}>LISTENING TO</AppText>
                  </View>
                  <View style={styles.trackInfo}>
                    {trackArtworkUri ? (
                      <Image source={{ uri: trackArtworkUri }} style={styles.trackArtwork} />
                    ) : (
                      <View style={[styles.trackArtwork, styles.trackArtworkFallback]}>
                        <Ionicons name="musical-notes" size={16} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.trackText}>
                      <AppText variant="body" numberOfLines={1} style={styles.trackTitle}>
                        {user.currentTrack.title}
                      </AppText>
                      <AppText variant="small" secondary numberOfLines={1}>
                        {user.currentTrack.artist}
                      </AppText>
                    </View>
                  </View>
                </View>
              )}

              {/* Divider after music if music exists and there's more content */}
              {user.isListening && user.currentTrack && (user.roles?.length || user.bio) && (
                <View style={styles.divider} />
              )}

              {/* Roles Section - Always shown if roles exist */}
              {user.roles && user.roles.length > 0 && (
                <View style={styles.sectionContainer}>
                  <AppText variant="small" secondary style={styles.sectionLabel}>ROLES</AppText>
                  <View style={styles.rolesContainer}>
                    {user.roles.map((role, index) => (
                      <View key={index} style={styles.roleBadge}>
                        <AppText variant="tiny" style={styles.roleText}>{role}</AppText>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Divider after roles if both roles and bio exist */}
              {user.roles?.length && user.bio && <View style={styles.divider} />}

              {/* Bio Section - Only shown if bio exists */}
              {user.bio && (
                <View style={styles.sectionContainer}>
                  <AppText variant="small" secondary style={styles.sectionLabel}>ABOUT ME</AppText>
                  <AppText style={styles.bioText}>{user.bio}</AppText>
                </View>
              )}
            </View>
          </View>
        </View>
      );
    }

    // Otherwise render photo
    const photoUri = userPhotos[currentPhotoIndex];
    if (!photoUri) {
      return (
        <View style={[styles.photo, styles.photoFallback]}>
          <Ionicons name="person" size={40} color={colors.textMuted} />
        </View>
      );
    }
    return <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View
        style={styles.container}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle bar */}
        <Pressable onPress={handleClose} style={styles.handleBarContainer}>
          <View style={styles.handleBar} />
        </Pressable>

        {/* Username */}
        <AppText style={styles.username}>@{user.username}</AppText>

        {/* Photo Card */}
        <View style={[styles.photoCard, { width: screenWidth - spacing.lg * 2, height: screenHeight * 0.65 }]}>
          {/* Progress indicators */}
          {totalPages > 1 && (
            <View style={styles.progressBar}>
              {Array.from({ length: totalPages }).map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.progressSegment,
                    index === currentPhotoIndex && styles.progressSegmentActive,
                    index < currentPhotoIndex && styles.progressSegmentComplete,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Close button */}
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
          </Pressable>

          {/* Info button */}
          <Pressable style={styles.infoButton}>
            <Ionicons name="information-circle-outline" size={24} color={colors.textPrimary} />
          </Pressable>

          {/* Main Content (Photo or Bio) */}
          {renderContent()}

          {/* Touch areas for navigation */}
          <Pressable style={styles.leftTouchArea} onPress={handlePrevPhoto} />
          <Pressable style={styles.rightTouchArea} onPress={handleNextPhoto} />

          {/* Name - Hide on Bio page */}
          {(!hasBio || currentPhotoIndex !== userPhotos.length) && (
            <View style={styles.nameContainer}>
              <AppText variant="h2" style={styles.name}>{user.name}</AppText>
            </View>
          )}
        </View>

        {/* Bottom actions - only show for other users, not self preview */}
        {!isSelfPreview && (
          <>
            <View style={styles.bottomActions}>
              {/* Chat input */}
              <View style={styles.chatInput}>
                <AppText style={styles.chatPlaceholder}>Send a chat</AppText>
              </View>
            </View>

            {/* Add friend button */}
            <View style={styles.addFriendButton}>
              <Ionicons name="person-add" size={24} color="#fff" />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    backgroundColor: colors.background,
  },
  handleBarContainer: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
  },
  username: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  photoCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  progressBar: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: 4,
    zIndex: 10,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressSegmentActive: {
    backgroundColor: colors.textPrimary,
  },
  progressSegmentComplete: {
    backgroundColor: colors.textPrimary,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.md,
    zIndex: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.md,
    zIndex: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  leftTouchArea: {
    position: 'absolute',
    left: 0,
    top: 60,
    bottom: 60,
    width: '30%',
    zIndex: 20,
  },
  rightTouchArea: {
    position: 'absolute',
    right: 0,
    top: 60,
    bottom: 60,
    width: '30%',
    zIndex: 20,
  },
  nameContainer: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
  },
  name: {
    color: colors.textPrimary,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  chatInput: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  chatPlaceholder: {
    color: colors.textMuted,
    fontSize: 14,
  },
  addFriendButton: {
    position: 'absolute',
    bottom: 40,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  bioBackground: {
    opacity: 0.5,
  },
  bioOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bioContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.lg,
  },
  sectionLabel: {
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    opacity: 0.7,
  },
  // Unified Card Styles
  unifiedCard: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sectionContainer: {
    paddingVertical: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: spacing.sm,
  },
  // Music Widget Styles
  musicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  equalizer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 12,
  },
  bar: {
    width: 2,
    backgroundColor: colors.accentSuccess,
    borderRadius: 1,
  },
  listeningText: {
    color: colors.accentSuccess,
    fontWeight: 'bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trackArtwork: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  trackArtworkFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackText: {
    flex: 1,
  },
  trackTitle: {
    fontWeight: '600',
  },
  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  roleBadge: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  roleText: {
    color: '#000',
    fontWeight: '600',
  },
  bioText: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
});
