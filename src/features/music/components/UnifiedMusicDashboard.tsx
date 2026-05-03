import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
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
import {
  searchYoutubeTracks,
  DEFAULT_YOUTUBE_SEARCH_OPTIONS,
  YOUTUBE_SEARCH_HELP_MESSAGE,
  YOUTUBE_SEARCH_HELP_TITLE,
} from '../services/youtubeAudioApi';
import {
  addRecentSearch,
  loadRecentPlays,
  loadRecentSearches,
  type RecentYoutubePlay,
} from '../searchHistory';

interface UnifiedMusicDashboardProps {
  onTrackPress: (track: Track, queue: Track[]) => void;
  onPlaylistPress: (playlist: Playlist) => void;
  currentTrackId?: string;
  onCategoriesPress: () => void;
  onOfflinePress: () => void;
  offlineCount: number;
}

function TrackRowSkeleton() {
  return (
    <View style={styles.skeletonRow}>
      <View style={styles.skeletonArt} />
      <View style={styles.skeletonTextCol}>
        <View style={styles.skeletonLineLg} />
        <View style={styles.skeletonLineSm} />
      </View>
    </View>
  );
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
  const [youtubeTracks, setYoutubeTracks] = useState<Track[]>([]);
  const [youtubeMeta, setYoutubeMeta] = useState<{
    searchResultCount: number;
    afterDetailFilterCount: number;
  } | null>(null);
  const [youtubePhase, setYoutubePhase] = useState<'idle' | 'search' | 'details' | 'done'>('idle');
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  const [lastYoutubePick, setLastYoutubePick] = useState<{ title: string; channelTitle: string } | null>(
    null,
  );
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentPlays, setRecentPlays] = useState<RecentYoutubePlay[]>([]);

  useEffect(() => {
    void (async () => {
      const [searches, plays] = await Promise.all([loadRecentSearches(), loadRecentPlays()]);
      setRecentSearches(searches);
      setRecentPlays(plays);
    })();
  }, []);

  const refreshHistory = useCallback(async () => {
    const [searches, plays] = await Promise.all([loadRecentSearches(), loadRecentPlays()]);
    setRecentSearches(searches);
    setRecentPlays(plays);
  }, []);

  // Filter Logic
  const filteredTracks = useMemo(() => {
    if (!searchQuery) return tracksCatalog;
    const lowerQuery = searchQuery.toLowerCase();
    return tracksCatalog.filter(
      (t) =>
        t.title.toLowerCase().includes(lowerQuery) || t.artist.toLowerCase().includes(lowerQuery),
    );
  }, [searchQuery, tracksCatalog]);

  const filteredPlaylists = useMemo(() => {
    if (!searchQuery) return playlists;
    const lowerQuery = searchQuery.toLowerCase();
    return playlists.filter(
      (p) =>
        p.title.toLowerCase().includes(lowerQuery) || p.description.toLowerCase().includes(lowerQuery),
    );
  }, [searchQuery, playlists]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setYoutubeTracks([]);
      setYoutubeMeta(null);
      setYoutubePhase('idle');
      setYoutubeLoading(false);
      setYoutubeError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setYoutubeLoading(true);
        setYoutubeError(null);
        setYoutubeTracks([]);
        setYoutubeMeta(null);
        setYoutubePhase('search');
        try {
          const results = await searchYoutubeTracks(query, {
            ...DEFAULT_YOUTUBE_SEARCH_OPTIONS,
            onPhase: (phase) => {
              if (!cancelled) {
                setYoutubePhase(phase);
              }
            },
          });
          if (!cancelled) {
            setYoutubeTracks(results.tracks);
            setYoutubeMeta(results.meta);
            setYoutubePhase('done');
            void addRecentSearch(query);
            void refreshHistory();
          }
        } catch (e) {
          if (!cancelled) {
            setYoutubeTracks([]);
            setYoutubeMeta(null);
            setYoutubePhase('done');
            setYoutubeError(e instanceof Error ? e.message : 'Search failed.');
          }
        } finally {
          if (!cancelled) {
            setYoutubeLoading(false);
          }
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, refreshHistory]);

  const mergedSearchTracks = useMemo(() => {
    if (!searchQuery) return filteredTracks;
    const merged = [...youtubeTracks, ...filteredTracks];
    const uniqueById = new Map<string, Track>();
    for (const track of merged) {
      if (!uniqueById.has(track.id)) {
        uniqueById.set(track.id, track);
      }
    }
    return Array.from(uniqueById.values());
  }, [filteredTracks, searchQuery, youtubeTracks]);

  const handleYoutubeSearchHelp = () => {
    Alert.alert(YOUTUBE_SEARCH_HELP_TITLE, YOUTUBE_SEARCH_HELP_MESSAGE);
  };

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

  const handleTrackPress = (track: Track, queue: Track[]) => {
    if (track.source === 'youtube-audio') {
      setLastYoutubePick({ title: track.title, channelTitle: track.artist });
    }
    onTrackPress(track, queue);
  };

  const searchLikeThis = () => {
    if (!lastYoutubePick) return;
    const q = `${lastYoutubePick.channelTitle} ${lastYoutubePick.title} official audio`.trim();
    setSearchQuery(q);
  };

  const statusLabel =
    youtubeLoading && youtubePhase === 'search'
      ? 'Searching…'
      : youtubeLoading && youtubePhase === 'details'
        ? 'Checking availability…'
        : null;

  const emptyYoutubeReason: 'none' | 'no_results' | 'all_filtered' | 'error' = youtubeError
    ? 'error'
    : youtubeMeta &&
        youtubeMeta.searchResultCount > 0 &&
        youtubeMeta.afterDetailFilterCount === 0 &&
        youtubeTracks.length === 0
      ? 'all_filtered'
      : youtubeMeta && youtubeMeta.searchResultCount === 0 && !youtubeLoading
        ? 'no_results'
        : 'none';

  return (
    <>
      <View style={styles.container}>
        <View style={styles.searchSection}>
          <View style={styles.searchBarWrapper}>
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.backButton}>
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
          {!searchQuery && recentSearches.length > 0 ? (
            <View style={styles.historySection}>
              <AppText style={styles.historySectionTitle}>Recent searches</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {recentSearches.map((q) => (
                  <TouchableOpacity key={q} style={styles.chip} onPress={() => setSearchQuery(q)}>
                    <AppText style={styles.chipText} numberOfLines={1}>
                      {q}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {!searchQuery && recentPlays.length > 0 ? (
            <View style={styles.historySection}>
              <AppText style={styles.historySectionTitle}>Recent plays</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {recentPlays.map((p) => (
                  <TouchableOpacity
                    key={p.videoId}
                    style={styles.chip}
                    onPress={() => setSearchQuery(`${p.artist} ${p.title}`.trim())}
                  >
                    <Ionicons name="play-circle-outline" size={16} color={colors.textMuted} style={styles.chipIcon} />
                    <AppText style={styles.chipText} numberOfLines={1}>
                      {p.title}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Quick Actions (Only visible when not searching) */}
          {!searchQuery && (
            <View style={styles.quickActionsContainer}>
              <TouchableOpacity style={styles.quickActionCard} onPress={handleLikedSongsPress}>
                <View style={[styles.iconBox, { backgroundColor: colors.accentPrimary }]}>
                  <Ionicons name="heart" size={20} color={colors.background} />
                </View>
                <View style={styles.textContainer}>
                  <AppText style={styles.quickActionTitle} numberOfLines={1}>
                    Liked
                  </AppText>
                  <AppText style={styles.quickActionSubtitle} numberOfLines={1}>
                    {likedTrackIds.size} songs
                  </AppText>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickActionCard} onPress={onOfflinePress}>
                <View style={[styles.iconBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="download" size={20} color={colors.textPrimary} />
                </View>
                <View style={styles.textContainer}>
                  <AppText style={styles.quickActionTitle} numberOfLines={1}>
                    Offline
                  </AppText>
                  <AppText style={styles.quickActionSubtitle} numberOfLines={1}>
                    {offlineCount} songs
                  </AppText>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.quickActionCard} onPress={() => setCreateModalVisible(true)}>
                <View style={[styles.iconBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="add" size={24} color={colors.textPrimary} />
                </View>
                <View style={styles.textContainer}>
                  <AppText style={styles.quickActionTitle} numberOfLines={1}>
                    Playlist
                  </AppText>
                  <AppText style={styles.quickActionSubtitle} numberOfLines={1}>
                    New
                  </AppText>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {searchQuery ? (
            <>
              {lastYoutubePick ? (
                <View style={styles.searchLikeBanner}>
                  <TouchableOpacity style={styles.searchLikeRow} onPress={searchLikeThis}>
                    <Ionicons name="sparkles-outline" size={18} color={colors.accentPrimary} />
                    <AppText style={styles.searchLikeText}>Search like this</AppText>
                  </TouchableOpacity>
                </View>
              ) : null}

              {filteredPlaylists.length > 0 && (
                <View style={styles.section}>
                  <AppText style={styles.sectionTitle}>Matching Playlists</AppText>
                  {filteredPlaylists.map((playlist) => (
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

              {youtubeLoading && mergedSearchTracks.length === 0 && (
                <>
                  <View style={styles.statusRow}>
                    {statusLabel ? <AppText style={styles.statusText}>{statusLabel}</AppText> : null}
                    <ActivityIndicator size="small" color={colors.accentPrimary} />
                  </View>
                  <View style={styles.section}>
                    {[0, 1, 2, 3].map((i) => (
                      <TrackRowSkeleton key={i} />
                    ))}
                  </View>
                </>
              )}

              {youtubeLoading && mergedSearchTracks.length > 0 && (
                <View style={styles.statusRow}>
                  {statusLabel ? <AppText style={styles.statusText}>{statusLabel}</AppText> : null}
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
                </View>
              )}

              {mergedSearchTracks.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionTitleRow}>
                    <AppText style={styles.sectionTitleWithAction}>Matching Songs</AppText>
                    {searchQuery.trim().length > 0 ? (
                      <TouchableOpacity
                        onPress={handleYoutubeSearchHelp}
                        accessibilityLabel="How YouTube search works"
                        accessibilityRole="button"
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="information-circle-outline" size={22} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {mergedSearchTracks.map((track) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      onPress={() => handleTrackPress(track, mergedSearchTracks)}
                      isPlaying={currentTrackId === track.id}
                    />
                  ))}
                </View>
              )}

              {!youtubeLoading &&
                mergedSearchTracks.length === 0 &&
                filteredPlaylists.length === 0 && (
                  <View style={styles.emptyState}>
                    {emptyYoutubeReason === 'error' ? (
                      <AppText style={styles.emptyText}>{youtubeError}</AppText>
                    ) : emptyYoutubeReason === 'all_filtered' ? (
                      <AppText style={styles.emptyText}>
                        No videos available in your region for these results (or they were filtered out).
                      </AppText>
                    ) : emptyYoutubeReason === 'no_results' ? (
                      <AppText style={styles.emptyText}>No results for this search.</AppText>
                    ) : (
                      <AppText style={styles.emptyText}>No matches found.</AppText>
                    )}
                  </View>
                )}
            </>
          ) : (
            <>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <AppText style={styles.sectionTitle}>Your Playlists</AppText>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalScroll}
                >
                  {playlists.map((playlist) => (
                    <PlaylistCard key={playlist.id} playlist={playlist} onPress={onPlaylistPress} />
                  ))}
                  {playlists.length === 0 && <AppText style={styles.emptyText}>No playlists yet.</AppText>}
                </ScrollView>
              </View>

              <View style={styles.section}>
                <View style={styles.toggleContainer}>
                  <TouchableOpacity
                    style={[styles.toggleButton, discoveryView === 'trending' && styles.toggleButtonActive]}
                    onPress={() => setDiscoveryView('trending')}
                  >
                    <AppText
                      style={[styles.toggleText, discoveryView === 'trending' && styles.toggleTextActive]}
                    >
                      Trending
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleButton, discoveryView === 'new' && styles.toggleButtonActive]}
                    onPress={() => setDiscoveryView('new')}
                  >
                    <AppText style={[styles.toggleText, discoveryView === 'new' && styles.toggleTextActive]}>
                      New Releases
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.toggleButton} onPress={onCategoriesPress}>
                    <AppText style={styles.toggleText}>Categories</AppText>
                  </TouchableOpacity>
                </View>

                {(discoveryView === 'trending' ? tracksCatalog.slice(0, 5) : [...tracksCatalog].reverse().slice(0, 5)).map(
                  (track) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      onPress={() => handleTrackPress(track, tracksCatalog)}
                      isPlaying={currentTrackId === track.id}
                    />
                  ),
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>

      <CreatePlaylistModal visible={isCreateModalVisible} onClose={() => setCreateModalVisible(false)} />

      <UploadTrackModal
        visible={isUploadModalVisible}
        onClose={() => setUploadModalVisible(false)}
        onUploadSuccess={() => {
          setUploadModalVisible(false);
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
  historySection: {
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  historySectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chipActive: {
    borderColor: colors.accentPrimary,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  chipTextActive: {
    color: colors.accentPrimary,
    fontWeight: '600',
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
  searchLikeBanner: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchLikeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  searchLikeText: {
    fontSize: 14,
    color: colors.accentPrimary,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skeletonArt: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
  },
  skeletonTextCol: {
    flex: 1,
    marginLeft: 12,
    gap: 8,
  },
  skeletonLineLg: {
    height: 14,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    width: '70%',
  },
  skeletonLineSm: {
    height: 12,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    width: '45%',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  sectionTitleWithAction: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
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
    paddingHorizontal: 16,
    marginBottom: 12,
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
    textAlign: 'center',
  },
});
