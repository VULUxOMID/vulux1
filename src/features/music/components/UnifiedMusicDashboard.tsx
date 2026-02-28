import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image } from 'react-native';
import { AppText } from '../../../components/AppText';
import { colors } from '../../../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import type { Track, Playlist } from '../types';
import { PlaylistCard } from './PlaylistCard';
import { TrackRow } from './TrackRow';
import { useMusic } from '../context/MusicContext';
import { CreatePlaylistModal } from './CreatePlaylistModal';
import { UploadTrackModal } from './UploadTrackModal';
import { useMusicCatalogRepo } from '../../../data/provider';

interface UnifiedMusicDashboardProps {
  onTrackPress: (track: Track, queue: Track[]) => void;
  onPlaylistPress: (playlist: Playlist) => void;
  currentTrackId?: string;
  onCategoriesPress: () => void;
  onOfflinePress: () => void;
  offlineCount: number;
}

export const UnifiedMusicDashboard = ({
  onTrackPress,
  onPlaylistPress,
  currentTrackId,
  onCategoriesPress,
  onOfflinePress,
  offlineCount,
}: UnifiedMusicDashboardProps) => {
  const { playlists, likedTrackIds } = useMusic();
  const musicCatalogRepo = useMusicCatalogRepo();
  const tracksCatalog = useMemo(
    () => musicCatalogRepo.listTracks({ limit: 300 }),
    [musicCatalogRepo],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isUploadModalVisible, setUploadModalVisible] = useState(false);
  const [discoveryView, setDiscoveryView] = useState<'trending' | 'new'>('trending');

  // Filter Logic
  const filteredTracks = useMemo(() => {
    if (!searchQuery) return tracksCatalog;
    const lowerQuery = searchQuery.toLowerCase();
    return tracksCatalog.filter(t =>
      t.title.toLowerCase().includes(lowerQuery) ||
      t.artist.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery, tracksCatalog]);

  const filteredPlaylists = useMemo(() => {
    if (!searchQuery) return playlists;
    const lowerQuery = searchQuery.toLowerCase();
    return playlists.filter(p =>
      p.title.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery, playlists]);

  // Handlers
  const handleLikedSongsPress = () => {
    const likedPlaylist: Playlist = {
      id: 'liked-songs',
      title: 'Liked Songs',
      description: 'Your collection of favorite tracks.',
      cover: '',
      tracks: Array.from(likedTrackIds),
    };
    onPlaylistPress(likedPlaylist);
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.searchSection}>
          <View style={styles.searchBarWrapper}>
            {searchQuery ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
            <View style={[styles.searchContainer, searchQuery ? styles.searchContainerWithBack : null]}>
              <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search library & songs..."
                placeholderTextColor={colors.inputPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>
          <View style={styles.uploadContainer}>
            <TouchableOpacity style={styles.uploadButton} onPress={() => setUploadModalVisible(true)}>
              <Ionicons name="cloud-upload-outline" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Quick Actions (Only visible when not searching) */}
          {!searchQuery && (
            <View style={styles.quickActionsContainer}>
              <TouchableOpacity style={styles.quickActionCard} onPress={handleLikedSongsPress}>
                <View style={[styles.iconBox, { backgroundColor: colors.accentPrimary }]}>
                  <Ionicons name="heart" size={20} color={colors.background} />
                </View>
                <View style={styles.textContainer}>
                  <AppText style={styles.quickActionTitle} numberOfLines={1}>Liked</AppText>
                  <AppText style={styles.quickActionSubtitle} numberOfLines={1}>{likedTrackIds.size} songs</AppText>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickActionCard} onPress={onOfflinePress}>
                <View style={[styles.iconBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="download" size={20} color={colors.textPrimary} />
                </View>
                <View style={styles.textContainer}>
                  <AppText style={styles.quickActionTitle} numberOfLines={1}>Offline</AppText>
                  <AppText style={styles.quickActionSubtitle} numberOfLines={1}>{offlineCount} songs</AppText>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickActionCard} onPress={() => setCreateModalVisible(true)}>
                <View style={[styles.iconBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="add" size={24} color={colors.textPrimary} />
                </View>
                <View style={styles.textContainer}>
                  <AppText style={styles.quickActionTitle} numberOfLines={1}>Playlist</AppText>
                  <AppText style={styles.quickActionSubtitle} numberOfLines={1}>New</AppText>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Search Results State */}
          {searchQuery ? (
            <>
              {filteredPlaylists.length > 0 && (
                <View style={styles.section}>
                  <AppText style={styles.sectionTitle}>Matching Playlists</AppText>
                  {filteredPlaylists.map(playlist => (
                    <TouchableOpacity
                      key={playlist.id}
                      style={styles.searchResultRow}
                      onPress={() => onPlaylistPress(playlist)}
                    >
                      <Image source={{ uri: playlist.cover }} style={styles.smallCover} />
                      <View style={{ flex: 1 }}>
                        <AppText style={styles.resultTitle}>{playlist.title}</AppText>
                        <AppText style={styles.resultSubtitle}>Playlist</AppText>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {filteredTracks.length > 0 && (
                <View style={styles.section}>
                  <AppText style={styles.sectionTitle}>Matching Songs</AppText>
                  {filteredTracks.map(track => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      onPress={() => onTrackPress(track, filteredTracks)}
                      isPlaying={currentTrackId === track.id}
                    />
                  ))}
                </View>
              )}

              {filteredTracks.length === 0 && filteredPlaylists.length === 0 && (
                <View style={styles.emptyState}>
                  <AppText style={styles.emptyText}>No matches found.</AppText>
                </View>
              )}
            </>
          ) : (
            /* Browse State */
            <>
              {/* Your Playlists (Horizontal) */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <AppText style={styles.sectionTitle}>Your Playlists</AppText>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                  {playlists.map(playlist => (
                    <PlaylistCard
                      key={playlist.id}
                      playlist={playlist}
                      onPress={onPlaylistPress}
                    />
                  ))}
                  {playlists.length === 0 && (
                    <AppText style={styles.emptyText}>No playlists yet.</AppText>
                  )}
                </ScrollView>
              </View>

              {/* Discovery Section - Trending vs New Releases */}
              <View style={styles.section}>
                <View style={styles.toggleContainer}>
                  <TouchableOpacity
                    style={[styles.toggleButton, discoveryView === 'trending' && styles.toggleButtonActive]}
                    onPress={() => setDiscoveryView('trending')}
                  >
                    <AppText style={[styles.toggleText, discoveryView === 'trending' && styles.toggleTextActive]}>Trending</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleButton, discoveryView === 'new' && styles.toggleButtonActive]}
                    onPress={() => setDiscoveryView('new')}
                  >
                    <AppText style={[styles.toggleText, discoveryView === 'new' && styles.toggleTextActive]}>New Releases</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.toggleButton}
                    onPress={onCategoriesPress}
                  >
                    <AppText style={styles.toggleText}>Categories</AppText>
                  </TouchableOpacity>
                </View>

                {(discoveryView === 'trending' ? tracksCatalog.slice(0, 5) : [...tracksCatalog].reverse().slice(0, 5)).map(track => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    onPress={() => onTrackPress(track, tracksCatalog)}
                    isPlaying={currentTrackId === track.id}
                  />
                ))}
              </View>

            </>
          )}

        </ScrollView>
      </View>

      <CreatePlaylistModal
        visible={isCreateModalVisible}
        onClose={() => setCreateModalVisible(false)}
      />

      <UploadTrackModal
        visible={isUploadModalVisible}
        onClose={() => setUploadModalVisible(false)}
        onUploadSuccess={() => {
          setUploadModalVisible(false);
          // Optional: we could refresh the catalog here if we had a trigger
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 100,
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  searchBarWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  searchContainerWithBack: {
    marginLeft: 0,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
  },
  uploadContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    height: 40,
    alignItems: 'center',
    width: 60,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 12,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 12,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    marginRight: 0,
  },
  textContainer: {
    alignItems: 'center',
    width: '100%',
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  quickActionSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    paddingHorizontal: 16, // For titles that don't use header row
    marginBottom: 12,
  },
  seeAll: {
    fontSize: 14,
    color: colors.accentPrimary,
  },
  horizontalScroll: {
    paddingHorizontal: 16,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleButtonActive: {
    backgroundColor: colors.surface,
    borderColor: colors.accentPrimary,
    borderWidth: 1,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.textPrimary,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  smallCover: {
    width: 48,
    height: 48,
    borderRadius: 4,
    marginRight: 12,
    backgroundColor: colors.surfaceAlt,
  },
  resultTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  resultSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
