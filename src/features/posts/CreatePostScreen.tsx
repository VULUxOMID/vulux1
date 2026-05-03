import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { toast } from '../../components/Toast';
import { colors, radius, spacing, typography } from '../../theme';
import { usePosts } from './PostsContext';
import { usePostImageUpload } from './usePostImageUpload';
import { ErrorState, ScreenHeader, postsUiStyles } from './PostsUi';

export default function CreatePostScreen() {
  const router = useRouter();
  const { createPost } = usePosts();
  const { isUploadingImage, pickAndUploadImage } = usePostImageUpload();
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canPost = text.trim().length > 0 && !isUploadingImage;
  const normalizedImageUrl = imageUrl.trim();

  return (
    <SafeAreaView edges={['top']} style={postsUiStyles.page}>
      <ScreenHeader
        title="Create post"
        leftIcon="close"
        onLeftPress={() => router.back()}
        rightLabel={isSubmitting ? 'Posting...' : 'Post'}
        onRightPress={async () => {
          if (!canPost) return;
          try {
            setIsSubmitting(true);
            setSubmitError(null);
            const postId = await createPost({
              text,
              imageUrl: normalizedImageUrl || undefined,
            });
            toast.success('Post published');
            router.replace(`/posts/${postId}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not publish your post.';
            setSubmitError(message);
            toast.error(message);
          } finally {
            setIsSubmitting(false);
          }
        }}
      />

      <ScrollView contentContainerStyle={postsUiStyles.pageContent} keyboardShouldPersistTaps="handled">
        {submitError ? <ErrorState body={submitError} title="Post failed" /> : null}
        <View style={styles.composerCard}>
          <TextInput
            multiline
            editable={!isSubmitting}
            onChangeText={setText}
            placeholder="What should the feed talk about today?"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
            value={text}
          />

          <View style={styles.mediaActionRow}>
            <Pressable
              disabled={isSubmitting || isUploadingImage}
              onPress={async () => {
                try {
                  const uploadedUrl = await pickAndUploadImage();
                  if (!uploadedUrl) {
                    return;
                  }
                  setImageUrl(uploadedUrl);
                  toast.success('Image attached');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Could not upload that image right now.');
                }
              }}
              style={[styles.mediaButton, normalizedImageUrl && styles.mediaButtonActive]}
            >
              <Ionicons
                color={normalizedImageUrl ? colors.accentPrimary : colors.textSecondary}
                name="image-outline"
                size={18}
              />
              <Text style={[styles.mediaButtonLabel, normalizedImageUrl && styles.mediaButtonLabelActive]}>
                {isUploadingImage
                  ? 'Uploading...'
                  : normalizedImageUrl
                    ? 'Change image'
                    : 'Attach image'}
              </Text>
            </Pressable>

            {normalizedImageUrl ? (
              <Pressable
                disabled={isSubmitting || isUploadingImage}
                onPress={() => setImageUrl('')}
                style={styles.removeButton}
              >
                <Text style={styles.removeButtonLabel}>Remove</Text>
              </Pressable>
            ) : null}
          </View>

          {normalizedImageUrl ? <Image source={{ uri: normalizedImageUrl }} style={styles.previewImage} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  composerCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  textInput: {
    minHeight: 220,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    ...typography.body,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  mediaButtonActive: {
    borderColor: colors.accentPrimarySoft,
    backgroundColor: colors.accentPrimarySubtle,
  },
  mediaButtonLabel: {
    ...typography.smallBold,
    color: colors.textSecondary,
  },
  mediaButtonLabelActive: {
    color: colors.textPrimary,
  },
  mediaActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  removeButton: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  removeButtonLabel: {
    ...typography.smallBold,
    color: colors.textSecondary,
  },
  previewImage: {
    width: '100%',
    height: 240,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
});
