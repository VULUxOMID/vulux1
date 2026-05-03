import React from 'react';
import { Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UploadVideoModal } from '../../src/features/videos/components/UploadVideoModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppScreen } from '../../src/components';
import { useVideo, type Video } from '../../src/context/VideoContext';
import { TopBar } from '../../src/features/home/TopBar';
import { VideoCard } from '../../src/features/videos/components/VideoCard';
import { colors, radius, spacing, typography } from '../../src/theme';
import { NAV_BAR_HEIGHT } from '../../src/components/navigation/layoutConstants';

const TAB_CONTAINER_HEIGHT = 40;
const TAB_ITEM_HEIGHT = TAB_CONTAINER_HEIGHT - spacing.xs * 2;
const { width: screenWidth } = Dimensions.get('window');

export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const { videos, categories } = useVideo();

  const [searchTerm, setSearchTerm] = React.useState('');
  const [searchDraft, setSearchDraft] = React.useState('');
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [isUploadModalVisible, setUploadModalVisible] = React.useState(false);
  const [activeSearchFilter, setActiveSearchFilter] = React.useState('All');
  const [activeFeedFilter, setActiveFeedFilter] = React.useState('All');
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);
  const normalizedQuery = searchTerm.trim().toLowerCase();
  const normalizedDraft = searchDraft.trim().toLowerCase();

  const handleUploadPress = React.useCallback(() => {
    setUploadModalVisible(true);
  }, []);

  const openSearch = React.useCallback(() => {
    setSearchDraft(searchTerm);
    setIsSearchOpen(true);
  }, [searchTerm]);

  const closeSearch = React.useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  const applySearch = React.useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setSearchTerm('');
      setSearchDraft('');
      setIsSearchOpen(false);
      return;
    }
    setSearchTerm(trimmed);
    setSearchDraft(trimmed);
    setIsSearchOpen(false);
    setActiveSearchFilter('All');
    setRecentSearches((prev) => [
      trimmed,
      ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
    ].slice(0, 6));
  }, []);

  const clearSearch = React.useCallback(() => {
    setSearchTerm('');
    setSearchDraft('');
    setActiveSearchFilter('All');
  }, []);

  const matchesQuery = React.useCallback(
    (video: Video) => {
      if (!normalizedQuery) return true;
      const searchable = [
        video.title,
        video.creatorName,
        video.category,
        ...(video.tags ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    },
    [normalizedQuery],
  );

  const searchFilters = React.useMemo(
    () => ['All', ...categories.filter((category) => category !== 'Trending' && category !== 'New')],
    [categories],
  );

  const filteredSearchResults = React.useMemo(() => {
    let results = videos.filter(matchesQuery);
    if (activeSearchFilter !== 'All') {
      results = results.filter((video) => video.category === activeSearchFilter);
    }
    return results;
  }, [videos, matchesQuery, activeSearchFilter]);

  const filteredFeedVideos = React.useMemo(() => {
    const base = videos.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (activeFeedFilter === 'All') {
      return base;
    }
    return base.filter((video) => video.category === activeFeedFilter);
  }, [videos, activeFeedFilter]);

  const suggestionItems = React.useMemo(() => {
    if (!isSearchOpen) return [];
    if (!normalizedDraft) {
      return recentSearches.slice(0, 8);
    }

    const suggestions = new Set<string>();
    const addSuggestion = (value?: string) => {
      if (!value) return;
      if (value.toLowerCase().includes(normalizedDraft)) {
        suggestions.add(value);
      }
    };

    recentSearches.forEach(addSuggestion);
    videos.forEach((video) => {
      addSuggestion(video.title);
      addSuggestion(video.creatorName);
      addSuggestion(video.category);
      video.tags.forEach(addSuggestion);
    });

    if (suggestions.size === 0 && searchDraft.trim()) {
      suggestions.add(searchDraft.trim());
    }

    return Array.from(suggestions).slice(0, 8);
  }, [isSearchOpen, normalizedDraft, recentSearches, videos, searchDraft]);

  const [refreshing, setRefreshing] = React.useState(false);
  const showSearchResults = searchTerm.length > 0;

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate refresh
    setTimeout(() => {
      setRefreshing(false);
    }, 2000);
  }, []);

  return (
    <AppScreen noPadding style={styles.container}>
      <View style={styles.headerContainer}>
        <TopBar title="Hub" />
        <View style={styles.tabsRow}>
          <Pressable
            onPress={openSearch}
            style={styles.searchContainer}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <Text
              style={[
                styles.searchTriggerText,
                searchTerm ? styles.searchTriggerTextActive : null,
              ]}
              numberOfLines={1}
            >
              {searchTerm || 'Search Hub'}
            </Text>
            {searchTerm.length > 0 ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  clearSearch();
                }}
                style={styles.clearButton}
              >
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </Pressable>
          <View style={styles.uploadContainer}>
            <Pressable onPress={handleUploadPress} style={styles.uploadButton}>
              <Ionicons name="cloud-upload-outline" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: NAV_BAR_HEIGHT + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textPrimary}
            progressViewOffset={60}
          />
        }
      >
        {showSearchResults ? (
          <View style={styles.searchResults}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.searchFilters}
            >
              {searchFilters.map((filter) => {
                const isActive = filter === activeSearchFilter;
                return (
                  <Pressable
                    key={filter}
                    onPress={() => setActiveSearchFilter(filter)}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                  >
                    <Text
                      style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                    >
                      {filter}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {filteredSearchResults.length > 0 ? (
              <View style={styles.searchResultsList}>
                {filteredSearchResults.map((video) => (
                  <View key={video.id} style={styles.searchResultCard}>
                    <VideoCard
                      video={video}
                      width={screenWidth - spacing.lg * 2}
                      height={200}
                      showTags={false}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptySearchText}>No videos found for that search.</Text>
            )}
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.searchFilters}
            >
              {searchFilters.map((filter) => {
                const isActive = filter === activeFeedFilter;
                return (
                  <Pressable
                    key={filter}
                    onPress={() => setActiveFeedFilter(filter)}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                      {filter}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.feedList}>
              {filteredFeedVideos.length > 0 ? (
                filteredFeedVideos.map((video) => (
                  <View key={video.id} style={styles.feedCard}>
                    <VideoCard
                      video={video}
                      width={screenWidth - spacing.lg * 2}
                      height={200}
                      showTags={false}
                    />
                  </View>
                ))
              ) : (
                <Text style={styles.emptyFeedText}>No videos available in this category.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
      {isSearchOpen ? (
        <View style={[styles.searchOverlay, { paddingTop: insets.top }]}>
          <View style={styles.searchOverlayHeader}>
            <Pressable onPress={closeSearch} style={styles.searchBackButton}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <View style={styles.searchOverlayInput}>
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput
                value={searchDraft}
                onChangeText={setSearchDraft}
                placeholder="Search Hub"
                placeholderTextColor={colors.textSecondary}
                style={styles.searchInput}
                returnKeyType="search"
                autoFocus
                onSubmitEditing={() => applySearch(searchDraft)}
              />
              {searchDraft.length > 0 ? (
                <Pressable onPress={() => setSearchDraft('')} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.searchSuggestions}
          >
            {suggestionItems.length > 0 ? (
              suggestionItems.map((item) => {
                const isRecent = recentSearches.includes(item);
                return (
                  <Pressable
                    key={item}
                    style={styles.suggestionRow}
                    onPress={() => applySearch(item)}
                  >
                    <Ionicons
                      name={isRecent ? 'time-outline' : 'search'}
                      size={18}
                      color={colors.textSecondary}
                    />
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      {item}
                    </Text>
                    <Ionicons
                      name="arrow-up-outline"
                      size={18}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.emptySuggestions}>Start typing to search creators or videos.</Text>
            )}
          </ScrollView>
        </View>
      ) : null}
      <UploadVideoModal
        visible={isUploadModalVisible}
        onClose={() => setUploadModalVisible(false)}
        onUploadSuccess={() => {
          setUploadModalVisible(false);
          // Optional: handle refresh or success toast
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    zIndex: 10,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingTop: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  sectionList: {
    paddingHorizontal: spacing.lg,
    paddingRight: spacing.sm, // Compensate for card margin
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(17,17,19,0.92)',
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    height: 46,
    marginTop: spacing.sm,
  },
  searchTriggerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
  },
  searchTriggerTextActive: {
    color: colors.textPrimary,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingVertical: 0,
  },
  clearButton: {
    padding: spacing.xs,
  },
  uploadContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(17,17,19,0.92)',
    padding: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    height: 46,
    alignItems: 'center',
    marginTop: spacing.sm,
    width: 80,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: TAB_ITEM_HEIGHT,
    paddingVertical: 0,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  uploadText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9,9,11,0.98)',
    zIndex: 20,
  },
  searchOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  searchBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchOverlayInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(17,17,19,0.92)',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchSuggestions: {
    paddingTop: spacing.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(17,17,19,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestionText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  emptySuggestions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 13,
  },
  searchResults: {
    paddingTop: spacing.sm,
  },
  searchFilters: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smMinus,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterChipActive: {
    backgroundColor: colors.accentPrimarySubtle,
    borderColor: colors.accentPrimary,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: colors.accentPrimary,
  },
  searchResultsList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  searchResultCard: {
    marginBottom: spacing.lg,
  },
  emptySearchText: {
    paddingHorizontal: spacing.lg,
    color: colors.textSecondary,
    fontSize: 14,
  },
  feedList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  feedCard: {
    marginBottom: spacing.lg,
  },
  emptyFeedText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
  },
});
