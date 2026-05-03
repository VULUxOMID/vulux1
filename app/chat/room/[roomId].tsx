import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../../../src/auth/clerkSession';
import { Avatar, AppScreen, AppText } from '../../../src/components';
import { toast } from '../../../src/components/Toast';
import { useRepositories } from '../../../src/data/provider';
import { useAppIsActive } from '../../../src/hooks/useAppIsActive';
import { colors, radius, spacing } from '../../../src/theme';
import { hapticTap } from '../../../src/utils/haptics';
import { resolveThreadRouteTargets } from '../../../src/features/chat/threadRouteTargets';
import {
  fetchGroupChatRoom,
  joinGroupChatRoom,
  leaveGroupChatRoom,
  type GroupChatMember,
  type GroupChatRoomMessage,
  type GroupChatRoom,
  listGroupChatRoomMessages,
  sendGroupChatRoomMessage,
} from '../../../src/features/messages/groupChatApi';

type RouteParams = {
  roomId?: string;
  messageId?: string | string[];
  replyToMessageId?: string | string[];
};

type RoomMessage = {
  id: string;
  user: string;
  text: string;
  createdAt: number;
  senderId?: string;
};

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function GroupChatRoomScreen() {
  const router = useRouter();
  const {
    roomId: roomIdParam,
    messageId: routeMessageId,
    replyToMessageId: routeReplyToMessageId,
  } = useLocalSearchParams<RouteParams>();
  const { userId, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { social: socialRepo } = useRepositories();
  const roomId = useMemo(() => {
    if (typeof roomIdParam !== 'string') return '';
    try {
      return decodeURIComponent(roomIdParam);
    } catch {
      return roomIdParam;
    }
  }, [roomIdParam]);
  const [room, setRoom] = useState<GroupChatRoom | null>(null);
  const [members, setMembers] = useState<GroupChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [text, setText] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isMutatingMembership, setIsMutatingMembership] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const listRef = useRef<FlatList<RoomMessage>>(null);
  const handledRouteFocusTargetRef = useRef<string | null>(null);
  const queriesEnabled = isAuthLoaded && isSignedIn && !!userId && isFocused && isAppActive;

  const loadRoom = useCallback(async () => {
    if (!roomId) {
      setRoom(null);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await fetchGroupChatRoom(roomId);
      setRoom(payload.room);
      setMembers(payload.members);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load this room.');
      setRoom(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const loadRoomMessages = useCallback(async () => {
    if (!roomId || room?.membershipState !== 'active') {
      return;
    }
    setMessagesLoading(true);
    try {
      const nextMessages = await listGroupChatRoomMessages(roomId);
      setRoomMessagesState(
        nextMessages.map((message) => ({
          id: message.id,
          user: message.user,
          text: message.text,
          createdAt: message.createdAt,
          senderId: message.senderId,
        })),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load room messages.');
    } finally {
      setMessagesLoading(false);
    }
  }, [room?.membershipState, roomId]);

  useEffect(() => {
    if (!queriesEnabled) {
      setRoom(null);
      setMembers([]);
      setLoading(false);
      return;
    }
    void loadRoom();
  }, [loadRoom, queriesEnabled]);

  const [roomMessagesState, setRoomMessagesState] = useState<RoomMessage[]>([]);

  useEffect(() => {
    if (!queriesEnabled || !roomId || room?.membershipState !== 'active') {
      setRoomMessagesState([]);
      return;
    }
    void loadRoomMessages();
  }, [loadRoomMessages, queriesEnabled, refreshNonce, room?.membershipState, roomId]);

  const socialUsers = useMemo(
    () => (queriesEnabled ? socialRepo.listUsers({ limit: 300 }) : []),
    [queriesEnabled, socialRepo],
  );
  const currentUserLabel = useMemo(() => {
    return socialUsers.find((candidate) => candidate.id === userId)?.username ?? 'You';
  }, [socialUsers, userId]);

  const roomMessages = useMemo<RoomMessage[]>(
    () => (queriesEnabled && room?.membershipState === 'active' ? roomMessagesState : []),
    [queriesEnabled, room?.membershipState, roomMessagesState],
  );

  const routeTargets = useMemo(
    () =>
      resolveThreadRouteTargets(roomMessages, {
        messageId: routeMessageId,
        replyToMessageId: routeReplyToMessageId,
      }),
    [roomMessages, routeMessageId, routeReplyToMessageId],
  );

  const jumpToMessage = useCallback((messageId: string) => {
    const index = roomMessages.findIndex((message) => message.id === messageId);
    if (index < 0) {
      return;
    }
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId(null), 900);
  }, [roomMessages]);

  const activeMembers = useMemo(
    () => members.filter((member) => member.membershipState === 'active'),
    [members],
  );

  useEffect(() => {
    handledRouteFocusTargetRef.current = null;
  }, [roomId]);

  useEffect(() => {
    if (!queriesEnabled || room?.membershipState !== 'active') {
      return;
    }

    const focusTarget = routeTargets.focusMessage ?? routeTargets.replyToMessage;
    if (!focusTarget) {
      return;
    }

    const focusKey = `${roomId}::${focusTarget.id}`;
    if (handledRouteFocusTargetRef.current === focusKey) {
      return;
    }

    jumpToMessage(focusTarget.id);
    handledRouteFocusTargetRef.current = focusKey;
  }, [
    jumpToMessage,
    queriesEnabled,
    room?.membershipState,
    roomId,
    routeTargets.focusMessage,
    routeTargets.replyToMessage,
  ]);

  const handleJoin = useCallback(async () => {
    if (!roomId || isMutatingMembership) return;
    setIsMutatingMembership(true);
    try {
      await joinGroupChatRoom(roomId);
      toast.success('Joined room.');
      await loadRoom();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not join room.');
    } finally {
      setIsMutatingMembership(false);
    }
  }, [isMutatingMembership, loadRoom, roomId]);

  const handleLeave = useCallback(async () => {
    if (!roomId || isMutatingMembership) return;
    setIsMutatingMembership(true);
    try {
      await leaveGroupChatRoom(roomId);
      toast.success('Left room.');
      await loadRoom();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not leave room.');
    } finally {
      setIsMutatingMembership(false);
    }
  }, [isMutatingMembership, loadRoom, roomId]);

  const handleSend = useCallback(async () => {
    const nextText = text.trim();
    if (!nextText || !roomId || room?.membershipState !== 'active') {
      return;
    }
    const createdAt = Date.now();
    setText('');
    try {
      await sendGroupChatRoomMessage(roomId, {
        id: createMessageId(),
        user: currentUserLabel,
        senderId: userId ?? undefined,
        text: nextText,
        createdAt,
        type: 'user',
      });
      setRefreshNonce((current) => current + 1);
    } catch (error) {
      setText(nextText);
      toast.error(error instanceof Error ? error.message : 'Could not send message.');
    }
  }, [currentUserLabel, room?.membershipState, roomId, text, userId]);

  return (
    <AppScreen noPadding style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerIconButton}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <AppText style={styles.headerTitle}>{room?.title ?? 'Group Chat'}</AppText>
          <AppText variant="small" secondary>
            {room?.membershipState === 'active'
              ? `${activeMembers.length} active members`
              : room?.membershipState === 'invited'
                ? 'Invitation pending'
                : 'You left this room'}
          </AppText>
        </View>
        {room?.membershipState === 'active' && room.role !== 'owner' ? (
          <Pressable onPress={() => void handleLeave()} style={styles.leaveButton}>
            <AppText style={styles.leaveButtonText}>Leave</AppText>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <View style={styles.membersSection}>
        <FlatList
          horizontal
          data={members}
          keyExtractor={(item) => `${item.userId}:${item.membershipState}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.membersList}
          renderItem={({ item }) => (
            <View style={styles.memberChip}>
              <Avatar
                uri={item.avatarUrl}
                name={item.displayName ?? item.username ?? item.userId}
                size="sm"
              />
              <View style={styles.memberChipText}>
                <AppText style={styles.memberName} numberOfLines={1}>
                  {item.displayName ?? item.username ?? item.userId}
                </AppText>
                <AppText variant="tiny" secondary>
                  {item.role === 'owner'
                    ? 'Owner'
                    : item.membershipState === 'active'
                      ? 'Joined'
                      : item.membershipState === 'invited'
                        ? 'Invited'
                        : 'Left'}
                </AppText>
              </View>
            </View>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.stateCard}>
          <AppText secondary>Loading room...</AppText>
        </View>
      ) : room?.membershipState !== 'active' ? (
        <View style={styles.stateCard}>
          <AppText style={styles.stateTitle}>
            {room?.membershipState === 'invited' ? 'Join this room' : 'Rejoin this room'}
          </AppText>
          <AppText variant="small" secondary style={styles.stateBody}>
            {room?.membershipState === 'invited'
              ? 'You were invited to this group. Join to see and send messages.'
              : 'You left this room. Rejoin to get back into the conversation.'}
          </AppText>
          <Pressable
            onPress={() => void handleJoin()}
            disabled={isMutatingMembership}
            style={styles.joinButton}
          >
            <AppText style={styles.joinButtonText}>
              {isMutatingMembership ? 'Working...' : room?.membershipState === 'invited' ? 'Join Room' : 'Rejoin Room'}
            </AppText>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.chatWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            ref={listRef}
            data={roomMessages}
            keyExtractor={(item) => item.id}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            onScrollToIndexFailed={({ index }) => {
              if (index < 0 || index >= roomMessages.length) {
                return;
              }
              setTimeout(() => {
                listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
              }, 60);
            }}
            renderItem={({ item }) => {
              const isMine = item.senderId === userId;
              return (
                <View style={[styles.messageRow, isMine ? styles.messageRowMine : null]}>
                  <View
                    style={[
                      styles.messageBubble,
                      isMine ? styles.messageBubbleMine : null,
                      item.id === highlightedMessageId ? styles.messageBubbleHighlighted : null,
                    ]}
                  >
                    <AppText variant="tiny" secondary style={styles.messageUser}>
                      {isMine ? 'You' : item.user}
                    </AppText>
                    <AppText style={styles.messageText}>{item.text}</AppText>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.stateCard}>
                <AppText style={styles.stateTitle}>No messages yet</AppText>
                <AppText variant="small" secondary style={styles.stateBody}>
                  Start the room with a first message.
                </AppText>
              </View>
            }
          />

          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message the room"
              placeholderTextColor={colors.textMuted}
              style={styles.composerInput}
              multiline
            />
            <Pressable
              onPress={() => {
                hapticTap();
                void handleSend();
              }}
              disabled={text.trim().length === 0}
              style={[styles.sendButton, text.trim().length === 0 && styles.sendButtonDisabled]}
            >
              <Ionicons name="send" size={18} color={colors.background} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 56,
  },
  leaveButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
  },
  leaveButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  membersSection: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  membersList: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    minWidth: 132,
  },
  memberChipText: {
    flex: 1,
  },
  memberName: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  stateCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.sm,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  stateBody: {
    lineHeight: 18,
  },
  joinButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
  },
  joinButtonText: {
    color: colors.background,
    fontWeight: '700',
  },
  chatWrap: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    flexGrow: 1,
  },
  messageRow: {
    alignItems: 'flex-start',
  },
  messageRowMine: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 4,
  },
  messageBubbleMine: {
    backgroundColor: colors.accentPrimarySubtle,
  },
  messageBubbleHighlighted: {
    borderColor: colors.accentPrimary,
    shadowColor: colors.accentPrimary,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  messageUser: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  messageText: {
    color: colors.textPrimary,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.background,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentPrimary,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});
