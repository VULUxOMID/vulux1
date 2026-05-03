import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { useVideo, VideoCategory } from '../../src/context/VideoContext';
import { useAuth as useSessionAuth } from '../../src/auth/clerkSession';
import { uploadMediaAsset } from '../../src/utils/mediaUpload';
import { toast } from '../../src/components/Toast';
import { colors, spacing, typography } from '../../src/theme';

export default function VideoUploadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uploadVideo, categories, isCreator } = useVideo();
  const { getToken } = useSessionAuth();

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('0');
  const [currency, setCurrency] = useState<'cash' | 'gems'>('cash');
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory>('Gaming');
  const [tags, setTags] = useState('');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [selectedVideoType, setSelectedVideoType] = useState('video/mp4');
  const [isUploading, setIsUploading] = useState(false);

  const handlePickThumbnail = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled) {
      setThumbnail(result.assets[0].uri);
    }
  };

  const handlePickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setVideoUri(result.assets[0].uri);
      const mimeType = result.assets[0].mimeType;
      if (typeof mimeType === 'string' && mimeType.startsWith('video/')) {
        setSelectedVideoType(mimeType);
      } else {
        setSelectedVideoType('video/mp4');
      }
    }
  };

  const handleUpload = async () => {
    if (!isCreator) {
      toast.warning('You need creator permission to publish videos.');
      return;
    }
    if (!title || !thumbnail || !videoUri) {
      toast.warning('Please fill in all fields and select media.');
      return;
    }

    setIsUploading(true);

    try {
      const [{ publicUrl: uploadedThumbnailUrl }, { publicUrl: uploadedVideoUrl }] = await Promise.all([
        uploadMediaAsset({
          getToken,
          uri: thumbnail,
          contentType: 'image/jpeg',
          mediaType: 'image',
        }),
        uploadMediaAsset({
          getToken,
          uri: videoUri,
          contentType: selectedVideoType,
          mediaType: 'video',
        }),
      ]);

      await uploadVideo({
        title,
        description: '', // Description removed from UI
        thumbnailUrl: uploadedThumbnailUrl,
        videoUrl: uploadedVideoUrl,
        price: parseInt(price) || 0,
        currency,
        category: selectedCategory,
        tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      });

      toast.success('Video uploaded successfully!');
      router.back();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload video.';
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const categoriesFiltered = categories.filter((c) => c !== 'Trending' && c !== 'New');
  const categoryOptions =
    categoriesFiltered.length > 0
      ? categoriesFiltered
      : (['Gaming', 'Vlog', 'Music', 'Action', 'Educational', 'Fantasy'] as VideoCategory[]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.accentPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Upload Video</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!isCreator && (
          <View style={styles.permissionNotice}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.permissionText}>
              Creator access required to publish. You can still fill out the form.
            </Text>
          </View>
        )}
        {/* Media Selection */}
        <View style={styles.mediaSection}>
          <Pressable style={styles.mediaButton} onPress={handlePickVideo} disabled={isUploading}>
            {videoUri ? (
              <View style={styles.selectedMedia}>
                <Ionicons name="videocam" size={32} color={colors.accentPrimary} />
                <Text style={styles.mediaText}>Video Selected</Text>
              </View>
            ) : (
              <>
                <Ionicons name="videocam-outline" size={32} color={colors.textSecondary} />
                <Text style={styles.mediaText}>Select Video</Text>
              </>
            )}
          </Pressable>

          <Pressable style={styles.mediaButton} onPress={handlePickThumbnail} disabled={isUploading}>
            {thumbnail ? (
              <Image source={{ uri: thumbnail }} style={styles.thumbnailPreview} />
            ) : (
              <>
                <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
                <Text style={styles.mediaText}>Select Thumbnail</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Details Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Video Title"
            placeholderTextColor={colors.textSecondary}
            value={title}
            onChangeText={setTitle}
            editable={!isUploading}
          />

          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categoryOptions.map(cat => (
              <Pressable
                key={cat}
                style={[
                  styles.categoryChip,
                  selectedCategory === cat && styles.categoryChipSelected
                ]}
                onPress={() => setSelectedCategory(cat)}
                disabled={isUploading}
              >
                <Text style={[
                  styles.categoryText,
                  selectedCategory === cat && styles.categoryTextSelected
                ]}>{cat}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Tags (comma separated)</Text>
          <TextInput
            style={styles.input}
            placeholder="gaming, rpg, fun"
            placeholderTextColor={colors.textSecondary}
            value={tags}
            onChangeText={setTags}
            editable={!isUploading}
          />

          {/* Monetization */}
          <View style={styles.monetizationSection}>
            <Text style={styles.label}>Price (0 for Free)</Text>
            <View style={styles.priceRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
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
                  <Text style={styles.currencyText}>Cash</Text>
                </Pressable>
                <Pressable
                  style={[styles.currencyBtn, currency === 'gems' && styles.currencyBtnActive]}
                  onPress={() => setCurrency('gems')}
                  disabled={isUploading}
                >
                  <Text style={styles.currencyText}>Gems</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]}
          onPress={handleUpload}
          disabled={isUploading}
        >
          {isUploading ? (
            <Text style={styles.uploadButtonText}>Uploading...</Text>
          ) : (
            <Text style={styles.uploadButtonText}>Publish Video</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.accentPrimary,
  },
  content: {
    padding: spacing.md,
  },
  permissionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  permissionText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  mediaSection: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  mediaButton: {
    flex: 1,
    height: 100,
    backgroundColor: colors.surface,
    borderRadius: 8,
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
    marginTop: spacing.xs,
  },
  selectedMedia: {
    alignItems: 'center',
  },
  thumbnailPreview: {
    width: '100%',
    height: '100%',
  },
  form: {
    gap: spacing.md,
  },
  label: {
    color: colors.accentPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    color: colors.accentPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginRight: spacing.sm,
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
    color: '#FFF',
    fontWeight: '600',
  },
  monetizationSection: {
    marginTop: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  currencyToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  currencyBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 6,
  },
  currencyBtnActive: {
    backgroundColor: colors.accentPrimary,
  },
  currencyText: {
    color: colors.accentPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: colors.accentPrimary,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
