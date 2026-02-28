import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { AppText } from '../../../components/AppText';
import { colors } from '../../../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import type { Playlist, Track } from '../types';
import { TrackRow } from './TrackRow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMusic } from '../context/MusicContext';
import { useMusicCatalogRepo } from '../../../data/provider';

interface PlaylistDetailsProps {
  playlist: Playlist;
  onBack: () => void;
}

export const PlaylistDetails = ({ playlist, onBack }: PlaylistDetailsProps) => {
  const insets = useSafeAreaInsets();
  const { playTrack, currentTrack } = useMusic();
  const musicCatalogRepo = useMusicCatalogRepo();
  const tracksCatalog = useMemo(() => musicCatalogRepo.listTracks({ limit: 500 }), [musicCatalogRepo]);

  const playlistTracks = playlist.tracks
    .map(id => tracksCatalog.find(t => t.id === id))
    .filter((t): t is Track => !!t);

  const handlePlayAll = () => {
    if (playlistTracks.length > 0) {
      playTrack(playlistTracks[0], playlistTracks);
    }
  };

  const handleShufflePlay = () => {
    if (playlistTracks.length > 0) {
      // Create a shuffled copy
      const shuffled = [...playlistTracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header / Back Button */}
      <View style={[styles.header, { paddingTop: 0 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Playlist Info */}
        <View style={styles.infoContainer}>
          <Image source={{ uri: playlist.cover }} style={styles.cover} resizeMode="cover" />
          <AppText style={styles.title}>{playlist.title}</AppText>
          <AppText style={styles.description}>{playlist.description}</AppText>
          <AppText style={styles.stats}>{playlistTracks.length} songs • 15 min</AppText>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.playButton} onPress={handlePlayAll}>
              <Ionicons name="play" size={24} color={colors.background} />
              <AppText style={styles.playButtonText}>Play</AppText>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.shuffleButton} onPress={handleShufflePlay}>
              <Ionicons name="shuffle" size={24} color={colors.textPrimary} />
              <AppText style={styles.shuffleButtonText}>Shuffle</AppText>
            </TouchableOpacity>

          </View>
        </View>

        {/* Tracks List */}
        <View style={styles.trackList}>
          {playlistTracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              onPress={() => playTrack(track, playlistTracks)}
              isPlaying={currentTrack?.id === track.id}
            />
          ))}
        </View>
      </ScrollView>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    height: 44, // reduced since we are inside the SafeAreaView of the parent
    justifyContent: 'center',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  content: {
    paddingBottom: 100,
  },
  infoContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  cover: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: colors.surfaceAlt,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  stats: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentPrimary,
    paddingVertical: 12,
    borderRadius: 24,
  },
  playButtonText: {
    color: colors.background,
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  shuffleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 12,
    borderRadius: 24,
  },
  shuffleButtonText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
  trackList: {
    paddingHorizontal: 0,
  },
});
