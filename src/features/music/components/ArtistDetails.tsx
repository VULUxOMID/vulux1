import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { AppText } from '../../../components/AppText';
import { colors } from '../../../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import type { Artist, Track } from '../types';
import { TrackRow } from './TrackRow';
import { useMusic } from '../context/MusicContext';
import { useMusicCatalogRepo } from '../../../data/provider';

interface ArtistDetailsProps {
  artist: Artist;
  onBack: () => void;
}

export const ArtistDetails = ({ artist, onBack }: ArtistDetailsProps) => {
  const { playTrack, currentTrack } = useMusic();
  const musicCatalogRepo = useMusicCatalogRepo();
  const tracksCatalog = useMemo(() => musicCatalogRepo.listTracks({ limit: 500 }), [musicCatalogRepo]);

  // Filter tracks by this artist
  const artistTracks = tracksCatalog.filter(t => t.artist === artist.name);

  const handlePlayAll = () => {
    if (artistTracks.length > 0) {
      playTrack(artistTracks[0], artistTracks);
    }
  };

  const handleShufflePlay = () => {
    if (artistTracks.length > 0) {
      const shuffled = [...artistTracks].sort(() => Math.random() - 0.5);
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
        {/* Artist Info */}
        <View style={styles.infoContainer}>
          <Image source={{ uri: artist.image }} style={styles.image} resizeMode="cover" />
          <AppText style={styles.name}>{artist.name}</AppText>
          <AppText style={styles.bio}>{artist.bio}</AppText>
          <AppText style={styles.stats}>{artistTracks.length} songs</AppText>

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
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>Top Songs</AppText>
          <View style={styles.trackList}>
            {artistTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                onPress={() => playTrack(track, artistTracks)}
                isPlaying={currentTrack?.id === track.id}
              />
            ))}
            {artistTracks.length === 0 && (
              <AppText style={styles.emptyText}>No songs found for this artist.</AppText>
            )}
          </View>
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
    height: 44,
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
  image: {
    width: 160,
    height: 160,
    borderRadius: 80,
    marginBottom: 16,
    backgroundColor: colors.surfaceAlt,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  bio: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  stats: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentPrimary,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  playButtonText: {
    color: colors.background,
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  shuffleButtonText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
  section: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  trackList: {
    paddingHorizontal: 0,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },
});
