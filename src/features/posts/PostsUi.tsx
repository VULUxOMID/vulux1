import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_BAR_HEIGHT } from '../../components/navigation/layoutConstants';
import { colors, radius, spacing, typography } from '../../theme';
import type { PostAuthor, PostComment, PostItem, PostVote } from './types';

function getPostCommentCount(post: PostItem) {
  return post.commentCount ?? post.comments.length;
}

function isEdited(createdAt: number, updatedAt: number) {
  return updatedAt - createdAt > 1000;
}

function formatRelativeTime(timestamp: number) {
  const deltaMinutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (deltaMinutes < 60) return `${deltaMinutes}m`;
  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function initialsForAuthor(author: PostAuthor) {
  return author.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function ScreenHeader({
  title,
  leftIcon,
  onLeftPress,
  rightIcon,
  onRightPress,
  rightLabel,
}: {
  title: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  onLeftPress?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  rightLabel?: string;
}) {
  return (
    <View style={styles.screenHeader}>
      <Pressable
        onPress={onLeftPress}
        style={[styles.headerIconButton, !leftIcon && styles.headerIconPlaceholder]}
      >
        {leftIcon ? <Ionicons color={colors.textPrimary} name={leftIcon} size={22} /> : null}
      </Pressable>
      <Text style={styles.screenHeaderTitle}>{title}</Text>
      <Pressable
        onPress={onRightPress}
        style={[styles.headerIconButton, !rightIcon && !rightLabel && styles.headerIconPlaceholder]}
      >
        {rightLabel ? <Text style={styles.headerActionLabel}>{rightLabel}</Text> : null}
        {rightIcon ? <Ionicons color={colors.textPrimary} name={rightIcon} size={22} /> : null}
      </Pressable>
    </View>
  );
}

export function Avatar({ author, size = 42 }: { author: PostAuthor; size?: number }) {
  if (author.avatarUrl) {
    return (
      <Image
        source={{ uri: author.avatarUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: author.avatarColor,
        },
      ]}
    >
      <Text style={styles.avatarText}>{initialsForAuthor(author)}</Text>
    </View>
  );
}

function VoteButton({
  icon,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.voteButton}>
      <Ionicons
        color={active ? colors.accentPrimary : colors.textSecondary}
        name={icon}
        size={18}
      />
    </Pressable>
  );
}

export function PostActionRow({
  commentCount,
  score,
  viewerSaved,
  viewerVote,
  onCommentPress,
  onUpvote,
  onDownvote,
  onSavePress,
  onSharePress,
}: {
  commentCount: number;
  score: number;
  viewerSaved: boolean;
  viewerVote: PostVote;
  onCommentPress?: () => void;
  onUpvote: () => void;
  onDownvote: () => void;
  onSavePress?: () => void;
  onSharePress?: () => void;
}) {
  return (
    <View style={styles.actionRow}>
      <Pressable onPress={onCommentPress} style={styles.actionChip}>
        <Ionicons color={colors.textSecondary} name="chatbubble-outline" size={16} />
        <Text style={styles.actionText}>{commentCount}</Text>
      </Pressable>

      <View style={styles.voteGroup}>
        <VoteButton active={viewerVote === 1} icon="arrow-up" onPress={onUpvote} />
        <Text style={styles.scoreText}>{score}</Text>
        <VoteButton active={viewerVote === -1} icon="arrow-down" onPress={onDownvote} />
      </View>

      <Pressable onPress={onSavePress} style={styles.actionChip}>
        <Ionicons
          color={viewerSaved ? colors.accentPrimary : colors.textSecondary}
          name={viewerSaved ? 'bookmark' : 'bookmark-outline'}
          size={16}
        />
        <Text style={[styles.actionText, viewerSaved ? styles.actionTextActive : null]}>
          {viewerSaved ? 'Saved' : 'Save'}
        </Text>
      </Pressable>

      <Pressable onPress={onSharePress} style={styles.actionChip}>
        <Ionicons color={colors.textSecondary} name="share-social-outline" size={16} />
        <Text style={styles.actionText}>Share</Text>
      </Pressable>
    </View>
  );
}

export function PostCard({
  onActionsPress,
  post,
  onPress,
  onCommentPress,
  onUpvote,
  onDownvote,
  onSavePress,
  onSharePress,
}: {
  onActionsPress?: () => void;
  post: PostItem;
  onPress?: () => void;
  onCommentPress?: () => void;
  onUpvote: () => void;
  onDownvote: () => void;
  onSavePress?: () => void;
  onSharePress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.cardHeader}>
        <Avatar author={post.author} />
        <View style={styles.cardMeta}>
          <View style={styles.cardMetaRow}>
            <Text style={styles.authorName}>{post.author.displayName}</Text>
            <Text style={styles.authorUsername}>{post.author.username}</Text>
            <Text style={styles.authorTime}>{formatRelativeTime(post.createdAt)}</Text>
            {isEdited(post.createdAt, post.updatedAt) ? (
              <Text style={styles.editedLabel}>edited</Text>
            ) : null}
          </View>
        </View>
        {onActionsPress ? (
          <Pressable onPress={onActionsPress} style={styles.menuButton}>
            <Ionicons color={colors.textSecondary} name="ellipsis-horizontal" size={18} />
          </Pressable>
        ) : null}
      </View>

      {post.title ? <Text style={styles.postTitle}>{post.title}</Text> : null}
      <Text style={styles.postText}>{post.text}</Text>

      {post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={styles.postImage} /> : null}

      <PostActionRow
        commentCount={getPostCommentCount(post)}
        score={post.score}
        viewerSaved={post.viewerSaved}
        viewerVote={post.viewerVote}
        onCommentPress={onCommentPress}
        onDownvote={onDownvote}
        onSavePress={onSavePress}
        onSharePress={onSharePress}
        onUpvote={onUpvote}
      />
    </Pressable>
  );
}

