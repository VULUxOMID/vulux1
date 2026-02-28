import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { AppText } from '../../../components/AppText';
import { colors } from '../../../theme/colors';
import type { Playlist } from '../types';

interface PlaylistCardProps {
  playlist: Playlist;
  onPress: (playlist: Playlist) => void;
}

export const PlaylistCard = ({ playlist, onPress }: PlaylistCardProps) => {
  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(playlist)}>
      <Image source={{ uri: playlist.cover }} style={styles.cover} resizeMode="cover" />
      <AppText style={styles.title} numberOfLines={1}>
        {playlist.title}
      </AppText>
      <AppText style={styles.description} numberOfLines={1}>
        {playlist.description}
      </AppText>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 140,
    marginRight: 16,
  },
  cover: {
    width: 140,
    height: 140,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
