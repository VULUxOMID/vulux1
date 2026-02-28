import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../../../theme';

interface Comment {
  id: string;
  userAvatar: string;
  username: string;
  content: string;
  timestamp: string;
  likes: number;
  replies: number;
}

export const CommentSection = () => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Comments ({comments.length})</Text>
      
      {/* Input Area */}
      <View style={styles.inputContainer}>
        <View style={styles.currentUserAvatar} />
        <TextInput
          style={styles.input}
          placeholder="Add a comment..."
          placeholderTextColor={colors.textSecondary}
          value={newComment}
          onChangeText={setNewComment}
        />
      </View>

      {/* Comments List */}
      <View style={styles.commentsList}>
        {comments.map((comment) => (
          <View key={comment.id} style={styles.commentItem}>
            <Image source={{ uri: comment.userAvatar }} style={styles.avatar} />
            <View style={styles.commentContent}>
              <View style={styles.commentHeader}>
                <Text style={styles.username}>{comment.username}</Text>
                <Text style={styles.timestamp}>{comment.timestamp}</Text>
              </View>
              <Text style={styles.commentText}>{comment.content}</Text>
              
              <View style={styles.actions}>
                <Pressable style={styles.actionBtn}>
                  <Ionicons name="thumbs-up-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.actionText}>{comment.likes}</Text>
                </Pressable>
                <Pressable style={styles.actionBtn}>
                  <Ionicons name="chatbubble-outline" size={14} color={colors.textSecondary} />
                </Pressable>
                <Text style={styles.replyText}>Reply</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  header: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  currentUserAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    ...typography.small,
  },
  commentsList: {
    gap: spacing.lg,
  },
  commentItem: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  username: {
    ...typography.small,
    color: colors.textPrimary,
  },
  timestamp: {
    ...typography.tiny,
    color: colors.textSecondary,
  },
  commentText: {
    ...typography.small,
    color: colors.textPrimary,
    lineHeight: 18,
    marginBottom: spacing.xxs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    ...typography.tiny,
    color: colors.textSecondary,
  },
  replyText: {
    ...typography.tinyBold,
    color: colors.textSecondary,
  },
});
