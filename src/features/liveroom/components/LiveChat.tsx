import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Image, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components';
import { colors, radius, spacing } from '../../../theme';
import { ChatMessage, LiveUser } from '../types';
import { useProfile } from '../../../context/ProfileContext';

type LiveChatProps = {
  messages: ChatMessage[];
  onUserTap?: (user: LiveUser) => void;
};

export function LiveChat({ messages, onUserTap }: LiveChatProps) {
  const scrollRef = useRef<ScrollView>(null);
  const { showProfile } = useProfile();

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  return (
    <View style={styles.container}>
      {/* Top Fade Overlay - smooth gradient */}
      <LinearGradient
        colors={[
          colors.background, // Match screen background
          'rgba(20, 21, 27, 0.9)',
          'rgba(20, 21, 27, 0.7)',
          'rgba(20, 21, 27, 0.4)',
          'rgba(20, 21, 27, 0.15)',
          'transparent',
        ]}
        locations={[0, 0.2, 0.4, 0.6, 0.8, 1]}
        style={styles.fadeOverlay}
        pointerEvents="none"
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
      >
        {messages.length === 0 ? (
          <AppText style={styles.emptyText}>No messages yet</AppText>
        ) : (
          messages.map((message) => (
            <ChatMessageItem 
              key={message.id} 
              message={message} 
              onUserTap={onUserTap}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ChatMessageItem({ 
  message, 
  onUserTap 
}: { 
  message: ChatMessage; 
  onUserTap?: (user: LiveUser) => void;
}) {
  const { showProfile } = useProfile();
  
  const handleUserPress = (user: LiveUser) => {
    if (onUserTap) {
      onUserTap(user);
    } else {
      showProfile(user);
    }
  };
  if (message.type === 'system') {
    return <SystemMessage message={message} />;
  }

  const avatarUri = message.user?.avatarUrl?.trim();

  return (
    <View style={styles.messageRow}>
      {message.user && (
        <Pressable 
          onPress={() => handleUserPress(message.user!)}
          style={styles.avatarContainer}
        >
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={12} color={colors.textMuted} />
            </View>
          )}
        </Pressable>
      )}
      <View style={styles.messageContent}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Pressable onPress={() => message.user && handleUserPress(message.user)}>
            <AppText style={styles.username}>
              {message.user?.name}
            </AppText>
          </Pressable>
          <AppText style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginHorizontal: 4 }}>
            •
          </AppText>
          <AppText style={styles.messageText}>{message.text}</AppText>
        </View>
      </View>
    </View>
  );
}

// Get icon and accent color based on system message type
function getSystemMessageStyle(systemType?: ChatMessage['systemType']) {
  switch (systemType) {
    case 'boost':
      return {
        icon: 'flash' as const,
        iconColor: '#F2D24A',
        bgColor: 'rgba(242, 210, 74, 0.15)',
        borderColor: 'rgba(242, 210, 74, 0.3)',
      };
    case 'join':
      return {
        icon: 'enter-outline' as const,
        iconColor: colors.accentSuccess,
        bgColor: 'rgba(25, 250, 152, 0.12)',
        borderColor: 'rgba(25, 250, 152, 0.25)',
      };
    case 'invite':
      return {
        icon: 'person-add-outline' as const,
        iconColor: colors.accentPrimary,
        bgColor: 'rgba(123, 97, 255, 0.12)',
        borderColor: 'rgba(123, 97, 255, 0.25)',
      };
    case 'leave':
      return {
        icon: 'exit-outline' as const,
        iconColor: colors.textMuted,
        bgColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
      };
    case 'kick':
      return {
        icon: 'remove-circle-outline' as const,
        iconColor: colors.accentWarning,
        bgColor: 'rgba(255, 215, 0, 0.12)',
        borderColor: 'rgba(255, 215, 0, 0.25)',
      };
    case 'ban':
      return {
        icon: 'ban-outline' as const,
        iconColor: colors.accentDanger,
        bgColor: 'rgba(255, 94, 94, 0.12)',
        borderColor: 'rgba(255, 94, 94, 0.25)',
      };
    default:
      return {
        icon: 'information-circle-outline' as const,
        iconColor: colors.textSecondary,
        bgColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
      };
  }
}

function SystemMessage({ message }: { message: ChatMessage }) {
  const style = getSystemMessageStyle(message.systemType);
  
  return (
    <View style={[
      styles.systemMessage,
      { 
        backgroundColor: style.bgColor,
        borderColor: style.borderColor,
      }
    ]}>
      <Ionicons name={style.icon} size={14} color={style.iconColor} />
      <AppText style={styles.systemText}>
        {message.text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 400, // Taller for more text space
    marginBottom: 0,
    paddingLeft: spacing.md,
    paddingRight: 90, // Narrower width - leave space for boost button
    position: 'relative',
  },
  fadeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 1,
  },
  scrollView: {
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 80,
    paddingBottom: spacing.sm,
    gap: 6, 
  },
  
  // User messages
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  avatarContainer: {
    width: 24,
    height: 24,
    marginBottom: 2,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
  },
  avatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageContent: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    maxWidth: '100%',
  },
  username: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A0A0A0',
    marginBottom: 0,
    marginLeft: 0, 
  },
  messageText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
    fontWeight: '400',
  },
  
  // System messages - unified style
  systemMessage: {
    alignSelf: 'center', // Center the card
    flexDirection: 'row',
    alignItems: 'center', // Center icon and text vertically
    justifyContent: 'center', // Center content horizontally
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginVertical: 3,
    minHeight: 44, // Ensure minimum height for proper spacing
  },
  systemText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'center', // Center text alignment
    flex: 1, // Allow text to take available space
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
