import React, { useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Image, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { AppText } from '../../../components/AppText';
import { colors } from '../../../theme';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth as useSessionAuth } from '../../../auth/spacetimeSession';
import { useVideo, type VideoCategory } from '../../../context/VideoContext';
import { toast } from '../../../components/Toast';
import { uploadMediaAsset } from '../../../utils/mediaUpload';
import { publishVideoCatalogItem } from '../../../utils/spacetimePersistence';

interface UploadVideoModalProps {
  visible: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const UploadVideoModal = ({ visible, onClose, onUploadSuccess }: UploadVideoModalProps) => {
  const { getToken } = useSessionAuth();
  const { categories, isCreator } = useVideo();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [currency, setCurrency] = useState<'cash' | 'gems'>('cash');
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | string>('Gaming');
  const [tags, setTags] = useState('');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [selectedVideoType, setSelectedVideoType] = useState('video/mp4');

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const pickVideoFile = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled && result.assets.length > 0) {
        const selectedFile = result.assets[0];
        setVideoUri(selectedFile.uri);
        setVideoDuration(selectedFile.duration ? Math.round(selectedFile.duration / 1000) : 0);
        setSelectedVideoType(
          typeof selectedFile.mimeType === 'string' && selectedFile.mimeType.startsWith('video/') ? selectedFile.mimeType : 'video/mp4',
        );
        setError('');
      }
    } catch (e) {
      if (__DEV__) console.error('Error picking video:', e);
      setError('Failed to select file');
    }
  };

  const pickThumbnailFile = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const selectedFile = result.assets[0];
        setThumbnailUri(selectedFile.uri);
      }
    } catch (e) {
      if (__DEV__) console.error('Error picking thumbnail:', e);
      setError('Failed to select thumbnail');
    }
  };

  const handleUpload = async () => {
    if (!isCreator) {
      setError('You need creator permission to publish videos.');
      return;
    }
    if (!title.trim() || !videoUri) {
      setError('Please fill in title and select a video');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      // --- Thumbnail Upload ---
      let uploadedThumbnailUrl = '';
      if (thumbnailUri) {
        setUploadProgress(2);
        const thumbnailUpload = await uploadMediaAsset({
          getToken,
          uri: thumbnailUri,
          contentType: 'image/jpeg',
          mediaType: 'image',
        });
        uploadedThumbnailUrl = thumbnailUpload.publicUrl;
      }

      // --- Video Upload ---
      const videoUpload = await uploadMediaAsset({
        getToken,
        uri: videoUri,
        contentType: selectedVideoType,
        mediaType: 'video',
        onProgress: (progress) => {
          setUploadProgress(Math.max(5, progress));
        },
      });
      const uploadedVideoUrl = videoUpload.publicUrl;

      // --- Create DB Item ---
      await publishVideoCatalogItem({
        title: title.trim(),
        description: description.trim(),
        videoUrl: uploadedVideoUrl,
        thumbnailUrl: uploadedThumbnailUrl,
        category: selectedCategory,
        contentType: 'movie',
        tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
        price: parseInt(price) || 0,
        currency,
        durationSeconds: videoDuration,
      });

      // Success!
      setTitle('');
      setDescription('');
      setPrice('0');
      setTags('');
      setThumbnailUri(null);
      setVideoUri(null);
      onUploadSuccess();

      if (toast && toast.success) {
        toast.success('Video uploaded successfully!');
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

  const categoriesFiltered = categories ? categories.filter((c: string) => c !== 'Trending' && c !== 'New') : ['Gaming', 'Vlog', 'Music'];

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
              <AppText style={styles.title}>Upload Video</AppText>
              <TouchableOpacity onPress={onClose} disabled={isUploading}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {!isCreator && (
                <View style={styles.permissionNotice}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                  <AppText style={styles.permissionText}>
                    Creator access required to publish.
                  </AppText>
                </View>
              )}

              {/* Media Selection */}
              <View style={styles.mediaSection}>
                <Pressable style={styles.mediaButton} onPress={pickVideoFile} disabled={isUploading}>
                  {videoUri ? (
                    <View style={styles.selectedMedia}>
                      <Ionicons name="videocam" size={32} color={colors.accentPrimary} />
                      <AppText style={styles.mediaText}>Video Selected</AppText>
                    </View>
                  ) : (
                    <>
                      <Ionicons name="videocam-outline" size={32} color={colors.textSecondary} />
                      <AppText style={styles.mediaText}>Select Video</AppText>
                    </>
                  )}
                </Pressable>

                <Pressable style={styles.mediaButton} onPress={pickThumbnailFile} disabled={isUploading}>
                  {thumbnailUri ? (
                    <Image source={{ uri: thumbnailUri }} style={styles.thumbnailPreview} />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
                      <AppText style={styles.mediaText}>Select Thumbnail</AppText>
                    </>
                  )}
                </Pressable>
              </View>

              <AppText style={styles.label}>Title</AppText>
              <TextInput
                style={styles.input}
                placeholder="Video Title"
                placeholderTextColor={colors.inputPlaceholder}
                value={title}
                onChangeText={setTitle}
                editable={!isUploading}
              />

              <AppText style={styles.label}>Description</AppText>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Description (Optional)"
                placeholderTextColor={colors.inputPlaceholder}
                value={description}
                onChangeText={setDescription}
                editable={!isUploading}
                multiline
                numberOfLines={3}
              />

              <AppText style={styles.label}>Category</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {categoriesFiltered.map((cat: string) => (
                  <Pressable
                    key={cat}
                    style={[
                      styles.categoryChip,
                      selectedCategory === cat && styles.categoryChipSelected
                    ]}
                    onPress={() => setSelectedCategory(cat)}
                    disabled={isUploading}
                  >
                    <AppText style={[
                      styles.categoryText,
                      selectedCategory === cat && styles.categoryTextSelected
                    ]}>{cat}</AppText>
                  </Pressable>
                ))}
              </ScrollView>

              <AppText style={styles.label}>Tags (comma separated)</AppText>
              <TextInput
                style={styles.input}
                placeholder="gaming, vlog, fun"
                placeholderTextColor={colors.inputPlaceholder}
                value={tags}
                onChangeText={setTags}
                editable={!isUploading}
              />

              {/* Monetization */}
              <View style={styles.monetizationSection}>
                <AppText style={styles.label}>Price (0 for Free)</AppText>
                <View style={styles.priceRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="0"
                    placeholderTextColor={colors.inputPlaceholder}
                    keyboardType="numeric"
                    value={price}
                    onChangeText={setPrice}
                    editable={!isUploading}
                  />
                  <View style={styles.currencyToggle}>
                    <Pressable
                      style={[styles.currencyBtn, currency === 'cash' && styles.currencyBtnActive]}
                      onPress={() => setCurrency('cash')}
                      disabled={isUploading}
                    >
                      <AppText style={[styles.currencyText, currency === 'cash' && styles.currencyTextActive]}>Cash</AppText>
                    </Pressable>
                    <Pressable
                      style={[styles.currencyBtn, currency === 'gems' && styles.currencyBtnActive]}
                      onPress={() => setCurrency('gems')}
                      disabled={isUploading}
                    >
                      <AppText style={[styles.currencyText, currency === 'gems' && styles.currencyTextActive]}>Gems</AppText>
                    </Pressable>
                  </View>
                </View>
              </View>

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
                  (!title.trim() || !videoUri || isUploading) && styles.disabledButton
                ]}
                onPress={handleUpload}
                disabled={!title.trim() || !videoUri || isUploading}
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
  permissionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  permissionText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
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
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  categoryChipSelected: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  categoryTextSelected: {
    color: colors.background,
    fontWeight: 'bold',
  },
  monetizationSection: {
    marginBottom: 24,
  },
  priceRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  currencyToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  currencyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  currencyBtnActive: {
    backgroundColor: colors.accentPrimary,
  },
  currencyText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  currencyTextActive: {
    color: colors.background,
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
