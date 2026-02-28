import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppScreen, AppText } from '../src/components';
import { useAuth as useSessionAuth } from '../src/auth/spacetimeSession';
import { colors, radius, spacing } from '../src/theme';
import { useProfile } from '../src/context/ProfileContext';
import { useUserProfile, UserProfilePhoto } from '../src/context/UserProfileContext';
import { LiveUser } from '../src/features/liveroom/types';
import { useAppIsActive } from '../src/hooks/useAppIsActive';
import { subscribeBootstrap } from '../src/lib/spacetime';

type Photo = UserProfilePhoto;

export default function EditProfileScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useSessionAuth();
  const { showProfile } = useProfile();
  const { userProfile, updateUserProfile, updateAvatar } = useUserProfile();
  const [displayName, setDisplayName] = useState(userProfile.name);
  const [bio, setBio] = useState(userProfile.bio);

  const BIO_MAX_LENGTH = 150;

  const shouldSubscribe = isAppActive && isFocused && isAuthLoaded && isSignedIn && !!userId;

  useEffect(() => {
    if (!shouldSubscribe) {
      return;
    }
    return subscribeBootstrap();
  }, [shouldSubscribe]);

  useEffect(() => {
    setDisplayName(userProfile.name);
  }, [userProfile.name]);

  useEffect(() => {
    setBio(userProfile.bio);
  }, [userProfile.bio]);

  // Auto-save changes
  useEffect(() => {
    const timer = setTimeout(() => {
      updateUserProfile({
        name: displayName,
        bio: bio,
      });
    }, 500); // Debounce auto-save

    return () => clearTimeout(timer);
  }, [displayName, bio, updateUserProfile]);

  const photos = userProfile.photos;

  const handleBack = () => {
    // Auto-save already handled by useEffect
    router.back();
  };

  const handleSavePreview = () => {
    showProfile(previewUser);
  };

  const previewUser: LiveUser = {
    id: userProfile.id,
    name: displayName,
    username: userProfile.username,
    age: userProfile.age,
    verified: false,
    country: userProfile.country,
    bio: bio,
    avatarUrl: userProfile.avatarUrl || photos[0]?.uri || '',
    roles: userProfile.roles,
    photos: photos.map((photo) => photo.uri),
    isListening: false,
    isSelfPreview: true,
    isFriend: false,
  };

  const handleManagePhotos = () => {
    router.push('/manage-photos' as any);
  };

  const renderPhotoItem = ({ item }: { item: Photo }) => (
    <Pressable
      onPress={() => updateAvatar(item.uri)}
      onLongPress={handleManagePhotos}
      style={[styles.photoItem, userProfile.avatarUrl === item.uri && styles.photoItemActive]}
    >
      <Image source={{ uri: item.uri }} style={styles.photoImage} />
      {item.isVideo && (
        <View style={styles.videoIndicator}>
          <Ionicons name="videocam" size={12} color={colors.textPrimary} />
        </View>
      )}
    </Pressable>
  );

  return (
    <AppScreen>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="h2" style={styles.headerTitle}>Edit Profile</AppText>
        <Pressable onPress={handleSavePreview} style={styles.saveButton}>
          <AppText style={styles.saveButtonText}>Preview</AppText>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Your Photos Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="body" style={styles.sectionTitle}>
              Your photos ({photos.length})
            </AppText>
            <Pressable onPress={handleManagePhotos} style={styles.seeAllButton}>
              <AppText style={styles.seeAllText}>See all</AppText>
            </Pressable>
          </View>

          <FlatList
            data={[{ id: 'add', isAdd: true }, ...photos]}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.photosList}
            renderItem={({ item }) => {
              if ('isAdd' in item && item.isAdd) {
                return (
                  <Pressable onPress={handleManagePhotos} style={styles.addPhotoButton}>
                    <View style={styles.addPhotoIcon}>
                      <Ionicons name="add" size={32} color={colors.accentPrimary} />
                    </View>
                  </Pressable>
                );
              }
              return renderPhotoItem({ item: item as Photo });
            }}
          />
        </View>

        {/* Display Name Section */}
        <View style={styles.section}>
          <AppText variant="body" style={styles.sectionTitle}>Display Name</AppText>
          <TextInput
            style={styles.textInput}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your display name"
            placeholderTextColor={colors.textMuted}
            maxLength={30}
          />
        </View>

        {/* Bio Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="body" style={styles.sectionTitle}>About Me</AppText>
            <AppText style={styles.charCount}>
              {bio.length}/{BIO_MAX_LENGTH}
            </AppText>
          </View>
          <TextInput
            style={[styles.textInput, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Write something about yourself..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={BIO_MAX_LENGTH}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  saveButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.full,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 15,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentCash,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  previewText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentCashText,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl * 2,
  },
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  seeAllButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xsPlus,
    borderRadius: radius.full,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  photosList: {
    gap: spacing.sm,
  },
  addPhotoButton: {
    width: 100,
    height: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentPrimarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoItem: {
    width: 100,
    height: 140,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photoItemActive: {
    borderWidth: 2,
    borderColor: colors.accentPrimary,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  videoIndicator: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  bioInput: {
    height: 100,
    paddingTop: spacing.md,
  },
  charCount: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
