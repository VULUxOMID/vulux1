import React, { memo, useCallback } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { spacing } from '../../theme';
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
  onScroll: (event: any) => void;
  onEndReached?: () => void;
};

function MessagesListComponent({
  conversations,
  socialUsersById,
  loading,
  onPressConversation,
  onMarkAsRead,
  onViewProfile,
  onScroll,
  onEndReached,
}: MessagesListProps) {
  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationItem
        conversation={item}
        otherUser={socialUsersById[item.otherUserId]}
        onPress={onPressConversation}
        onMarkAsRead={onMarkAsRead}
        onViewProfile={onViewProfile}
      />
    ),
    [onMarkAsRead, onPressConversation, onViewProfile, socialUsersById],
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
    />
  );
}

export const MessagesList = memo(MessagesListComponent);

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: 0,
    paddingBottom: spacing.screenBottom,
  },
});
