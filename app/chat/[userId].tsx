import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import Slider from '@react-native-community/slider';
import { useAuth } from '../../src/auth/spacetimeSession';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format, isSameDay } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioRecorder, AudioModule, useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useIsFocused } from '@react-navigation/native';

import { AppText } from '../../src/components';
import { colors, radius, spacing } from '../../src/theme';
import { MessageActionMenu } from '../../src/features/chat/MessageActionMenu';
import { hapticConfirm, hapticTap, hapticWarn } from '../../src/utils/haptics';
import { toast } from '../../src/components/Toast';
import { useProfile } from '../../src/context/ProfileContext';
import { useWallet } from '../../src/context/WalletContext';
import { useRepositories } from '../../src/data/provider';
import type { SocialUser } from '../../src/data/contracts';
import type { LiveUser } from '../../src/features/liveroom/types';
import { requestBackendRefresh } from '../../src/data/adapters/backend/refreshBus';
import { useAppIsActive } from '../../src/hooks/useAppIsActive';
import { subscribeConversation } from '../../src/lib/spacetime';

// Types
type ActionId = 'reply' | 'copy' | 'edit' | 'delete';

type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HOLD_MENU_DELAY_MS = 350;

// Unified Message Type
export type ChatMessage = {
  id: string;
  user: string; // Display name
  senderId: string; // ID for logic (me/them)
  text: string;
  createdAt: number;
  deliveredAt?: number;
  readAt?: number;
  edited?: boolean;
  replyTo?: null | { id: string; user: string; text: string; senderId?: string };
  type?: 'user' | 'system' | 'cash' | 'voice';
  status?: 'sending' | 'sent' | 'failed';
  reactions?: { emoji: string; count: number; isMine: boolean }[];
  amount?: number;
  audioUrl?: string;
  duration?: number;
  media?: {
    type: 'image' | 'audio';
    url: string;
    aspectRatio?: number;
    duration?: number;
  };
};

export type MentionUser = {
  id: string;
  name: string;
};

function hasImageUri(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeRouteUserToken(value: string | undefined): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function createClientMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mergeThreadMessages(messages: ChatMessage[]): ChatMessage[] {
  const uniqueById = new Map<string, ChatMessage>();
  for (const message of messages) {
    uniqueById.set(message.id, message);
  }
  return Array.from(uniqueById.values()).sort((a, b) => a.createdAt - b.createdAt);
}

type MessageReceiptState = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

function resolveMessageReceiptState(message: ChatMessage): MessageReceiptState | null {
  if (message.senderId !== 'me') return null;
  if (message.status === 'sending') return 'sending';
  if (message.status === 'failed') return 'failed';
  if (typeof message.readAt === 'number' && Number.isFinite(message.readAt)) return 'read';
  if (typeof message.deliveredAt === 'number' && Number.isFinite(message.deliveredAt)) {
    return 'delivered';
  }
  if (message.status === 'sent') return 'sent';
  return 'sent';
}

function getReceiptLabel(receiptState: MessageReceiptState): string {
  if (receiptState === 'read') return 'Seen';
  if (receiptState === 'delivered') return 'Delivered';
  if (receiptState === 'failed') return 'Failed';
  if (receiptState === 'sending') return 'Sending';
  return 'Sent';
}

function getReceiptIcon(receiptState: MessageReceiptState): keyof typeof Ionicons.glyphMap {
  if (receiptState === 'read') return 'eye-outline';
  if (receiptState === 'delivered') return 'checkmark-done';
  if (receiptState === 'failed') return 'alert-circle-outline';
  if (receiptState === 'sending') return 'time-outline';
  return 'checkmark';
}

function normalizeThreadMessage(message: Record<string, any>, viewerUserId: string | null): ChatMessage {
  const rawSenderId = typeof message.senderId === 'string' ? message.senderId : '';
  const senderId = viewerUserId && rawSenderId === viewerUserId ? 'me' : rawSenderId;
  const rawReply = message.replyTo && typeof message.replyTo === 'object' ? message.replyTo : null;
  const rawReplySenderId = rawReply && typeof rawReply.senderId === 'string' ? rawReply.senderId : undefined;
  const normalizedReplySenderId =
    rawReplySenderId && viewerUserId && rawReplySenderId === viewerUserId ? 'me' : rawReplySenderId;
  const createdAt = typeof message.createdAt === 'number' ? message.createdAt : Date.now();
  const deliveredAt =
    typeof message.deliveredAt === 'number' && Number.isFinite(message.deliveredAt)
      ? message.deliveredAt
      : undefined;
  const readAt =
    typeof message.readAt === 'number' && Number.isFinite(message.readAt)
      ? message.readAt
      : undefined;

  return {
    id: typeof message.id === 'string' ? message.id : `${createdAt}`,
    user: senderId === 'me' ? 'You' : (typeof message.user === 'string' ? message.user : 'User'),
    senderId,
    text: typeof message.text === 'string' ? message.text : '',
    createdAt,
    deliveredAt,
    readAt,
    edited: message.edited === true,
    type: message.type,
    status: message.status,
    amount: typeof message.amount === 'number' ? message.amount : undefined,
    audioUrl: typeof message.audioUrl === 'string' ? message.audioUrl : undefined,
    duration: typeof message.duration === 'number' ? message.duration : undefined,
    media: message.media,
    replyTo: rawReply
      ? {
          id: typeof rawReply.id === 'string' ? rawReply.id : `${createdAt}-reply`,
          user: typeof rawReply.user === 'string' ? rawReply.user : 'User',
          text: typeof rawReply.text === 'string' ? rawReply.text : '',
          senderId: normalizedReplySenderId,
        }
      : null,
    reactions: Array.isArray(message.reactions) ? message.reactions : undefined,
  };
}

function toLiveUser(user: SocialUser): LiveUser {
  return {
    id: user.id,
    name: user.username,
    username: user.username,
    age: 0,
    country: '',
    bio: user.statusText ?? '',
    avatarUrl: user.avatarUrl ?? '',
    verified: false,
  };
}

type SocialPresenceStatus = NonNullable<SocialUser['status']>;

function resolveSocialPresence(
  user: SocialUser,
): { status: SocialPresenceStatus; label: string; isOnline: boolean } {
  const status: SocialPresenceStatus =
    user.status ?? (user.isLive ? 'live' : user.isOnline ? 'online' : 'offline');

  if (status === 'live') {
    return { status, label: 'Live', isOnline: true };
  }
  if (status === 'busy') {
    return { status, label: 'Busy', isOnline: true };
  }
  if (status === 'online') {
    return { status, label: 'Online', isOnline: true };
  }
  if (status === 'recent') {
    return { status, label: 'Recently active', isOnline: false };
  }

  return { status: 'offline', label: 'Offline', isOnline: false };
}

// --- Helper Components ---

function SimpleRichText({ text, style }: { text: string; style: any }) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return (
    <AppText style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <AppText key={i} style={[style, { fontWeight: 'bold' }]}>
              {part.slice(2, -2)}
            </AppText>
          );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <AppText key={i} style={[style, { fontStyle: 'italic' }]}>
              {part.slice(1, -1)}
            </AppText>
          );
        }
        return <AppText key={i} style={style}>{part}</AppText>;
      })}
    </AppText>
  );
}

