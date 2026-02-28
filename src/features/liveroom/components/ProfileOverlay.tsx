import React from 'react';
import { View, StyleSheet, Modal, Pressable, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { LiveUser } from '../types';
import { hapticTap } from '../../../utils/haptics';
import { normalizeImageUri } from '../../../utils/imageSource';

type ProfileOverlayProps = {
  visible: boolean;
  onClose: () => void;
  user: LiveUser | null;
  isSelfPreview?: boolean;
};

export function ProfileOverlay({ visible, onClose, user, isSelfPreview }: ProfileOverlayProps) {
  if (!user) return null;
  const avatarUri = normalizeImageUri(user.avatarUrl);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.container}>
          {/* Close button */}
          <Pressable 
            style={styles.closeButton}
            onPress={() => {
              hapticTap();
              onClose();
            }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>

          {/* Profile Card */}
          <Pressable 
            style={styles.card}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Avatar section with background */}
            <View style={styles.avatarSection}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarBg} blurRadius={30} />
              ) : (
                <View style={[styles.avatarBg, styles.avatarBgFallback]} />
              )}
              <View style={styles.avatarOverlay} />
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={44} color={colors.textMuted} />
                </View>
              )}
            </View>

            {/* Info */}
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <AppText variant="h3" style={styles.name}>
                  {user.name}, {user.age}
                </AppText>
              </View>
              
              <AppText style={styles.username}>@{user.username}</AppText>

              <View style={styles.locationRow}>
                <Ionicons name="home-outline" size={14} color={colors.textMuted} />
                <AppText style={styles.locationText}>{user.country}</AppText>
              </View>

              {user.bio && (
                <AppText style={styles.bio}>{user.bio}</AppText>
              )}
            </View>

            {/* Actions - hidden for self preview */}
            {!isSelfPreview && (
              <View style={styles.actions}>
                <Pressable 
                  style={styles.actionButton}
                  onPress={() => hapticTap()}
                >
                  <Ionicons name="chatbubble-outline" size={20} color="#fff" />
                  <AppText style={styles.actionText}>Message</AppText>
                </Pressable>
                
                <Pressable 
                  style={[styles.actionButton, styles.followButton]}
                  onPress={() => hapticTap()}
                >
                  <Ionicons name="person-add-outline" size={20} color="#fff" />
                  <AppText style={styles.actionText}>Follow</AppText>
                </Pressable>
              </View>
            )}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
  },

  // Avatar section
  avatarSection: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.md,
  },
  avatarBg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  avatarBgFallback: {
    backgroundColor: colors.surfaceAlt,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Info
  info: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  name: {
    color: colors.textPrimary,
  },
  username: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  locationText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  bio: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  followButton: {
    backgroundColor: colors.accentPrimary,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

