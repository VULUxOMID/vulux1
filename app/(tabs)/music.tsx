import React, { useEffect, useState } from 'react';
import { View, StyleSheet, StatusBar, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { AppScreen } from '../../src/components/AppScreen';
import { AppText } from '../../src/components/AppText';
import { colors } from '../../src/theme/colors';
import { UnifiedMusicDashboard } from '../../src/features/music/components/UnifiedMusicDashboard';
import { PlaylistDetails } from '../../src/features/music/components/PlaylistDetails';
import { ArtistDetails } from '../../src/features/music/components/ArtistDetails';
import { MusicCategories } from '../../src/features/music/components/MusicCategories';
import { TrackRow } from '../../src/features/music/components/TrackRow';
import { useMusic } from '../../src/features/music/context/MusicContext';
import type { Track, Playlist } from '../../src/features/music/types';
import { useAuth as useSessionAuth } from '../../src/auth/clerkSession';
import { useAppIsActive } from '../../src/hooks/useAppIsActive';
import { requestBackendRefresh } from '../../src/data/adapters/backend/refreshBus';
import { spacing } from '../../src/theme';
import { TopBar } from '../../src/features/home/TopBar';

export default function MusicScreen() {
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useSessionAuth();
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const { playTrack, currentTrack, selectedArtist, setSelectedArtist, offlineTracks } = useMusic();
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isFocused && isAppActive;

  useEffect(() => {
    if (!queriesEnabled) {
      return;
    }

    requestBackendRefresh({
      scopes: ['music'],
      source: 'manual',
      reason: 'music_screen_focused',
    });
  }, [queriesEnabled]);

  const handleTrackPress = (track: Track, queue: Track[] = []) => {
    playTrack(track, queue);
  };

  const handlePlaylistPress = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
  };

  const handleCategoriesPress = () => {
    setShowCategories(true);
  };

  const handleCategoriesBack = () => {
    setShowCategories(false);
  };

  const handleOfflinePress = () => {
    setShowOffline(true);
  };

  const handleOfflineBack = () => {
    setShowOffline(false);
  };

  const handleBack = () => {
    if (showOffline) {
      handleOfflineBack();
    } else if (selectedArtist) {
      setSelectedArtist(null);
    } else {
      setSelectedPlaylist(null);
    }
  };

  // Determine what to render
  const renderContent = () => {
    if (showCategories) {
      return <MusicCategories onBack={handleCategoriesBack} />;
    }
    if (showOffline) {
      return (
        <View style={styles.offlineContainer}>
          <View style={styles.subHeader}>
            <TouchableOpacity onPress={handleOfflineBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <AppText style={styles.subHeaderTitle}>Offline Library</AppText>
          </View>

          {offlineTracks.length > 0 ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.offlineList}>
              {offlineTracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  onPress={() => handleTrackPress(track, offlineTracks)}
                  isPlaying={currentTrack?.id === track.id}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="download-outline" size={42} color={colors.textMuted} />
              <AppText style={styles.emptyTitle}>No offline songs yet</AppText>
              <AppText style={styles.emptySubtext}>
                Open any track menu and tap Download to save it here.
              </AppText>
            </View>
          )}
        </View>
      );
    }
    if (selectedArtist) {
      return <ArtistDetails artist={selectedArtist} onBack={handleBack} />;
    }
    if (selectedPlaylist) {
      return <PlaylistDetails playlist={selectedPlaylist} onBack={handleBack} />;
    }
    
    return (
      <>
        <View style={styles.header}>
          <TopBar title="Music" variant="page" />
        </View>

        {/* Dashboard */}
        <UnifiedMusicDashboard 
          onTrackPress={handleTrackPress} 
          onPlaylistPress={handlePlaylistPress}
          currentTrackId={currentTrack?.id}
          onCategoriesPress={handleCategoriesPress}
          onOfflinePress={handleOfflinePress}
          offlineCount={offlineTracks.length}
        />
      </>
    );
  };

  return (
    <AppScreen noPadding style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {renderContent()}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  offlineContainer: {
    flex: 1,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  subHeaderTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  offlineList: {
    paddingBottom: 100,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtext: {
    color: colors.textMuted,
    textAlign: 'center',
  },
});