const VoiceMessage = ({ uri, duration, isMe }: { uri: string; duration: number; isMe: boolean }) => {
  const hasAudioUri = uri.trim().length > 0;
  const player = useAudioPlayer(hasAudioUri ? uri : '');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!hasAudioUri) return;
    const interval = setInterval(() => {
      if (player.playing !== isPlaying) {
        setIsPlaying(player.playing);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [player, isPlaying, hasAudioUri]);

  const togglePlayback = () => {
    if (!hasAudioUri) {
      setIsPlaying(true);
      setTimeout(() => setIsPlaying(false), duration * 1000);
      return;
    }
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const formatDurationLocal = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Pressable 
      style={[styles.voiceBubble, isMe ? styles.voiceBubbleMine : styles.voiceBubbleThem]} 
      onPress={togglePlayback}
    >
      <Ionicons 
        name={isPlaying ? "pause" : "play"} 
        size={24} 
        color={isMe ? "#FFF" : colors.accentPrimary} 
      />
      <View style={styles.voiceWaveform}>
        {[12, 20, 16, 24, 14, 18, 10, 22].map((h, i) => (
          <View key={i} style={[styles.voiceBar, { height: h }, isMe ? styles.voiceBarMine : styles.voiceBarThem]} />
        ))}
      </View>
      <AppText style={[styles.voiceDuration, isMe && { color: '#DEE0FC' }]}>
        {formatDurationLocal(duration)}
      </AppText>
    </Pressable>
  );
};

const UserMessageRow = React.memo(function UserMessageRow({
  item,
  selected,
  menuVisible,
  isHighlighted,
  onOpenMenu,
  onJumpToReply,
  onAvatarPress,
}: {
  item: ChatMessage;
  selected: boolean;
  menuVisible: boolean;
  isHighlighted: boolean;
  onOpenMenu: (msg: ChatMessage, anchor: AnchorRect) => void;
  onJumpToReply: (id: string) => void;
  onAvatarPress: (msg: ChatMessage) => void;
}) {
  const bubbleRef = useRef<View>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressAnim = useRef(new Animated.Value(0)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;

  const isMe = item.senderId === 'me';

  const openMenuNow = useCallback(() => {
    bubbleRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
      onOpenMenu(item, { x, y, width: w, height: h });
    });
  }, [item, onOpenMenu]);

  useEffect(() => {
    return () => { if (holdTimer.current) clearTimeout(holdTimer.current); };
  }, []);

  useEffect(() => {
    pressAnim.stopAnimation();
    Animated.timing(pressAnim, { toValue: selected ? 1 : 0, duration: 120, useNativeDriver: false }).start();
  }, [pressAnim, selected]);

  useEffect(() => {
    if (isHighlighted) {
      highlightAnim.setValue(1);
      Animated.timing(highlightAnim, { toValue: 0, duration: 800, useNativeDriver: false }).start();
    }
  }, [highlightAnim, isHighlighted]);

  const onPressIn = () => {
    pressAnim.stopAnimation();
    Animated.timing(pressAnim, { toValue: 1, duration: 120, useNativeDriver: false }).start();
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(openMenuNow, HOLD_MENU_DELAY_MS);
  };

  const onPressOut = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (!selected) {
      pressAnim.stopAnimation();
      Animated.timing(pressAnim, { toValue: 0, duration: 120, useNativeDriver: false }).start();
    }
  };

  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] });
  const borderColor = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.borderSubtle, 'rgba(255,255,255,0.22)'] });
  const overlayOpacity = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const highlightBorderColor = highlightAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)'] });
  const highlightBg = highlightAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.08)'] });
  const receiptState = resolveMessageReceiptState(item);
  const receiptIcon = receiptState ? getReceiptIcon(receiptState) : null;
  const receiptLabel = receiptState ? getReceiptLabel(receiptState) : null;
  const receiptIsFailure = receiptState === 'failed';
  const receiptIsRead = receiptState === 'read';

  return (
    <Animated.View
      style={[
        styles.row,
        {
          borderColor: highlightBorderColor,
          backgroundColor: highlightBg,
          borderWidth: 1,
          borderRadius: 14,
        },
      ]}
    >
      <Pressable
        disabled={menuVisible && !selected}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.rowInner}
      >
        <Pressable
          onPress={() => onAvatarPress(item)}
          hitSlop={8}
          style={styles.avatarPressable}
        >
          <View style={styles.avatar} />
        </Pressable>
        <View style={styles.content}>
            <View style={styles.msgHeader}>
              <AppText style={styles.name}>{item.user}</AppText>
              <View style={styles.msgMetaRow}>
                <AppText style={styles.timestamp}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </AppText>
                {isMe && receiptState && receiptIcon && receiptLabel ? (
                  <View style={styles.receiptMeta}>
                    <Ionicons
                      name={receiptIcon}
                      size={11}
                      color={
                        receiptIsFailure
                          ? colors.accentDanger
                          : receiptIsRead
                            ? colors.accentPrimary
                            : colors.textMuted
                      }
                    />
                    <AppText
                      style={[
                        styles.receiptText,
                        receiptIsFailure ? styles.receiptTextFailed : undefined,
                        receiptIsRead ? styles.receiptTextRead : undefined,
                      ]}
                    >
                      {receiptLabel}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </View>

          {item.replyTo && (
            <Pressable onPress={() => onJumpToReply(item.replyTo!.id)} style={styles.replyEmbed}>
              <View style={styles.replyLine} />
              <View style={styles.replyEmbedContent}>
                <AppText style={styles.replyToName}>Replying to {item.replyTo.user}</AppText>
                <AppText numberOfLines={2} style={styles.replyPreview}>
                  {item.replyTo.text}
                </AppText>
              </View>
            </Pressable>
          )}

          <Animated.View
            ref={bubbleRef}
            collapsable={false}
            style={[
              styles.bubble,
              { transform: [{ scale }], borderColor },
            ]}
          >
            {item.media ? (
              <View style={styles.mediaContainer}>
                {item.media.type === 'image' &&
                  (hasImageUri(item.media.url) ? (
                    <Image
                      source={{ uri: item.media.url }}
                      style={[styles.mediaImage, { aspectRatio: item.media.aspectRatio || 1.5 }]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.mediaImage,
                        styles.mediaImageFallback,
                        { aspectRatio: item.media.aspectRatio || 1.5 },
                      ]}
                    />
                  ))}
                {item.media.type === 'audio' && (
                  <View style={styles.audioContainer}>
                    <Pressable style={styles.audioPlayBtn}><Ionicons name="play" size={16} color="#fff" /></Pressable>
                    <View style={styles.audioWaveform}>{[...Array(12)].map((_, i) => (<View key={i} style={[styles.audioBar, { height: Math.max(4, Math.random() * 16 + 4) }]} />))}</View>
                    <AppText style={styles.audioDuration}>0:{item.media.duration?.toString().padStart(2, '0') || '00'}</AppText>
                  </View>
                )}
              </View>
            ) : item.type === 'cash' ? (
               <View style={[styles.bubbleContainer, styles.cashBubble]}>
                 <View style={styles.cashHeader}><Ionicons name="cash" size={16} color={colors.accentSuccess} /><AppText style={styles.cashAmount}>${item.amount}</AppText></View>
                 <AppText style={styles.cashText}>{item.text}</AppText>
               </View>
            ) : item.type === 'voice' && item.audioUrl ? (
               <VoiceMessage uri={item.audioUrl} duration={item.duration || 0} isMe={isMe} />
            ) : (
              <View style={styles.msgTextContainer}>
                <SimpleRichText text={item.text} style={styles.msgText} />
                {item.edited && <AppText style={styles.editedLabel}> (edited)</AppText>}
              </View>
            )}

            {item.reactions && item.reactions.length > 0 && (
              <View style={styles.reactionsContainer}>
                {item.reactions.map((r) => (
                  <View key={r.emoji} style={[styles.reactionPill, r.isMine && styles.reactionPillActive]}>
                    <AppText style={styles.reactionEmojiText}>{r.emoji}</AppText>
                    <AppText style={[styles.reactionCount, r.isMine && styles.reactionCountActive]}>{r.count}</AppText>
                  </View>
                ))}
              </View>
            )}

            <Animated.View pointerEvents="none" style={[styles.bubbleGlow, { opacity: overlayOpacity }]} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

export default function ChatDetailScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { userId: viewerUserId, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const { showProfile } = useProfile();
  const { cash: walletCash, spendCash, addCash } = useWallet();
  const { messages: messagesRepo, social: socialRepo } = useRepositories();
  const socialUsers = useMemo<SocialUser[]>(
    () => (isAuthLoaded && isSignedIn ? socialRepo.listUsers({ limit: 300 }) : []),
    [isAuthLoaded, isSignedIn, socialRepo],
  );
  const routeUserToken = useMemo(() => normalizeRouteUserToken(userId), [userId]);
  const resolvedRouteUser = useMemo(() => {
    if (!routeUserToken) return null;
    const normalizedRouteToken = routeUserToken.toLowerCase();

    return (
      socialUsers.find(
        (user) =>
          user.id === routeUserToken ||
          user.username.toLowerCase() === normalizedRouteToken,
      ) ?? null
    );
  }, [routeUserToken, socialUsers]);
  const resolvedOtherUserId = resolvedRouteUser?.id ?? routeUserToken;

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [composerMenuVisible, setComposerMenuVisible] = useState(false);
  const [cashSheetVisible, setCashSheetVisible] = useState(false);
  const [cashAmountInput, setCashAmountInput] = useState('');
  const [cashNoteInput, setCashNoteInput] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'media' | 'links' | 'mentions'>('all');
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);
  
  const [composerH, setComposerH] = useState(0);
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const recordDotAnim = useRef(new Animated.Value(1)).current;
  const shouldAutoScrollRef = useRef(true);
  const isUserScrollingRef = useRef(false);
  const didAutoScrollOnOpenRef = useRef(false);
  const previousMessageCountRef = useRef(0);
  const scrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const repositoryThreadMessages = useMemo(() => {
    if (!resolvedOtherUserId) return [];
    return messagesRepo
      .listThreadSeedMessages(resolvedOtherUserId)
      .map((message) => normalizeThreadMessage(message as unknown as Record<string, any>, viewerUserId ?? null))
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [messagesRepo, resolvedOtherUserId, viewerUserId]);
  const conversationRows = useMemo(
    () => messagesRepo.listConversations(),
    [messagesRepo],
  );

  const messages = useMemo(() => {
    return mergeThreadMessages(localMessages);
  }, [localMessages]);

  // Keep thread in sync with backend snapshot repository.
  useEffect(() => {
    if (!resolvedOtherUserId) {
      setLocalMessages([]);
      setIsLoading(false);
      return;
    }

    setLocalMessages((currentMessages) =>
      mergeThreadMessages([...currentMessages, ...repositoryThreadMessages]),
    );
    setIsLoading(false);
  }, [repositoryThreadMessages, resolvedOtherUserId]);

  // Keep unread counters consistent across devices by clearing this thread on open.
  useEffect(() => {
    if (!resolvedOtherUserId) return;
    const conversation = conversationRows.find((item) => item.otherUserId === resolvedOtherUserId);
    if (!conversation || conversation.unreadCount <= 0) return;
    void messagesRepo.markConversationRead({ userId: resolvedOtherUserId });
    requestBackendRefresh({
      scopes: ['messages', 'conversations', 'counts'],
      source: 'manual',
      reason: 'chat_thread_opened',
    });
  }, [conversationRows, messagesRepo, resolvedOtherUserId]);

  const filteredMessages = useMemo(() => {
    let result = messages;
    if (activeFilter === 'media') result = result.filter(m => !!m.media || m.type === 'voice');
    if (activeFilter === 'links') result = result.filter(m => m.text.includes('http'));
    if (activeFilter === 'mentions') result = result.filter(m => m.text.includes('@'));
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(m => m.text.toLowerCase().includes(q) || m.user.toLowerCase().includes(q));
  }, [messages, searchQuery, activeFilter]);

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  };

  const clearScheduledScrolls = useCallback(() => {
    for (const timer of scrollTimersRef.current) {
      clearTimeout(timer);
    }
    scrollTimersRef.current = [];
  }, []);

  const scrollToBottomWithRetries = useCallback((animated = true) => {
    clearScheduledScrolls();
    const delays = [0, 80, 180];
    scrollTimersRef.current = delays.map((delay) =>
      setTimeout(() => {
        scrollToBottom(animated);
      }, delay),
    );
  }, [clearScheduledScrolls]);

  useEffect(() => {
    setLocalMessages([]);
    setIsLoading(true);
    didAutoScrollOnOpenRef.current = false;
    shouldAutoScrollRef.current = true;
    isUserScrollingRef.current = false;
    previousMessageCountRef.current = 0;
    clearScheduledScrolls();
  }, [clearScheduledScrolls, resolvedOtherUserId]);

  useEffect(() => {
    if (!isFocused || !isAppActive || !isAuthLoaded || !isSignedIn || !viewerUserId) {
      return;
    }

    requestBackendRefresh();
  }, [isAppActive, isAuthLoaded, isFocused, isSignedIn, viewerUserId]);

  useEffect(() => {
    if (
      !isFocused ||
      !isAppActive ||
      !isAuthLoaded ||
      !isSignedIn ||
      !viewerUserId ||
      !resolvedOtherUserId
    ) {
      return;
    }
    return subscribeConversation(resolvedOtherUserId, {
      limit: 220,
      windowMs: 7 * 24 * 60 * 60 * 1000,
    });
  }, [
    isAppActive,
    isAuthLoaded,
    isFocused,
    isSignedIn,
    resolvedOtherUserId,
    viewerUserId,
  ]);

  useEffect(() => {
    if (isLoading || filteredMessages.length === 0 || didAutoScrollOnOpenRef.current) {
      return;
    }
    scrollToBottomWithRetries(false);
    didAutoScrollOnOpenRef.current = true;
  }, [filteredMessages.length, isLoading, scrollToBottomWithRetries]);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    if (filteredMessages.length > previousCount && shouldAutoScrollRef.current) {
      scrollToBottomWithRetries(true);
    }
    previousMessageCountRef.current = filteredMessages.length;
  }, [filteredMessages.length, scrollToBottomWithRetries]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardShowSubscription = Keyboard.addListener(showEvent, (event) => {
      shouldAutoScrollRef.current = true;
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
      scrollToBottomWithRetries(true);
    });

    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const keyboardHideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      if (shouldAutoScrollRef.current) {
        scrollToBottomWithRetries(false);
      }
    });

    return () => {
      keyboardShowSubscription.remove();
      keyboardHideSubscription.remove();
      clearScheduledScrolls();
    };
  }, [clearScheduledScrolls, scrollToBottomWithRetries]);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (isUserScrollingRef.current) {
      shouldAutoScrollRef.current = distanceToBottom < 120;
    }
  }, []);

  const jumpToMessage = useCallback((id: string) => {
    const index = messages.findIndex((m) => m.id === id);
    if (index < 0) return;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 900);
  }, [messages]);

  const closeMenu = useCallback(() => {
    setMenuVisible(false);
    setMenuAnchor(null);
    setSelectedMessage(null);
  }, []);

  const openMenuFor = useCallback((msg: ChatMessage, anchor: AnchorRect) => {
    hapticTap();
    setSelectedMessage(msg);
    setMenuAnchor(anchor);
    setMenuVisible(true);
  }, []);

  const handleAction = useCallback((id: ActionId) => {
    if (!selectedMessage) return;
    const msg = selectedMessage;
    if (id === 'reply') { hapticTap(); setReplyTo(msg); closeMenu(); return; }
    if (id === 'edit') { hapticTap(); setReplyTo(null); setEditing(msg); setText(msg.text); closeMenu(); return; }
    if (id === 'delete') { hapticWarn(); setLocalMessages(prev => prev.filter(m => m.id !== msg.id)); closeMenu(); return; }
    if (id === 'copy') { hapticTap(); Clipboard.setStringAsync(msg.text); closeMenu(); }
  }, [closeMenu, selectedMessage]);

  const handleReaction = useCallback((emoji: string) => {
    if (!selectedMessage) return;
    hapticTap();
    setLocalMessages(prev => prev.map(msg => {
      if (msg.id !== selectedMessage.id) return msg;
      const currentReactions = msg.reactions || [];
      const existingIndex = currentReactions.findIndex(r => r.emoji === emoji);
      let newReactions;
      if (existingIndex >= 0) {
        const existing = currentReactions[existingIndex];
        if (existing.isMine) {
           if (existing.count === 1) newReactions = currentReactions.filter(r => r.emoji !== emoji);
           else { newReactions = [...currentReactions]; newReactions[existingIndex] = { ...existing, count: existing.count - 1, isMine: false }; }
        } else {
           newReactions = [...currentReactions];
           newReactions[existingIndex] = { ...existing, count: existing.count + 1, isMine: true };
        }
      } else newReactions = [...currentReactions, { emoji, count: 1, isMine: true }];
      return { ...msg, reactions: newReactions };
    }));
    closeMenu();
  }, [closeMenu, selectedMessage]);

  const sendMessage = (
    content: string,
    media?: ChatMessage['media'],
    options?: { type?: ChatMessage['type']; amount?: number },
  ) => {
    if (editing && !media && !options?.type) {
      setLocalMessages(prev => prev.map(m => m.id === editing.id ? { ...m, text: content, edited: true } : m));
      setEditing(null);
      setText('');
      return;
    }
    const newMsg: ChatMessage = {
      id: createClientMessageId(),
      user: 'You',
      senderId: 'me',
      text: content,
      createdAt: Date.now(),
      replyTo: replyTo ? { id: replyTo.id, user: replyTo.user, text: replyTo.text } : null,
      type: options?.type ?? 'user',
      status: 'sending',
      media,
      amount: options?.amount,
    };
    setLocalMessages(prev => [...prev, newMsg]);

    if (resolvedOtherUserId) {
      void messagesRepo
        .sendThreadMessage({
          userId: resolvedOtherUserId,
          clientMessageId: newMsg.id,
          message: {
            id: newMsg.id,
            user: newMsg.user,
            senderId: newMsg.senderId,
            text: newMsg.text,
            createdAt: newMsg.createdAt,
            edited: newMsg.edited,
            type: newMsg.type,
            amount: newMsg.amount,
            audioUrl: newMsg.audioUrl,
            duration: newMsg.duration,
            media: newMsg.media,
            replyTo: newMsg.replyTo,
            reactions: newMsg.reactions,
          },
        })
        .then(() => {
          const deliveredAt = Date.now();
          setLocalMessages((prev) =>
            prev.map((message) =>
              message.id === newMsg.id ? { ...message, status: 'sent', deliveredAt } : message,
            ),
          );
        })
        .catch((error) => {
          setLocalMessages((prev) =>
            prev.map((message) =>
              message.id === newMsg.id ? { ...message, status: 'failed' } : message,
            ),
          );
          if (newMsg.type === 'cash' && typeof newMsg.amount === 'number' && newMsg.amount > 0) {
            addCash(newMsg.amount);
            toast.error('Cash transfer failed. Amount returned to wallet.');
          } else {
            toast.error('Message failed to send. Check connection and try again.');
          }
          if (__DEV__) {
            console.warn('[chat] Failed to send thread message', error);
          }
        })
        .finally(() => {
          requestBackendRefresh();
        });
    } else {
      setLocalMessages((prev) =>
        prev.map((message) => (message.id === newMsg.id ? { ...message, status: 'failed' } : message)),
      );
      if (newMsg.type === 'cash' && typeof newMsg.amount === 'number' && newMsg.amount > 0) {
        addCash(newMsg.amount);
        toast.error('Cash transfer failed. Amount returned to wallet.');
      } else {
        toast.error('Message failed to send. No conversation target was found.');
      }
    }

    setReplyTo(null);
    setText('');
    setShowMentions(false);
    setTimeout(() => scrollToBottom(true), 100);
  };

  const handleSend = () => {
    setComposerMenuVisible(false);
    const v = text.trim();
    if (!v) return;
    hapticConfirm();
    sendMessage(v);
  };

  const closeComposerMenu = () => {
    setComposerMenuVisible(false);
  };

  const handleComposerMenuToggle = () => {
    hapticTap();
    setComposerMenuVisible((prev) => {
      const next = !prev;
      if (next) {
        Keyboard.dismiss();
      }
      return next;
    });
  };

  const handlePickAndSendImage = async () => {
    closeComposerMenu();
    hapticTap();

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.warning('Allow photo access to upload an image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
      });

      if (result.canceled || result.assets.length === 0) return;

      const asset = result.assets[0];
      const aspectRatio =
        typeof asset.width === 'number' && typeof asset.height === 'number' && asset.height > 0
          ? asset.width / asset.height
          : undefined;

      sendMessage('', {
        type: 'image',
        url: asset.uri,
        aspectRatio,
      });
      hapticConfirm();
    } catch (error) {
      toast.error('Could not pick an image right now.');
      if (__DEV__) {
        console.warn('[chat] Failed to pick image', error);
      }
    }
  };

  const closeCashSheet = () => {
    setCashSheetVisible(false);
    setCashAmountInput('');
    setCashNoteInput('');
    Keyboard.dismiss();
  };

  const openCashSheet = () => {
    closeComposerMenu();
    hapticTap();
    setCashSheetVisible(true);
  };

  const handleSendCash = () => {
    const amount = Number.parseInt(cashAmountInput, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.warning('Enter a valid cash amount.');
      return;
    }
    if (!spendCash(amount)) {
      hapticWarn();
      toast.error('Not enough cash balance.');
      return;
    }

    const note = cashNoteInput.trim();
    sendMessage(note.length > 0 ? note : `Sent $${amount} cash`, undefined, {
      type: 'cash',
      amount,
    });
    hapticConfirm();
    closeCashSheet();
  };

  const handleCashAmountSliderChange = (value: number) => {
    const nextAmount = Math.max(0, Math.floor(value));
    setCashAmountInput(nextAmount > 0 ? `${nextAmount}` : '');
  };

  const handleChange = (val: string) => {
    setText(val);
    const atIndex = val.lastIndexOf('@');
    if (atIndex >= 0) {
      const query = val.slice(atIndex + 1).toLowerCase();
      const filtered = socialUsers
        .filter((user) => user.username.toLowerCase().startsWith(query))
        .slice(0, 3)
        .map((user) => ({ id: user.id, name: user.username }));
      setMentions(filtered);
      setShowMentions(filtered.length > 0);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (name: string) => {
    const atIndex = text.lastIndexOf('@');
    if (atIndex >= 0) {
      const prefix = text.slice(0, atIndex + 1);
      setText(`${prefix}${name} `);
      setShowMentions(false);
    }
  };

  const openProfileById = useCallback(
    (targetUserId: string, fallbackName?: string) => {
      const normalizedUserId = targetUserId.trim();
      if (!normalizedUserId || normalizedUserId === 'me') return;

      const normalizedLookup = normalizedUserId.toLowerCase();
      const profileUser = socialUsers.find(
        (user) =>
          user.id === normalizedUserId ||
          user.username.toLowerCase() === normalizedLookup,
      );
      if (profileUser) {
        showProfile(toLiveUser(profileUser));
        return;
      }

      const displayName = fallbackName?.trim() || normalizedUserId;
      showProfile({
        id: normalizedUserId,
        name: displayName,
        username: displayName.toLowerCase().replace(/\s+/g, ''),
        age: 0,
        country: '',
        bio: '',
        avatarUrl: '',
        verified: false,
      });
    },
    [showProfile, socialUsers],
  );

  const renderItem = useCallback(({ item }: { item: ChatMessage }) => {
    if (item.type === 'system') return <View style={styles.systemMessageRow}><AppText variant="small" secondary style={styles.systemMessageText}>{item.text}</AppText></View>;
    return (
      <UserMessageRow
        item={item}
        selected={menuVisible && selectedMessage?.id === item.id}
        menuVisible={menuVisible}
        isHighlighted={item.id === highlightId}
        onOpenMenu={openMenuFor}
        onJumpToReply={jumpToMessage}
        onAvatarPress={(message) => {
          const targetUserId =
            message.senderId !== 'me'
              ? message.senderId
              : resolvedOtherUserId;
          if (!targetUserId) return;
          openProfileById(targetUserId, message.user);
        }}
      />
    );
  }, [highlightId, jumpToMessage, menuVisible, openMenuFor, openProfileById, resolvedOtherUserId, selectedMessage?.id]);

  const otherUser: SocialUser = useMemo(() => {
    if (resolvedRouteUser) return resolvedRouteUser;

    return {
      id: resolvedOtherUserId || 'unknown-user',
      username: routeUserToken || 'User',
      avatarUrl: '',
      isOnline: false,
      isLive: false,
      statusText: '',
    };
  }, [resolvedOtherUserId, resolvedRouteUser, routeUserToken]);
  const otherUserPresence = useMemo(() => resolveSocialPresence(otherUser), [otherUser]);

  const parsedCashAmount = Number.parseInt(cashAmountInput, 10);
  const hasValidCashAmount = Number.isFinite(parsedCashAmount) && parsedCashAmount > 0;
  const canAffordCashAmount = hasValidCashAmount && walletCash >= parsedCashAmount;
  const canSubmitCash = hasValidCashAmount && canAffordCashAmount;
  const maxCashAmount = Math.max(0, Math.floor(walletCash));
  const sliderMaxValue = Math.max(1, maxCashAmount);
  const sliderValue = hasValidCashAmount
    ? Math.min(parsedCashAmount, sliderMaxValue)
    : 0;
  const attachmentMenuBottom = Math.max(insets.bottom + 62, composerH + spacing.sm) + keyboardHeight;
  const walletCashLabel = Number.isFinite(walletCash)
    ? Math.max(0, Math.floor(walletCash)).toLocaleString()
    : '0';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.headerInfo}
            onPress={() => openProfileById(otherUser.id, otherUser.username)}
            hitSlop={10}
          >
            {hasImageUri(otherUser.avatarUrl) ? (
              <Image source={{ uri: otherUser.avatarUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatar, styles.headerAvatarFallback]} />
            )}
            <View>
              <AppText style={styles.headerName}>{otherUser.username}</AppText>
              <View style={styles.onlineBadge}>
                <View
                  style={[
                    styles.onlineDot,
                    otherUserPresence.status === 'busy' && styles.busyDot,
                    !otherUserPresence.isOnline && styles.offlineDot,
                  ]}
                />
                <AppText style={styles.onlineText}>
                  {otherUserPresence.label}
                </AppText>
              </View>
            </View>
          </Pressable>
          <Pressable style={styles.headerIconButton} onPress={() => setShowSearch(!showSearch)}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchBarContainer}>
          <View style={styles.searchInner}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInputField}
              placeholder="Search..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && <Pressable onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable>}
          </View>
          <View style={styles.filterTabs}>
            {(['all', 'media', 'links', 'mentions'] as const).map((filter) => (
              <Pressable key={filter} style={[styles.filterTab, activeFilter === filter && styles.filterTabActive]} onPress={() => setActiveFilter(filter)}>
                <AppText style={[styles.filterTabText, activeFilter === filter && styles.filterTabTextActive]}>{filter.charAt(0).toUpperCase() + filter.slice(1)}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <View style={styles.messagesWrap}>
          <FlatList
            ref={listRef}
            data={filteredMessages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingTop: spacing.sm,
              paddingBottom: Math.max(20, composerH + spacing.md),
            }}
            keyboardDismissMode="on-drag"
            onContentSizeChange={() => {
              if (shouldAutoScrollRef.current) {
                scrollToBottomWithRetries(false);
              }
            }}
            onScrollBeginDrag={() => {
              isUserScrollingRef.current = true;
            }}
            onScrollEndDrag={() => {
              isUserScrollingRef.current = false;
            }}
            onMomentumScrollEnd={() => {
              isUserScrollingRef.current = false;
            }}
            onScroll={handleListScroll}
            scrollEventThrottle={16}
          />
        </View>

        {showMentions && (
          <View style={[styles.mentionBox, { bottom: Math.max(86, composerH + 14) }]}>
            {mentions.map((u) => (
              <Pressable key={u.id} onPress={() => insertMention(u.name)} style={styles.mentionItem}>
                <AppText variant="small">{u.name}</AppText>
              </Pressable>
            ))}
          </View>
        )}

        <View style={[styles.composerContainer, { paddingBottom: insets.bottom + 2 }]} onLayout={(e) => setComposerH(Math.round(e.nativeEvent.layout.height))}>
          {replyTo && (
            <View style={styles.replyBar}>
              <Pressable onPress={() => jumpToMessage(replyTo.id)} style={styles.replyBarContent}>
                <AppText style={styles.replyBarText}>Replying to <AppText style={styles.replyBarName}>{replyTo.user}</AppText></AppText>
                <AppText numberOfLines={1} style={styles.replyBarSnippet}>{replyTo.text}</AppText>
              </Pressable>
              <Pressable onPress={() => setReplyTo(null)} style={styles.replyBarClose}><Ionicons name="close" size={18} color={colors.textMuted} /></Pressable>
            </View>
          )}
          {editing && (
            <View style={styles.composerBar}>
              <Pressable onPress={() => { setEditing(null); setText(''); }} style={styles.composerX}><Ionicons name="close" size={18} color={colors.textSecondary} /></Pressable>
              <AppText style={styles.composerTitle}>Editing Message</AppText>
            </View>
          )}
          <View style={styles.chatInputRow}>
            <Pressable style={styles.chatIconButton} onPress={handleComposerMenuToggle}>
              <Ionicons
                name={composerMenuVisible ? 'close' : 'add'}
                size={20}
                color={composerMenuVisible ? colors.textPrimary : colors.textSecondary}
              />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={handleChange}
              onFocus={() => {
                shouldAutoScrollRef.current = true;
                scrollToBottomWithRetries(true);
              }}
              placeholder={`Message @${otherUser.username}`}
              placeholderTextColor={colors.textMuted}
              style={styles.chatInput}
              multiline
            />
            {text.length === 0 ? (
              <Pressable
                style={styles.chatIconButton}
                onPress={() => {
                  closeComposerMenu();
                  hapticTap();
                }}
              >
                <Ionicons name="mic" size={20} color={colors.textSecondary} />
              </Pressable>
            ) : (
              <Pressable style={styles.chatSend} onPress={handleSend}>
                <Ionicons name="arrow-up" size={20} color={colors.textPrimary} />
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {composerMenuVisible ? (
        <>
          <Pressable style={styles.attachmentMenuOverlay} onPress={closeComposerMenu} />
          <View style={[styles.attachmentMenu, { bottom: attachmentMenuBottom }]}> 
            <Pressable
              style={({ pressed }) => [styles.attachmentMenuItem, pressed && styles.attachmentMenuItemPressed]}
              onPress={handlePickAndSendImage}
            >
              <View style={[styles.attachmentMenuIconWrap, styles.attachmentMenuIconImage]}>
                <Ionicons name="image-outline" size={18} color={colors.accentPrimary} />
              </View>
              <View style={styles.attachmentMenuTextWrap}>
                <AppText style={styles.attachmentMenuTitle}>Upload Image</AppText>
                <AppText style={styles.attachmentMenuSubtitle}>Choose from your gallery</AppText>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.attachmentMenuItem, pressed && styles.attachmentMenuItemPressed]}
              onPress={openCashSheet}
            >
              <View style={[styles.attachmentMenuIconWrap, styles.attachmentMenuIconCash]}>
                <Ionicons name="cash-outline" size={18} color={colors.accentCash} />
              </View>
              <View style={styles.attachmentMenuTextWrap}>
                <AppText style={styles.attachmentMenuTitle}>Cash</AppText>
                <AppText style={styles.attachmentMenuSubtitle}>Available: ${walletCashLabel}</AppText>
              </View>
            </Pressable>
          </View>
        </>
      ) : null}

      <Modal
        visible={cashSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCashSheet}
      >
        <View style={styles.cashSheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
          <View style={[styles.cashSheet, { paddingBottom: insets.bottom + spacing.md, marginBottom: keyboardHeight }]}> 
            <View style={styles.cashSheetHandle} />
              <View style={styles.cashSheetHeaderRow}>
                <View style={styles.cashSheetHeaderTextWrap}>
                  <AppText style={styles.cashSheetTitle}>Send Cash</AppText>
                  <AppText style={styles.cashSheetSubtitle}>Balance: ${walletCashLabel}</AppText>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.cashSheetCloseButton, pressed && styles.cashSheetCloseButtonPressed]}
                  onPress={closeCashSheet}
                >
                  <Ionicons name="close" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>

            <View style={styles.cashAmountInputRow}>
              <AppText style={styles.cashAmountPrefix}>$</AppText>
              <TextInput
                value={cashAmountInput}
                onChangeText={(value) => setCashAmountInput(value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                style={styles.cashAmountInput}
                keyboardType="number-pad"
                maxLength={7}
              />
              <Pressable style={styles.cashAmountDoneButton} onPress={Keyboard.dismiss}>
                <AppText style={styles.cashAmountDoneText}>Done</AppText>
              </Pressable>
            </View>

            <View style={styles.cashSliderWrap}>
              <Slider
                value={sliderValue}
                minimumValue={0}
                maximumValue={sliderMaxValue}
                step={1}
                minimumTrackTintColor={colors.accentCash}
                maximumTrackTintColor={colors.borderSubtle}
                thumbTintColor={colors.accentCash}
                onValueChange={handleCashAmountSliderChange}
                disabled={maxCashAmount <= 0}
              />
            </View>
            <AppText style={styles.cashSliderHint}>
              {maxCashAmount > 0
                ? 'Drag to choose amount'
                : 'No cash available right now'}
            </AppText>

            <TextInput
              value={cashNoteInput}
              onChangeText={setCashNoteInput}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.textMuted}
              style={styles.cashNoteInput}
              maxLength={80}
            />

            {hasValidCashAmount && !canAffordCashAmount ? (
              <AppText style={styles.cashSheetError}>You do not have enough cash.</AppText>
            ) : null}

            <View style={styles.cashSheetActions}>
              <Pressable
                style={({ pressed }) => [styles.cashSheetCancelButton, pressed && styles.cashSheetCancelButtonPressed]}
                onPress={closeCashSheet}
              >
                <AppText style={styles.cashSheetCancelText}>Cancel</AppText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.cashSheetSendButton,
                  !canSubmitCash && styles.cashSheetSendButtonDisabled,
                  pressed && canSubmitCash && styles.cashSheetSendButtonPressed,
                ]}
                disabled={!canSubmitCash}
                onPress={handleSendCash}
              >
                <AppText style={styles.cashSheetSendText}>Send Cash</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <MessageActionMenu visible={menuVisible} anchor={menuAnchor} isMine={selectedMessage?.senderId === 'me'} onClose={closeMenu} onAction={handleAction} onReaction={handleReaction} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceAlt },
  header: { backgroundColor: colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backButton: { padding: 4, marginRight: 8 },
  headerInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  headerAvatarFallback: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  headerName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  headerIconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)' },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentSuccess },
  busyDot: { backgroundColor: colors.accentDanger },
  offlineDot: { backgroundColor: colors.textMuted },
  onlineText: { fontSize: 12, color: colors.textSecondary },
  searchBarContainer: { backgroundColor: colors.surfaceAlt, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  searchInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBackground, borderRadius: 12, paddingHorizontal: 12, height: 40, gap: 8 },
  searchInputField: { flex: 1, color: colors.textPrimary, fontSize: 15 },
  filterTabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  filterTabActive: { backgroundColor: colors.accentPrimarySoft },
  filterTabText: { fontSize: 13, color: colors.textSecondary },
  filterTabTextActive: { color: colors.textPrimary, fontWeight: '600' },
  messagesWrap: { flex: 1, paddingHorizontal: 16 },
  historyLoaderRow: { paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  row: { marginVertical: 2 },
  rowInner: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  avatarPressable: { borderRadius: 17 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)' },
  content: { flex: 1 },
  msgHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  name: { fontWeight: '700', fontSize: 13, color: colors.textPrimary },
  msgMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  timestamp: { fontSize: 10, color: colors.textMuted },
  receiptMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  receiptText: { fontSize: 10, color: colors.textMuted },
  receiptTextRead: { color: colors.accentPrimary },
  receiptTextFailed: { color: colors.accentDanger },
  bubble: { padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  msgTextContainer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  msgText: { color: colors.textPrimary, fontSize: 15, lineHeight: 20 },
  editedLabel: { fontSize: 10, color: colors.textMuted },
  reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 3, gap: 4 },
  reactionPillActive: { backgroundColor: 'rgba(190, 56, 243, 0.2)', borderColor: 'rgba(190, 56, 243, 0.5)', borderWidth: 1 },
  reactionEmojiText: { fontSize: 12 },
  reactionCount: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  reactionCountActive: { color: colors.textPrimary },
  bubbleGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.06)' },
  replyEmbed: { flexDirection: 'row', gap: 10, marginBottom: 8, padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)' },
  replyLine: { width: 3, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  replyEmbedContent: { flex: 1 },
  replyToName: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  replyPreview: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  composerContainer: { paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.lg },
  replyBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', padding: 8, borderRadius: radius.md, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: colors.accentPrimary },
  replyBarContent: { flex: 1 },
  replyBarText: { fontSize: 12, color: colors.textSecondary },
  replyBarName: { fontWeight: '700', color: colors.textPrimary },
  replyBarSnippet: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  replyBarClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  composerBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', padding: 8, borderRadius: radius.md, marginBottom: 8, gap: 8 },
  composerX: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  composerTitle: { color: colors.textMuted, flex: 1 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachmentMenuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    zIndex: 30,
  },
  attachmentMenu: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: 8,
    zIndex: 31,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  attachmentMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginHorizontal: 6,
    gap: 10,
  },
  attachmentMenuItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  attachmentMenuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  attachmentMenuIconImage: {
    backgroundColor: colors.accentPrimarySubtle,
    borderColor: 'rgba(123,97,255,0.35)',
  },
  attachmentMenuIconCash: {
    backgroundColor: colors.accentCashSubtle,
    borderColor: 'rgba(25,250,152,0.35)',
  },
  attachmentMenuTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  attachmentMenuTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  attachmentMenuSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  chatIconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface },
  chatInput: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, lineHeight: 20, minHeight: 44, maxHeight: 120, color: colors.textPrimary, borderWidth: 1, borderColor: colors.borderSubtle },
  chatSend: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentPrimarySoft, borderWidth: 1, borderColor: colors.borderSubtle },
  cashSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  cashSheet: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderBottomWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  cashSheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
    opacity: 0.6,
    marginBottom: spacing.md,
  },
  cashSheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cashSheetHeaderTextWrap: {
    flex: 1,
  },
  cashSheetCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  cashSheetCloseButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cashSheetTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  cashSheetSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  cashAmountInputRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 12,
  },
  cashAmountPrefix: {
    color: colors.accentCash,
    fontSize: 22,
    fontWeight: '700',
    marginRight: 6,
  },
  cashAmountInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    paddingVertical: 12,
  },
  cashAmountDoneButton: {
    height: 30,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentPrimarySoft,
  },
  cashAmountDoneText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  cashSliderWrap: {
    marginTop: 8,
    paddingHorizontal: 2,
  },
  cashSliderHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  cashNoteInput: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  cashSheetError: {
    marginTop: 8,
    color: colors.accentDanger,
    fontSize: 12,
    fontWeight: '600',
  },
  cashSheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.md,
  },
  cashSheetCancelButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashSheetCancelButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cashSheetCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  cashSheetSendButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(25,250,152,0.35)',
    backgroundColor: colors.accentCash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashSheetSendButtonPressed: {
    opacity: 0.88,
  },
  cashSheetSendButtonDisabled: {
    opacity: 0.45,
  },
  cashSheetSendText: {
    color: colors.accentCashText,
    fontSize: 14,
    fontWeight: '800',
  },
  mentionBox: { position: 'absolute', left: 16, right: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSubtle, padding: 8, zIndex: 40 },
  mentionItem: { paddingVertical: 4 },
  systemMessageRow: { alignItems: 'center', marginVertical: 8 },
  systemMessageText: { color: colors.textMuted, fontSize: 12 },
  
  // Media Styles
  mediaContainer: { borderRadius: 12, overflow: 'hidden', marginTop: 2, marginBottom: 4 },
  mediaImage: { width: '100%', backgroundColor: 'rgba(0,0,0,0.2)' },
  mediaImageFallback: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  audioContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 4, minWidth: 160 },
  audioPlayBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center' },
  audioWaveform: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 20 },
  audioBar: { width: 2, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 1 },
  audioDuration: { fontSize: 11, color: colors.textSecondary },
  
  // Custom DM Types
  cashBubble: { backgroundColor: 'rgba(46, 204, 113, 0.1)', borderColor: 'rgba(46, 204, 113, 0.3)' },
  cashHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  cashAmount: { fontWeight: '700', color: '#2ECC71' },
  cashText: { color: '#F2F3F5', fontStyle: 'italic' },
  bubbleContainer: { alignSelf: 'flex-start', maxWidth: '100%' },
  
  voiceBubble: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 16, gap: 12, minWidth: 180 },
  voiceBubbleMine: { backgroundColor: colors.accentPrimary },
  voiceBubbleThem: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle },
  voiceWaveform: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 30 },
  voiceBar: { width: 3, borderRadius: 1.5 },
  voiceBarMine: { backgroundColor: 'rgba(255, 255, 255, 0.6)' },
  voiceBarThem: { backgroundColor: colors.accentPrimary, opacity: 0.5 },
  voiceDuration: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  
  musicBubble: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 16, gap: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  musicBubbleMine: { },
  musicBubbleTheirs: { },
  musicArtwork: { width: 40, height: 40, borderRadius: 4 },
  musicInfo: { flex: 1 },
  musicTitle: { fontSize: 14, fontWeight: '600' },
  musicSubtitle: { fontSize: 12 },
  musicMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  musicMetaText: { fontSize: 10 },
  musicPlayButton: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  musicPlayButtonMine: { },
  musicPlayButtonTheirs: { },
  
  newMsgPill: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', zIndex: 30 },
  newMsgText: { fontSize: 13, color: colors.textPrimary },
});
