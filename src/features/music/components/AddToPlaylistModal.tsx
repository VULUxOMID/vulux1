import React, { useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { AppText } from '../../../components/AppText';
import { colors, radius, spacing } from '../../../theme';
import { useMusic } from '../context/MusicContext';
import { Ionicons } from '@expo/vector-icons';
import type { Track } from '../types';

interface AddToPlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  track: Track;
}

export const AddToPlaylistModal = ({ visible, onClose, track }: AddToPlaylistModalProps) => {
  const { playlists, createPlaylist, addTrackToPlaylist } = useMusic();
  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const handleCreate = () => {
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName);
    setNewPlaylistName('');
    setShowCreate(false);
  };

  const handlePlaylistSelect = (playlistId: string) => {
    addTrackToPlaylist(playlistId, track.id);
    onClose();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' }} />
        </TouchableOpacity>

        <View style={styles.content}>
          <AppText style={styles.title}>Add to Playlist</AppText>
          
          {showCreate ? (
            <View style={styles.createContainer}>
              <TextInput
                style={styles.input}
                placeholder="Playlist Name"
                placeholderTextColor={colors.textMuted}
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                autoFocus
              />
              <View style={styles.createActions}>
                <TouchableOpacity onPress={() => setShowCreate(false)}>
                  <AppText style={styles.cancelText}>Cancel</AppText>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.createButton, !newPlaylistName.trim() && styles.disabledButton]} 
                  onPress={handleCreate}
                  disabled={!newPlaylistName.trim()}
                >
                  <AppText style={styles.createButtonText}>Create</AppText>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.newPlaylistRow} onPress={() => setShowCreate(true)}>
                <View style={styles.newIconBox}>
                  <Ionicons name="add" size={24} color={colors.textPrimary} />
                </View>
                <AppText style={styles.newPlaylistText}>New Playlist</AppText>
              </TouchableOpacity>
              
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {playlists.map(p => (
                  <TouchableOpacity 
                    key={p.id} 
                    style={styles.playlistRow}
                    onPress={() => handlePlaylistSelect(p.id)}
                  >
                     <View style={styles.playlistIconBox}>
                        <Ionicons name="musical-notes" size={20} color={colors.textMuted} />
                     </View>
                     <View>
                        <AppText style={styles.playlistTitle}>{p.title}</AppText>
                        <AppText style={styles.playlistCount}>{p.tracks.length} songs</AppText>
                     </View>
                     {p.tracks.includes(track.id) && (
                       <Ionicons name="checkmark-circle" size={20} color={colors.accentPrimary} style={{ marginLeft: 'auto' }} />
                     )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <AppText style={styles.closeText}>Close</AppText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxHeight: '60%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  newPlaylistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  newIconBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderStyle: 'dashed',
  },
  newPlaylistText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  list: {
    maxHeight: 300,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  playlistIconBox: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playlistTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  playlistCount: {
    fontSize: 12,
    color: colors.textMuted,
  },
  closeButton: {
    marginTop: 20,
    alignItems: 'center',
    padding: 12,
  },
  closeText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  createContainer: {
    paddingVertical: 10,
  },
  input: {
    backgroundColor: colors.inputBackground,
    color: colors.textPrimary,
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    marginBottom: 16,
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  createButton: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  disabledButton: {
    opacity: 0.5,
  },
  createButtonText: {
    color: colors.background,
    fontWeight: 'bold',
    fontSize: 16,
  },
});
