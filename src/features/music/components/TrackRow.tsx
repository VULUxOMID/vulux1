import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { AppText } from '../../../components/AppText';
import { colors } from '../../../theme/colors';
import type { Track } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { useMusic } from '../context/MusicContext';

interface TrackRowProps {
  track: Track;
  onPress: () => void;
  isPlaying?: boolean;
}

export const TrackRow = ({ track, onPress, isPlaying }: TrackRowProps) => {
  const { openActionMenu } = useMusic();

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <Image source={{ uri: track.artwork }} style={styles.artwork} resizeMode="cover" />
      
      <View style={styles.info}>
        <AppText style={[styles.title, isPlaying && styles.activeText]} numberOfLines={1}>
          {track.title}
        </AppText>
        <AppText style={styles.artist} numberOfLines={1}>
          {track.artist}
        </AppText>
        {track.availability === 'region_blocked' ? (
          <View style={styles.availabilityRow}>
            <Ionicons name="earth-outline" size={14} color={colors.textMuted} />
            <AppText style={styles.availabilityText} numberOfLines={1}>
              May be unavailable in your region
            </AppText>
          </View>
        ) : null}
      </View>

      <TouchableOpacity 
        style={styles.moreButton}
        onPress={() => openActionMenu(track)}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  activeText: {
    color: colors.accentPrimary,
  },
  artist: {
    fontSize: 14,
    color: colors.textMuted,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  availabilityText: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1,
  },
  moreButton: {
    padding: 8,
  },
});
