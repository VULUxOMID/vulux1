import React, { useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Image, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { AppText } from '../../../components/AppText';
import { colors } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useAuth as useSessionAuth } from '../../../auth/spacetimeSession';
import { toast } from '../../../components/Toast';
import { uploadMediaAsset } from '../../../utils/mediaUpload';
import { publishMusicTrackCatalogItem } from '../../../utils/spacetimePersistence';

interface UploadTrackModalProps {
  visible: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const UploadTrackModal = ({ visible, onClose, onUploadSuccess }: UploadTrackModalProps) => {
  const { getToken } = useSessionAuth();
  const [title, setTitle] = useState('');
  const [artistName, setArtistName] = useState('');

  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioName, setAudioName] = useState('');
  const [selectedContentType, setSelectedContentType] = useState('audio/mpeg');

  const [artworkUri, setArtworkUri] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const pickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const selectedFile = result.assets[0];
        setAudioUri(selectedFile.uri);
        setAudioName(selectedFile.name);
        const mimeType = selectedFile.mimeType;
        setSelectedContentType(
          typeof mimeType === 'string' && mimeType.startsWith('audio/') ? mimeType : 'audio/mpeg',
        );
        setError('');
      }
    } catch (e) {
      if (__DEV__) console.error('Error picking audio:', e);
      setError('Failed to select file');
    }
  };

  const pickArtworkFile = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square is standard for album art
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const selectedFile = result.assets[0];
        setArtworkUri(selectedFile.uri);
      }
    } catch (e) {
      if (__DEV__) console.error('Error picking artwork:', e);
      setError('Failed to select artwork');
    }
  };

  const handleUpload = async () => {
    if (!title.trim() || !artistName.trim() || !audioUri) {
      setError('Please fill in all fields and select an audio file');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      // --- Artwork Upload ---
      let uploadedArtworkUrl = '';
      if (artworkUri) {
        setUploadProgress(2);
        const artworkUpload = await uploadMediaAsset({
          getToken,
          uri: artworkUri,
          contentType: 'image/jpeg',
          mediaType: 'image',
        });
        uploadedArtworkUrl = artworkUpload.publicUrl;
      }

      // --- Audio Upload ---
      const audioUpload = await uploadMediaAsset({
        getToken,
        uri: audioUri,
        contentType: selectedContentType,
        mediaType: 'music',
        onProgress: (progress) => {
          setUploadProgress(Math.max(5, progress));
        },
      });
      const uploadedAudioUrl = audioUpload.publicUrl;

      // --- Save Track ---
      await publishMusicTrackCatalogItem({
        title: title.trim(),
        artistName: artistName.trim(),
        audioUrl: uploadedAudioUrl,
        durationSeconds: 180, // We'd need expo-av to get real duration, using placeholder
        artworkUrl: uploadedArtworkUrl,
      });

      // Success!
      setTitle('');
      setArtistName('');
      setAudioUri(null);
      setAudioName('');
      setArtworkUri(null);
      onUploadSuccess();

      if (toast && toast.success) {
        toast.success('Track uploaded successfully!');
      }

      onClose();

    } catch (e) {
      if (__DEV__) console.error('Upload error:', e);
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} disabled={isUploading}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' }} />
        </TouchableOpacity>

        <View style={styles.modalWrapper}>
          <View style={styles.content}>
            <View style={styles.header}>
              <AppText style={styles.title}>Upload Track</AppText>
              <TouchableOpacity onPress={onClose} disabled={isUploading}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.mediaSection}>
                <Pressable style={styles.mediaButton} onPress={pickAudioFile} disabled={isUploading}>
                  {audioUri ? (
                    <View style={styles.selectedMedia}>
                      <Ionicons name="musical-notes" size={32} color={colors.accentPrimary} />
                      <AppText style={styles.mediaText} numberOfLines={1}>{audioName}</AppText>
                    </View>
                  ) : (
                    <>
                      <Ionicons name="musical-notes-outline" size={32} color={colors.textSecondary} />
                      <AppText style={styles.mediaText}>Select Audio</AppText>
                    </>
                  )}
                </Pressable>

                <Pressable style={styles.mediaButton} onPress={pickArtworkFile} disabled={isUploading}>
                  {artworkUri ? (
                    <Image source={{ uri: artworkUri }} style={styles.thumbnailPreview} />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
                      <AppText style={styles.mediaText}>Select Artwork</AppText>
                    </>
                  )}
                </Pressable>
              </View>

              <AppText style={styles.label}>Track Title</AppText>
              <TextInput
                style={styles.input}
                placeholder="Track Title"
                placeholderTextColor={colors.inputPlaceholder}
                value={title}
                onChangeText={setTitle}
                editable={!isUploading}
              />

              <AppText style={styles.label}>Artist Name</AppText>
              <TextInput
                style={styles.input}
                placeholder="Artist Name"
                placeholderTextColor={colors.inputPlaceholder}
                value={artistName}
                onChangeText={setArtistName}
                editable={!isUploading}
              />

              {isUploading ? (
                <View style={styles.progressContainer}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                  </View>
                  <AppText style={styles.progressText}>
                    {uploadProgress < 100 ? `Uploading ${uploadProgress}%` : 'Finalizing upload...'}
                  </AppText>
                </View>
              ) : null}

              {error ? (
                <AppText style={styles.errorText}>{error}</AppText>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.uploadButton,
                  (!title.trim() || !artistName.trim() || !audioUri || isUploading) && styles.disabledButton
                ]}
                onPress={handleUpload}
                disabled={!title.trim() || !artistName.trim() || !audioUri || isUploading}
              >
                {isUploading ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <AppText style={styles.uploadButtonText}>Publish to Vulu</AppText>
                )}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
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
    paddingTop: 60,
    paddingBottom: 40,
  },
  modalWrapper: {
    width: '100%',
    maxHeight: '100%',
  },
  content: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  scrollContent: {
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  mediaSection: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  mediaButton: {
    flex: 1,
    height: 100,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mediaText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  selectedMedia: {
    alignItems: 'center',
  },
  thumbnailPreview: {
    width: '100%',
    height: '100%',
  },
  label: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.inputBackground,
    color: colors.textPrimary,
    padding: 16,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    marginBottom: 16,
  },
  progressContainer: {
    marginBottom: 16,
    marginTop: 8,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  uploadButton: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  uploadButtonText: {
    color: colors.background,
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorText: {
    color: '#FF4D67',
    marginBottom: 16,
    textAlign: 'center',
  },
});
