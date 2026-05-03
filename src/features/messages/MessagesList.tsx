import React, { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components';
import { colors, spacing } from '../../theme';
import { ConversationItem } from '../chat/components/ConversationItem';
import { MessagesPageSkeleton } from '../chat/components/MessagesPageSkeleton';
import type { Conversation, SocialUser } from '../../data/contracts';

type MessagesListProps = {
  conversations: Conversation[];
  socialUsersById: Record<string, SocialUser>;
  loading: boolean;
  onPressConversation: (conversation: Conversation) => void;
  onMarkAsRead?: (conversation: Conversation) => void;
  onViewProfile: (userId: string) => void;
  onReportUser?: (conversation: Conversation) => void;
  onScroll: (event: any) => void;
  onEndReached?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  headerComponent?: React.ReactElement | null;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

function MessagesListComponent({
  conversations,
  socialUsersById,
  loading,
  onPressConversation,
  onMarkAsRead,
  onViewProfile,
  onReportUser,
  onScroll,
  onEndReached,
  emptyTitle,
  emptySubtitle,
  headerComponent,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: MessagesListProps) {
  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationItem
        conversation={item}
        otherUser={socialUsersById[item.otherUserId]}
        onPress={onPressConversation}
        onMarkAsRead={onMarkAsRead}
        onViewProfile={onViewProfile}
        onReportUser={onReportUser}
      />
    ),
    [onMarkAsRead, onPressConversation, onReportUser, onViewProfile, socialUsersById],
  );

  if (loading) {
    return <MessagesPageSkeleton />;
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={headerComponent}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <AppText style={styles.emptyTitle}>{emptyTitle ?? 'No conversations yet'}</AppText>
          <AppText variant="small" secondary style={styles.emptySubtitle}>
            {emptySubtitle ?? 'Start a DM from a profile or your friends list.'}
          </AppText>
          {primaryActionLabel && onPrimaryAction ? (
            <View style={styles.emptyActions}>
              <Pressable style={styles.emptyPrimaryAction} onPress={onPrimaryAction}>
                <AppText style={styles.emptyPrimaryActionText}>
                  {primaryActionLabel}
                </AppText>
              </Pressable>
              {secondaryActionLabel && onSecondaryAction ? (
                <Pressable style={styles.emptySecondaryAction} onPress={onSecondaryAction}>
                  <AppText style={styles.emptySecondaryActionText}>
                    {secondaryActionLabel}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      }
    />
  );
}

export const MessagesList = memo(MessagesListComponent);

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: 0,
    paddingBottom: spacing.screenBottom,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    maxWidth: 260,
  },
  emptyActions: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    width: '100%',
    maxWidth: 280,
  },
  emptyPrimaryAction: {
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPrimaryActionText: {
    color: colors.textOnLight,
    fontWeight: '700',
  },
  emptySecondaryAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySecondaryActionText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
