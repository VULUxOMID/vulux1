import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Pressable, Animated, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'react-native';
import { AppText } from '../../../components/AppText';
import { colors, radius, spacing } from '../../../theme';
import { useMusic } from '../context/MusicContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddToPlaylistModal } from './AddToPlaylistModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const TrackActionMenu = () => {
  const {
    actionTrack,
    closeActionMenu,
    toggleLikeTrack,
    likedTrackIds,
    addToQueue,
    viewArtist,
    toggleOfflineTrack,
    isTrackOffline,
  } = useMusic();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  
  useEffect(() => {
    if (actionTrack) {
      // Open animation
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    } else {
      // Reset position when closed
      translateY.setValue(SCREEN_HEIGHT);
    }
  }, [actionTrack]);

  const handleClose = () => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      closeActionMenu();
    });
  };

  const handleAddToPlaylist = () => {
    setShowAddToPlaylist(true);
  };

  if (!actionTrack) return null;

  const isLiked = likedTrackIds.has(actionTrack.id);
  const isOffline = isTrackOffline(actionTrack.id);

  return (
    <>
      <Modal
        transparent
        visible={!!actionTrack && !showAddToPlaylist}
        animationType="none"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <View style={styles.container}>
          {/* Backdrop */}
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          </Pressable>

          {/* Bottom Sheet */}
          <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={styles.handleContainer}>
               <View style={styles.handle} />
            </View>

            {/* Track Header */}
            <View style={styles.trackHeader}>
              <Image source={{ uri: actionTrack.artwork }} style={styles.artwork} resizeMode="cover" />
              <View style={styles.trackInfo}>
                <AppText style={styles.title} numberOfLines={1}>{actionTrack.title}</AppText>
                <AppText style={styles.artist} numberOfLines={1}>{actionTrack.artist}</AppText>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Actions */}
            <View style={[styles.actionsList, { paddingBottom: insets.bottom + 20 }]}>
               <ActionItem 
                 icon={isLiked ? "heart" : "heart-outline"} 
                 label={isLiked ? "Liked" : "Like"} 
                 color={isLiked ? colors.accentPrimary : colors.textPrimary}
                 onPress={() => { toggleLikeTrack(actionTrack.id); handleClose(); }} 
               />
               <ActionItem 
                 icon="add-circle-outline" 
                 label="Add to Playlist" 
                 onPress={handleAddToPlaylist} 
               />
               <ActionItem 
                 icon="list-outline" 
                 label="Add to Queue" 
                 onPress={() => { addToQueue(actionTrack); handleClose(); }} 
               />
               <ActionItem
                 icon={isOffline ? 'cloud-done-outline' : 'download-outline'}
                 label={isOffline ? 'Remove download' : 'Download'}
                 onPress={() => {
                   toggleOfflineTrack(actionTrack.id);
                   handleClose();
                 }}
               />
               <ActionItem 
                 icon="person-outline" 
                 label="View Artist" 
                 onPress={() => { viewArtist(actionTrack.artist); handleClose(); }} 
               />
            </View>
          </Animated.View>
        </View>
      </Modal>

      <AddToPlaylistModal 
        visible={showAddToPlaylist} 
        onClose={() => { setShowAddToPlaylist(false); closeActionMenu(); }}
        track={actionTrack}
      />
    </>
  );
};

const ActionItem = ({ icon, label, onPress, color = colors.textPrimary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) => (
  <TouchableOpacity style={styles.actionItem} onPress={onPress}>
    <Ionicons name={icon} size={24} color={color} style={styles.actionIcon} />
    <AppText style={[styles.actionLabel, { color }]}>{label}</AppText>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderSubtle,
    borderRadius: 2,
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  trackInfo: {
    flex: 1,
    marginLeft: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  artist: {
    fontSize: 14,
    color: colors.textMuted,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  actionsList: {
    paddingTop: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  actionIcon: {
    marginRight: 16,
  },
  actionLabel: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
});
