import React, { useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { AppText } from '../../../components/AppText';
import { colors, radius, spacing } from '../../../theme';
import { useMusic } from '../context/MusicContext';

interface CreatePlaylistModalProps {
  visible: boolean;
  onClose: () => void;
}

export const CreatePlaylistModal = ({ visible, onClose }: CreatePlaylistModalProps) => {
  const { createPlaylist } = useMusic();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = () => {
    if (!name.trim()) return;
    createPlaylist(name, description);
    setName('');
    setDescription('');
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
          <AppText style={styles.title}>New Playlist</AppText>
          
          <TextInput
            style={styles.input}
            placeholder="Playlist Name"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Description (optional)"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
              <AppText style={styles.cancelText}>Cancel</AppText>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.createButton, !name.trim() && styles.disabledButton]} 
              onPress={handleCreate}
              disabled={!name.trim()}
            >
              <AppText style={styles.createButtonText}>Create</AppText>
            </TouchableOpacity>
          </View>
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
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 24,
    textAlign: 'center',
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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
    gap: 16,
  },
  cancelButton: {
    padding: 8,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  createButton: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 24,
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
