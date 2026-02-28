import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Pressable,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth/spacetimeSession';

import { AppScreen, AppText } from '../src/components';
import type { Track } from '../src/features/music/types';
import { colors, radius, spacing } from '../src/theme';
import { useAppIsActive } from '../src/hooks/useAppIsActive';
import { useMusicCatalogRepo } from '../src/data/provider';

export default function MusicHistoryScreen() {
  const router = useRouter();
  const isAppActive = useAppIsActive();
  const { userId, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const musicRepo = useMusicCatalogRepo();
  const [searchQuery, setSearchQuery] = useState('');
  const tracks = useMemo(
    () =>
      isAuthLoaded && isSignedIn && userId && isAppActive
        ? musicRepo.listTracks({ limit: 500 })
        : [],
    [isAppActive, isAuthLoaded, isSignedIn, musicRepo, userId],
  );

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const query = searchQuery.toLowerCase();
    return tracks.filter(
      (track) =>
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query)
    );
  }, [searchQuery, tracks]);

  const handleBack = () => {
    router.back();
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const renderTrackItem = ({ item, index }: { item: Track; index: number }) => (
    <Pressable style={styles.trackItem}>
      <View style={styles.trackNumber}>
        <AppText variant="small" secondary style={styles.trackNumberText}>
          {index + 1}
        </AppText>
      </View>
      <Image source={{ uri: item.artwork }} style={styles.trackArtwork} />
      <View style={styles.trackInfo}>
        <AppText variant="body" numberOfLines={1} style={styles.trackTitle}>
          {item.title}
        </AppText>
        <AppText variant="small" secondary numberOfLines={1}>
          {item.artist}
        </AppText>
      </View>
      <Pressable style={styles.playButton}>
        <Ionicons name="play" size={18} color={colors.textPrimary} />
      </Pressable>
    </Pressable>
  );

  return (
    <AppScreen>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="h2" style={styles.headerTitle}>
          Listening History
        </AppText>
        <View style={styles.placeholder} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons
            name="search"
            size={20}
            color={colors.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search songs, artists..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={handleClearSearch} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <AppText variant="small" secondary>
          {filteredTracks.length} {filteredTracks.length === 1 ? 'song' : 'songs'}
        </AppText>
      </View>

      {/* Track List */}
      <FlatList
        data={filteredTracks}
        keyExtractor={(item) => item.id}
        renderItem={renderTrackItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="musical-notes" size={48} color={colors.textMuted} />
            <AppText style={styles.emptyText}>No songs found</AppText>
          </View>
        }
      />
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  placeholder: {
    width: 44,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    height: 48,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    height: '100%',
  },
  clearButton: {
    padding: spacing.xs,
  },
  statsContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  trackNumber: {
    width: 28,
    alignItems: 'center',
  },
  trackNumberText: {
    fontWeight: '600',
  },
  trackArtwork: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  trackInfo: {
    flex: 1,
    gap: 4,
  },
  trackTitle: {
    fontWeight: '600',
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl * 2,
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 16,
  },
});