export function CommentCard({
  comment,
  isOwned = false,
  onActionsPress,
  onUpvote,
  onDownvote,
}: {
  comment: PostComment;
  isOwned?: boolean;
  onActionsPress?: () => void;
  onUpvote: () => void;
  onDownvote: () => void;
}) {
  return (
    <View style={styles.commentCard}>
      <View style={styles.commentRail} />
      <View style={styles.commentBody}>
        <View style={styles.cardHeader}>
          <Avatar author={comment.author} size={34} />
          <View style={styles.cardMeta}>
            <View style={styles.cardMetaRow}>
              <Text style={styles.authorName}>{comment.author.displayName}</Text>
              <Text style={styles.authorUsername}>{comment.author.username}</Text>
              <Text style={styles.authorTime}>{formatRelativeTime(comment.createdAt)}</Text>
              {isEdited(comment.createdAt, comment.updatedAt) ? (
                <Text style={styles.editedLabel}>edited</Text>
              ) : null}
            </View>
          </View>
          {isOwned ? (
            <Pressable onPress={onActionsPress} style={styles.menuButton}>
              <Ionicons color={colors.textSecondary} name="ellipsis-horizontal" size={18} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.commentText}>{comment.text}</Text>
        <View style={styles.commentActionRow}>
          <VoteButton active={comment.viewerVote === 1} icon="arrow-up" onPress={onUpvote} />
          <Text style={styles.scoreText}>{comment.score}</Text>
          <VoteButton active={comment.viewerVote === -1} icon="arrow-down" onPress={onDownvote} />
        </View>
      </View>
    </View>
  );
}

export function LoadingState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={postsUiStyles.emptyState}>
      <ActivityIndicator color={colors.accentPrimary} size="small" />
      <Text style={postsUiStyles.emptyTitle}>{title}</Text>
      <Text style={postsUiStyles.emptyBody}>{body}</Text>
    </View>
  );
}

