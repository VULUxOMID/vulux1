import React from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../theme';
import { Friend } from '../ActivitiesRow';
import { EventWidget } from '../widgets/EventWidget';
import { GlobalChatWidget } from '../widgets/GlobalChatWidget';

type HomeWidgetStackProps = {
  onOpenChat: () => void;
  onAnnounceWinner: (message: string) => void;
  friends: Friend[];
  activePlayersNow: number;
  messageCount: number;
  isChatOpen: boolean;
};

export const HomeWidgetStack = React.memo(function HomeWidgetStack({
  onOpenChat,
  onAnnounceWinner,
  friends,
  activePlayersNow,
  messageCount,
  isChatOpen,
}: HomeWidgetStackProps) {
  return (
    <View style={styles.widgetStack}>
      <EventWidget
        onAnnounceWinner={onAnnounceWinner}
        friends={friends}
        activePlayersNow={activePlayersNow}
      />
      <GlobalChatWidget
        onOpen={onOpenChat}
        messageCount={messageCount}
        isChatOpen={isChatOpen}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  widgetStack: {
    gap: spacing.sm,
  },
});
