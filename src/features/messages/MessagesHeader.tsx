import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../theme';
import { TopBar } from '../home/TopBar';
import { ActivitiesRow, type Friend } from '../home/ActivitiesRow';
import { MessagesSearchBar } from './components/MessagesSearchBar';

type MessagesHeaderProps = {
  title?: string;
  onPressSearch: () => void;
  friends: Friend[];
  onFriendPress: (friend: Friend) => void;
  loading: boolean;
};

function MessagesHeaderComponent({
  title = 'Chat',
  onPressSearch,
  friends,
  onFriendPress,
  loading,
}: MessagesHeaderProps) {
  return (
    <View style={styles.stickyHeader}>
      <TopBar title={title} actions={<View />} />

      <MessagesSearchBar onPress={onPressSearch} />

      <ActivitiesRow
        friends={friends}
        onFriendPress={onFriendPress}
        loading={loading}
      />
    </View>
  );
}

export const MessagesHeader = memo(MessagesHeaderComponent);

const styles = StyleSheet.create({
  stickyHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    zIndex: 10,
  },
});