export function ErrorState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={postsUiStyles.errorState}>
      <Ionicons color={colors.accentDanger} name="alert-circle-outline" size={28} />
      <Text style={postsUiStyles.emptyTitle}>{title}</Text>
      <Text style={postsUiStyles.emptyBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.errorActionButton}>
          <Text style={styles.errorActionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ComposerEntry({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.composerEntry}>
      <View style={styles.composerPrompt}>
        <Ionicons color={colors.textSecondary} name="create-outline" size={18} />
        <Text style={styles.composerPromptText}>Share a thought with Posts</Text>
      </View>
      <View style={styles.createPill}>
        <Text style={styles.createPillLabel}>Create</Text>
      </View>
    </Pressable>
  );
}

export function ReplyInput({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  actionLabel,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  actionLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const canSubmit = value.trim().length > 0;

  return (
    <View
      style={[
        styles.replyBar,
        { paddingBottom: insets.bottom + NAV_BAR_HEIGHT + spacing.lg },
      ]}
    >
      <TextInput
        multiline
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.replyInput}
        value={value}
      />
      <Pressable
        disabled={!canSubmit}
        onPress={onSubmit}
        style={[styles.replySubmit, !canSubmit && styles.replySubmitDisabled]}
      >
        <Text style={styles.replySubmitText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

export function ActionSheet({
  onClose,
  onDelete,
  onEdit,
  title,
  visible,
}: {
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  title: string;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.sheetBackdrop}>
        <View style={styles.sheetCard}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onEdit} style={styles.sheetAction}>
            <Text style={styles.sheetActionText}>Edit</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={styles.sheetAction}>
            <Text style={[styles.sheetActionText, styles.sheetDeleteText]}>Delete</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.sheetCancelAction}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export function EditComposerModal({
  actionLabel,
  onCancel,
  onPickImage,
  onRemoveImage,
  onSubmit,
  isImageUploading,
  imageUrl,
  title,
  value,
  visible,
  onChangeText,
}: {
  actionLabel: string;
  onCancel: () => void;
  onPickImage?: () => void;
  onRemoveImage?: () => void;
  onSubmit: () => void;
  isImageUploading?: boolean;
  imageUrl?: string;
  title: string;
  value: string;
  visible: boolean;
  onChangeText: (value: string) => void;
}) {
  const canSubmit = value.trim().length > 0 && !isImageUploading;
  const normalizedImageUrl = imageUrl?.trim() ?? '';

  return (
    <Modal animationType="slide" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.editBackdrop}>
        <View style={styles.editCard}>
          <View style={styles.editHeader}>
            <Text style={styles.editTitle}>{title}</Text>
            <Pressable onPress={onCancel} style={styles.editCloseButton}>
              <Ionicons color={colors.textSecondary} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <TextInput
              multiline
              onChangeText={onChangeText}
              placeholder="Write here"
              placeholderTextColor={colors.textMuted}
              style={styles.editInput}
              value={value}
            />
            {onPickImage ? (
              <View style={styles.editImageSection}>
                <View style={styles.editImageActions}>
                  <Pressable
                    onPress={onPickImage}
                    style={styles.editImageButton}
                  >
                    <Text style={styles.editImageButtonText}>
                      {isImageUploading
                        ? 'Uploading...'
                        : normalizedImageUrl
                          ? 'Change image'
                          : 'Attach image'}
                    </Text>
                  </Pressable>
                  {normalizedImageUrl && onRemoveImage ? (
                    <Pressable onPress={onRemoveImage} style={styles.editImageButton}>
                      <Text style={styles.editImageButtonText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
                {normalizedImageUrl ? (
                  <Image source={{ uri: normalizedImageUrl }} style={styles.editImagePreview} />
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.editFooter}>
            <Pressable onPress={onCancel} style={styles.editSecondaryButton}>
              <Text style={styles.editSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!canSubmit}
              onPress={onSubmit}
              style={[styles.editPrimaryButton, !canSubmit && styles.replySubmitDisabled]}
            >
              <Text style={styles.editPrimaryText}>{actionLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const postsUiStyles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pageContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.screenBottom + spacing.xl,
    gap: spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tabChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  tabChipActive: {
    backgroundColor: colors.accentPrimarySubtle,
    borderColor: colors.accentPrimarySoft,
  },
  tabChipLabel: {
    ...typography.smallBold,
    color: colors.textSecondary,
  },
  tabChipLabelActive: {
    color: colors.textPrimary,
  },
  emptyState: {
    padding: spacing.xxl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorState: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  emptyBody: {
    ...typography.small,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

const styles = StyleSheet.create({
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  screenHeaderTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  headerIconPlaceholder: {
    backgroundColor: 'transparent',
  },
  headerActionLabel: {
    ...typography.smallBold,
    color: colors.accentPrimary,
  },
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.smallBold,
    color: colors.textOnLight,
  },
  composerEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.mdPlus,
  },
  composerPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  composerPromptText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  createPill: {
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  createPillLabel: {
    ...typography.smallBold,
    color: colors.textOnLight,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardMeta: {
    flex: 1,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsPlus,
    flexWrap: 'wrap',
  },
  authorName: {
    ...typography.smallBold,
    color: colors.textPrimary,
  },
  authorUsername: {
    ...typography.small,
    color: colors.textSecondary,
  },
  authorTime: {
    ...typography.small,
    color: colors.textMuted,
  },
  editedLabel: {
    ...typography.small,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorActionButton: {
    marginTop: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.accentPrimarySoft,
    backgroundColor: colors.accentPrimarySubtle,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.sm,
  },
  errorActionLabel: {
    ...typography.smallBold,
    color: colors.textPrimary,
  },
  postTitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  postText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 23,
  },
  postImage: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.smPlus,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  actionText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  actionTextActive: {
    color: colors.accentPrimary,
  },
  voteGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  voteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    ...typography.smallBold,
    color: colors.textPrimary,
    minWidth: 28,
    textAlign: 'center',
  },
  commentCard: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  commentRail: {
    width: 2,
    borderRadius: radius.full,
    backgroundColor: colors.borderSubtle,
  },
  commentBody: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  commentText: {
    ...typography.small,
    color: colors.textPrimary,
    lineHeight: 21,
  },
  commentActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  replyInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
  },
  replySubmit: {
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  replySubmitDisabled: {
    opacity: 0.45,
  },
  replySubmitText: {
    ...typography.smallBold,
    color: colors.textOnLight,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlayDarkStrong,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  sheetCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sheetTitle: {
    ...typography.smallBold,
    color: colors.textSecondary,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  sheetAction: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.md,
  },
  sheetActionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  sheetDeleteText: {
    color: colors.accentDanger,
  },
  sheetCancelAction: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.mdPlus,
    paddingVertical: spacing.md,
  },
  sheetCancelText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  editBackdrop: {
    flex: 1,
    backgroundColor: colors.overlayDarkStrong,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  editCard: {
    maxHeight: '80%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editTitle: {
    ...typography.bodyBold,
    color: colors.textPrimary,
  },
  editCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  editInput: {
    minHeight: 180,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    ...typography.body,
  },
  editImageSection: {
    gap: spacing.sm,
  },
  editImageActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editImageButton: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  editImageButtonText: {
    ...typography.smallBold,
    color: colors.textSecondary,
  },
  editImagePreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  editFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  editSecondaryButton: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  editSecondaryText: {
    ...typography.smallBold,
    color: colors.textSecondary,
  },
  editPrimaryButton: {
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  editPrimaryText: {
    ...typography.smallBold,
    color: colors.textOnLight,
  },
});
