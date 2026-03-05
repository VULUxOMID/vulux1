import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { AppText, AppTextInput } from '../../../components';
import { colors, radius, spacing, typography } from '../../../theme';
import { MessageActionMenu } from '../../chat/MessageActionMenu';
import { hapticConfirm, hapticTap, hapticWarn } from '../../../utils/haptics';
import { normalizeImageUri } from '../../../utils/imageSource';

type ActionId = 'reply' | 'copy' | 'edit' | 'delete';

type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HOLD_MENU_DELAY_MS = 350;
const NEAR_BOTTOM_THRESHOLD = 80;
const HANDLE_HITBOX_H = 56;

function createClientMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ChatMessage = {
  id: string;
  user: string;
  text: string;
  createdAt: number;
  senderId?: string;
  edited?: boolean;
  replyTo?: null | { id: string; user: string; text: string; senderId?: string };
  type?: 'user' | 'system';
  status?: 'sending' | 'sent' | 'failed';
  reactions?: { emoji: string; count: number; isMine: boolean }[];
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

export type GlobalChatSheetProps = {
  visible: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onSendMessage: (message: ChatMessage) => void;
  onEditMessage?: (messageId: string, text: string) => Promise<void> | void;
  onDeleteMessage?: (messageId: string) => Promise<void> | void;
  mentionUsers: MentionUser[];
  focusMessageId?: string | null;
  autoReplyToMessageId?: string | null;
  onFocusMessageHandled?: () => void;
  currentUserDisplayName?: string;
  currentUserId?: string | null;
};

export function GlobalChatSheet({
  visible,
  onClose,
  messages,
  setMessages,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  mentionUsers,
  focusMessageId,
  autoReplyToMessageId,
  onFocusMessageHandled,
  currentUserDisplayName = 'you',
  currentUserId = null,
}: GlobalChatSheetProps) {
  const insets = useSafeAreaInsets();
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;
  const grabActive = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const [showMentions, setShowMentions] = useState(false);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchFocusAnim = useRef(new Animated.Value(0)).current;
  const clearButtonAnim = useRef(new Animated.Value(0)).current;
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'media' | 'links' | 'mentions'>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const filteredMessages = useMemo(() => {
    let result = messages;

    // Apply Type Filter
    if (activeFilter === 'media') {
      result = result.filter(m => !!m.media);
    } else if (activeFilter === 'links') {
      result = result.filter(m => m.text.includes('http'));
    } else if (activeFilter === 'mentions') {
      result = result.filter(m => m.text.includes('@'));
    }

    if (!searchQuery.trim()) return result;

    const q = searchQuery.toLowerCase();
    return result.filter(
      (m) => m.text.toLowerCase().includes(q) || m.user.toLowerCase().includes(q)
    );
  }, [messages, searchQuery, activeFilter]);

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);

  // Auto-scroll state
  const [isNearBottom, setIsNearBottom] = useState(true);
  const isNearBottomRef = useRef(true); // Ref version to avoid stale closures
  const [hasNewWhileUp, setHasNewWhileUp] = useState(false);
  const prevCountRef = useRef(messages.length);

  // Highlight state for jump-to-message
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Track keyboard visibility for composer padding
  const [kbOpen, setKbOpen] = useState(false);
  const [composerH, setComposerH] = useState(0);

  const dragStartYRef = useRef(0);
  const lastRawYRef = useRef(0);
  const lastSnapRef = useRef<'collapsed' | 'mid' | 'expanded'>('collapsed');

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => setKbOpen(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKbOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Sheet positioning:
  // - collapsed = current design (under activity bubbles)
  // - expanded = closer to top (more messages visible while typing)
  const COLLAPSED_TOP = Math.max(insets.top + 140, Math.round(SCREEN_H * 0.2));
  const EXPANDED_TOP = Math.max(insets.top + 18, 72);
  const EXPAND_DELTA = Math.max(0, COLLAPSED_TOP - EXPANDED_TOP);
  const SNAP_EXPANDED = -EXPAND_DELTA;
  const SNAP_MID = -Math.round(EXPAND_DELTA * 0.52);
  const SNAP_COLLAPSED = 0;
  const DISMISS_Y = SCREEN_H;
  const SHEET_HEIGHT = SCREEN_H - EXPANDED_TOP;
  const DISMISS_DIST = Math.round(SHEET_HEIGHT * 0.22); // 18–25% feel

  const rubberBand = (d: number, c = 140) => (c * d) / (d + c);
  const applyResistance = (raw: number) => {
    if (raw < SNAP_EXPANDED) {
      const over = SNAP_EXPANDED - raw;
      return SNAP_EXPANDED - rubberBand(over, 160);
    }
    if (raw > SNAP_COLLAPSED) {
      const over = raw - SNAP_COLLAPSED;
      return SNAP_COLLAPSED + rubberBand(over, 160);
    }
    return raw;
  };

  const snapTo = useCallback(
    (which: 'collapsed' | 'mid' | 'expanded', animated = true) => {
      const toValue =
        which === 'expanded' ? SNAP_EXPANDED : which === 'mid' ? SNAP_MID : SNAP_COLLAPSED;

      lastSnapRef.current = which;
      if (!animated) {
        sheetY.setValue(toValue);
        return;
      }

      sheetY.stopAnimation();
      Animated.spring(sheetY, {
        toValue,
        useNativeDriver: false,
        damping: 22,
        stiffness: 260,
        mass: 0.9,
      }).start();
    },
    [SNAP_COLLAPSED, SNAP_EXPANDED, SNAP_MID, sheetY]
  );

  const animateDismiss = useCallback(() => {
    sheetY.stopAnimation((current) => {
      // Avoid restarting the same timing if we're already down.
      if (current >= DISMISS_Y) {
        sheetY.setValue(DISMISS_Y);
        onClose?.();
        return;
      }

      Animated.timing(sheetY, { toValue: DISMISS_Y, duration: 220, useNativeDriver: false }).start(() => {
        sheetY.setValue(DISMISS_Y);
        onClose?.();
      });
    });
  }, [DISMISS_Y, onClose, sheetY]);

  const closeMenu = useCallback(() => {
    setMenuVisible(false);
    setMenuAnchor(null);
    setSelectedMessage(null);
  }, []);

  // PanResponder for handle-only drag (no conflict with message scrolling)
  // Use refs to access menu state and closeMenu in PanResponder handlers
  const menuVisibleRef = useRef(false);
  const closeMenuRef = useRef(closeMenu);
  useEffect(() => {
    menuVisibleRef.current = menuVisible;
    closeMenuRef.current = closeMenu;
  }, [menuVisible, closeMenu]);

  const panResponder = useRef(
    PanResponder.create({
      // Claim responder on start so we definitely receive moves/releases.
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 2 && Math.abs(g.dy) > Math.abs(g.dx),
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 2 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        // Close menu when starting to drag the sheet
        if (menuVisibleRef.current) closeMenuRef.current();
        grabActive.stopAnimation();
        Animated.timing(grabActive, { toValue: 1, duration: 90, useNativeDriver: false }).start();
        sheetY.stopAnimation((v) => {
          dragStartYRef.current = v;
          lastRawYRef.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        const raw = dragStartYRef.current + g.dy;
        lastRawYRef.current = raw;
        sheetY.setValue(applyResistance(raw));
      },
      onPanResponderRelease: (_, g) => {
        grabActive.stopAnimation();
        Animated.timing(grabActive, { toValue: 0, duration: 120, useNativeDriver: false }).start();

        const raw = lastRawYRef.current;
        const shouldDismiss = raw > SNAP_COLLAPSED + DISMISS_DIST || g.vy > 1.35;
        if (shouldDismiss) {
          hapticTap();
          animateDismiss();
          return;
        }

        const candidates =
          EXPAND_DELTA > 0 ? [SNAP_EXPANDED, SNAP_MID, SNAP_COLLAPSED] : [SNAP_COLLAPSED];
        const clamped = Math.min(SNAP_COLLAPSED, Math.max(SNAP_EXPANDED, raw));
        let nearest = candidates[0]!;
        for (const c of candidates) if (Math.abs(c - clamped) < Math.abs(nearest - clamped)) nearest = c;

        const nextSnap: 'collapsed' | 'mid' | 'expanded' =
          nearest === SNAP_EXPANDED ? 'expanded' : nearest === SNAP_MID ? 'mid' : 'collapsed';

        if (nextSnap !== lastSnapRef.current) hapticTap();
        snapTo(nextSnap, true);
      },
      onPanResponderTerminate: () => {
        grabActive.stopAnimation();
        Animated.timing(grabActive, { toValue: 0, duration: 120, useNativeDriver: false }).start();
        snapTo(lastSnapRef.current, true);
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  // Helper to scroll to bottom
  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
    setHasNewWhileUp(false);
  }, []);

  // Track if user is near bottom
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
    const near = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
    setIsNearBottom(near);
    isNearBottomRef.current = near; // Keep ref in sync for callbacks
    if (near) setHasNewWhileUp(false);
  }, []);

  // Detect new messages - auto-scroll if near bottom, show pill if scrolled up
  useEffect(() => {
    const prev = prevCountRef.current;
    const next = messages.length;

    if (next > prev) {
      // Use ref to avoid stale closure issues
      if (isNearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom(true));
      } else {
        setHasNewWhileUp(true);
      }
    }

    prevCountRef.current = next;
  }, [messages.length, scrollToBottom]);

  // Jump to a message + flash highlight
  const jumpToMessage = useCallback(
    (id: string) => {
      const visibleIndex = filteredMessages.findIndex((m) => m.id === id);
      if (visibleIndex >= 0) {
        listRef.current?.scrollToIndex({ index: visibleIndex, animated: true, viewPosition: 0.5 });
        setHighlightId(id);
        setTimeout(() => setHighlightId(null), 2200);
        return;
      }

      const fullIndex = messages.findIndex((m) => m.id === id);
      if (fullIndex < 0) return;

      setShowSearch(false);
      setSearchQuery('');
      setActiveFilter('all');
      requestAnimationFrame(() => {
        setTimeout(() => {
          listRef.current?.scrollToIndex({ index: fullIndex, animated: true, viewPosition: 0.5 });
          setHighlightId(id);
          setTimeout(() => setHighlightId(null), 2200);
        }, 120);
      });
    },
    [filteredMessages, messages]
  );

  // Handle scrollToIndex failures (message not yet rendered)
  const onScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
      }, 250);
    },
    []
  );

  useEffect(() => {
    if (visible) {
      // open to collapsed by default
      sheetY.stopAnimation();
      sheetY.setValue(DISMISS_Y);
      lastSnapRef.current = 'collapsed';
      Animated.spring(sheetY, {
        toValue: SNAP_COLLAPSED,
        useNativeDriver: false,
        damping: 22,
        stiffness: 260,
        mass: 0.9,
      }).start();
      return;
    }

    // When parent hides, ensure we're fully down (no "stuck half open")
    sheetY.stopAnimation((current) => {
      if (current >= DISMISS_Y) {
        sheetY.setValue(DISMISS_Y);
        return;
      }
      Animated.timing(sheetY, { toValue: DISMISS_Y, duration: 180, useNativeDriver: false }).start();
    });
  }, [DISMISS_Y, SNAP_COLLAPSED, sheetY, visible]);

  useEffect(() => {
    const targetMessageId = focusMessageId ?? autoReplyToMessageId ?? null;
    if (!visible || !targetMessageId) {
      return;
    }

    setShowSearch(false);
    setSearchQuery('');
    setActiveFilter('all');

    const timer = setTimeout(() => {
      const replyMessage = autoReplyToMessageId
        ? messages.find((msg) => msg.id === autoReplyToMessageId)
        : null;
      jumpToMessage(targetMessageId);

      if (autoReplyToMessageId && replyMessage) {
        if (editing) {
          setEditing(null);
          setText('');
        }
        setReplyTo(replyMessage);
        snapTo('expanded', true);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 180);
      }

      onFocusMessageHandled?.();
    }, 320);

    return () => clearTimeout(timer);
  }, [
    autoReplyToMessageId,
    editing,
    focusMessageId,
    jumpToMessage,
    messages,
    onFocusMessageHandled,
    snapTo,
    visible,
  ]);

  // Backdrop gets darker as the sheet is more expanded
  const overlayOpacity = sheetY.interpolate({
    inputRange: [SNAP_EXPANDED, SNAP_COLLAPSED, DISMISS_Y],
    outputRange: [0.48, 0.18, 0],
    extrapolate: 'clamp',
  });

  const grabberScale = grabActive.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const grabberOpacity = grabActive.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0.95] });

  const closeAll = useCallback(() => {
    closeMenu();
    animateDismiss();
  }, [animateDismiss, closeMenu]);

  const openMenuFor = useCallback((msg: ChatMessage, anchor: AnchorRect) => {
    hapticTap();
    setSelectedMessage(msg);
    setMenuAnchor(anchor);
    setMenuVisible(true);
  }, []);

  const handleSend = () => {
    const v = text.trim();
    if (!v) return;

    hapticConfirm();
    sendMessage(v);
  };

  useEffect(() => {
    Animated.spring(searchAnim, {
      toValue: showSearch ? 1 : 0,
      tension: 40, // Lower tension for premium feel
      friction: 7, // Lower friction for subtle bounce
      useNativeDriver: false,
    }).start();
  }, [showSearch, searchAnim]);

  useEffect(() => {
    Animated.timing(searchFocusAnim, {
      toValue: isSearchFocused ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isSearchFocused, searchFocusAnim]);

  useEffect(() => {
    Animated.timing(clearButtonAnim, {
      toValue: searchQuery.length > 0 ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [searchQuery, clearButtonAnim]);

  const sendMessage = (content: string, media?: ChatMessage['media']) => {
    const normalizedContent = content.trim();
    const normalizedMediaUrl = media ? normalizeImageUri(media.url) : undefined;
    const normalizedMedia = media && normalizedMediaUrl ? { ...media, url: normalizedMediaUrl } : undefined;

    if (!normalizedContent && !normalizedMedia?.url) return;

    if (editing && !media) {
      const editingMessage = editing;
      const previousText = editingMessage.text;
      const previousEdited = Boolean(editingMessage.edited);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editingMessage.id ? { ...m, text: normalizedContent, edited: true } : m,
        ),
      );
      setEditing(null);
      setText('');
      void Promise.resolve(onEditMessage?.(editingMessage.id, normalizedContent)).catch((error) => {
        hapticWarn();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingMessage.id
              ? { ...m, text: previousText, edited: previousEdited }
              : m,
          ),
        );
        if (__DEV__) {
          console.warn('[global-chat] Failed to edit message', error);
        }
      });
      return;
    }

    const newMsg: ChatMessage = {
      id: createClientMessageId(),
      user: currentUserDisplayName,
      text: normalizedContent,
      createdAt: Date.now(),
      senderId: currentUserId ?? undefined,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            user: replyTo.user,
            text: replyTo.text,
            senderId: replyTo.senderId,
          }
        : null,
      type: 'user',
      status: 'sending',
      media: normalizedMedia,
    };
    onSendMessage(newMsg);

    setReplyTo(null);
    setText('');
    setShowMentions(false);
    // Use setTimeout to ensure message is rendered before scrolling
    setTimeout(() => {
      scrollToBottom(true);
    }, 100);
  };

  const handleChange = (val: string) => {
    setText(val);
    const atIndex = val.lastIndexOf('@');
    if (atIndex >= 0) {
      const query = val.slice(atIndex + 1).toLowerCase();
      const filtered = mentionUsers.filter((u) => u.name.toLowerCase().startsWith(query)).slice(0, 3);
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
      const next = `${prefix}${name} `;
      setText(next);
      setShowMentions(false);
    }
  };

  // Auto-scroll when input focuses
  const onFocusInput = useCallback(() => {
    // Close menu when input is focused
    closeMenu();
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    // While typing, expanded feels most natural and keeps messages visible.
    if (EXPAND_DELTA > 0) snapTo('expanded', true);
  }, [EXPAND_DELTA, snapTo, closeMenu]);

  const handleAction = useCallback(
    (id: ActionId) => {
      if (!selectedMessage) return;
      const msg = selectedMessage;

      if (id === 'reply') {
        hapticTap();
        if (editing) setText('');
        setEditing(null);
        setReplyTo(msg);
        closeMenu();
        return;
      }

      if (id === 'edit') {
        hapticTap();
        setReplyTo(null);
        setEditing(msg);
        setText(msg.text);
        closeMenu();
        return;
      }

      if (id === 'delete') {
        hapticWarn();
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        void Promise.resolve(onDeleteMessage?.(msg.id)).catch((error) => {
          hapticWarn();
          setMessages((prev) => {
            if (prev.some((current) => current.id === msg.id)) {
              return prev;
            }
            return [...prev, msg].sort((left, right) => left.createdAt - right.createdAt);
          });
          if (__DEV__) {
            console.warn('[global-chat] Failed to delete message', error);
          }
        });
        closeMenu();
        return;
      }

      if (id === 'copy') {
        hapticTap();
        Clipboard.setStringAsync(msg.text);
        closeMenu();
      }
    },
    [closeMenu, selectedMessage, setMessages, editing, onDeleteMessage]
  );

  const handleReaction = useCallback((emoji: string) => {
    if (!selectedMessage) return;
    hapticTap();

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== selectedMessage.id) return msg;

        const currentReactions = msg.reactions || [];
        const existingIndex = currentReactions.findIndex((r) => r.emoji === emoji);
        let newReactions;

        if (existingIndex >= 0) {
          // Toggle off if already reacted, or just add count? 
          // Assuming toggle behavior for "isMine"
          const existing = currentReactions[existingIndex];
          if (existing.isMine) {
            // Remove reaction
            if (existing.count === 1) {
              newReactions = currentReactions.filter(r => r.emoji !== emoji);
            } else {
              newReactions = [...currentReactions];
              newReactions[existingIndex] = { ...existing, count: existing.count - 1, isMine: false };
            }
          } else {
            // Add to count (simulated since we don't have other users really)
            newReactions = [...currentReactions];
            newReactions[existingIndex] = { ...existing, count: existing.count + 1, isMine: true };
          }
        } else {
          // Add new reaction
          newReactions = [...currentReactions, { emoji, count: 1, isMine: true }];
        }

        return { ...msg, reactions: newReactions };
      })
    );

    closeMenu();
  }, [closeMenu, selectedMessage, setMessages]);

  const isMine =
    (currentUserId && selectedMessage?.senderId === currentUserId) ||
    selectedMessage?.user === currentUserDisplayName ||
    selectedMessage?.user === 'you';

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      if (item.type === 'system') {
        return (
          <View style={styles.systemMessageRow}>
            <AppText variant="small" secondary style={styles.systemMessageText}>
              {item.text}
            </AppText>
          </View>
        );
      }

      const selected = menuVisible && selectedMessage?.id === item.id;
      const isHighlighted = item.id === highlightId;

      return (
        <UserMessageRow
          item={item}
          selected={selected}
          menuVisible={menuVisible}
          isHighlighted={isHighlighted}
          onOpenMenu={openMenuFor}
          onJumpToReply={jumpToMessage}
        />
      );
    },
    [menuVisible, openMenuFor, selectedMessage?.id, highlightId, jumpToMessage]
  );

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={[StyleSheet.absoluteFill, styles.pointerEventsBoxNone]}>
        {/* Backdrop BEHIND the sheet - tapping closes */}
        <Animated.View style={[styles.backdrop, { opacity: overlayOpacity }, styles.pointerEventsBoxNone]}>
          <Pressable
            style={[StyleSheet.absoluteFill, menuVisible ? styles.pointerEventsNone : styles.pointerEventsAuto]}
            onPress={closeAll}
          />
        </Animated.View>

        {/* Sheet ABOVE backdrop */}
        <View style={[StyleSheet.absoluteFill, styles.pointerEventsBoxNone]}>
          {/* Grabber handle just above the sheet (moves with sheetY) */}
          <Animated.View
            style={[
              styles.grabberContainer,
              styles.pointerEventsAuto,
              {
                position: 'absolute',
                top: COLLAPSED_TOP - 15, // Just barely above the sheet (~10-15px gap)
                left: 0,
                right: 0,
                marginTop: sheetY,
              },
            ]}
            {...panResponder.panHandlers}
            accessibilityRole="adjustable"
            accessibilityLabel="Chat sheet grabber"
            accessibilityHint="Swipe up or down to adjust chat sheet height"
          >
            <View style={styles.grabberWrap}>
              <Animated.View
                style={[
                  styles.grabber,
                  { transform: [{ scaleX: grabberScale }], opacity: grabberOpacity },
                ]}
              />
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.chatSheet,
              styles.pointerEventsAuto,
              {
                position: 'absolute',
                top: COLLAPSED_TOP,
                bottom: 0,
                left: 0,
                right: 0,
                marginTop: sheetY,
              },
            ]}
          >
            {/* Header with drag zone */}
            <View style={styles.topChrome}>
              <View style={styles.chatHeaderTitleOnly}>
                {/* Normal header - title + search button */}
                {!showSearch ? (
                  <View style={styles.headerRow}>
                    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
                      <AppText variant="h3">Global Chat</AppText>
                    </View>
                    <Pressable
                      style={styles.headerIconButton}
                      onPress={() => {
                        setShowSearch(true);
                        hapticTap();
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="search" size={20} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                ) : (
                  /* Search mode - search bar + cancel */
                  <View style={[styles.searchModeRow, { marginHorizontal: -8 }]}>
                    <Animated.View
                      style={[
                        styles.searchBarFlex,
                        {
                          borderColor: searchFocusAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['rgba(255,255,255,0.1)', colors.accentPrimary],
                          }),
                        }
                      ]}
                    >
                      <LinearGradient
                        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <Animated.View style={{
                        transform: [{
                          scale: searchFocusAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.1],
                          })
                        }]
                      }}>
                        <Ionicons name="search" size={18} color={isSearchFocused ? colors.accentPrimary : colors.textMuted} style={styles.searchIcon} />
                      </Animated.View>
                      <View style={styles.searchInputContainer}>
                        <AppTextInput
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          onFocus={() => {
                            setIsSearchFocused(true);
                            hapticTap();
                          }}
                          onBlur={() => setIsSearchFocused(false)}
                          onSubmitEditing={() => {
                            if (searchQuery.trim()) {
                              setRecentSearches(prev => [searchQuery.trim(), ...prev.filter(s => s !== searchQuery.trim())].slice(0, 5));
                              Keyboard.dismiss();
                            }
                          }}
                          placeholder="Search messages..."
                          style={[
                            styles.searchInput,
                            { fontWeight: searchQuery.length > 0 ? '500' : '400' }
                          ]}
                          autoFocus
                          returnKeyType="search"
                        />
                      </View>
                      {searchQuery.length > 0 && (
                        <Pressable onPress={() => {
                          setSearchQuery('');
                          hapticTap();
                        }}>
                          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                        </Pressable>
                      )}
                    </Animated.View>
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => {
                        setShowSearch(false);
                        setSearchQuery('');
                        setActiveFilter('all');
                        Keyboard.dismiss();
                      }}
                    >
                      <AppText style={{ color: colors.accentPrimary, fontWeight: '600', fontSize: 15 }}>Cancel</AppText>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1 }}
              // Keep composer visible even as the sheet height changes (conservative offset).
              keyboardVerticalOffset={insets.top + 8}
            >
              {/* Dismiss layer - covers entire content area when menu is open */}
              {menuVisible && (
                <Pressable
                  style={[StyleSheet.absoluteFillObject, { zIndex: 50, backgroundColor: 'transparent' }]}
                  onPress={closeMenu}
                />
              )}
              <View style={styles.messagesWrap}>
                <FlatList
                  ref={listRef}
                  data={filteredMessages}
                  keyExtractor={(m) => m.id}
                  style={styles.chatList}
                  contentContainerStyle={{ paddingTop: 12, paddingBottom: 0, flexGrow: 1, justifyContent: 'flex-end' }}
                  keyboardDismissMode="interactive"
                  renderItem={renderItem}
                  keyboardShouldPersistTaps="handled"
                  onScroll={onScroll}
                  onScrollBeginDrag={() => {
                    // Close menu and dismiss keyboard when user starts scrolling
                    closeMenu();
                    Keyboard.dismiss();
                  }}
                  scrollEventThrottle={16}
                  onScrollToIndexFailed={onScrollToIndexFailed}
                  onContentSizeChange={() => {
                    // Use ref to avoid stale closure issues, setTimeout for layout stability
                    if (isNearBottomRef.current && !searchQuery) {
                      setTimeout(() => {
                        scrollToBottom(false);
                      }, 50);
                    }
                  }}
                  ListEmptyComponent={
                    <View style={styles.emptyState}>
                      {showSearch && !searchQuery && activeFilter === 'all' && recentSearches.length > 0 ? (
                        <View style={styles.recentSearchesContainer}>
                          <AppText style={styles.recentSearchesTitle}>Recent Searches</AppText>
                          {recentSearches.map((s, i) => (
                            <Pressable key={i} style={styles.recentSearchItem} onPress={() => setSearchQuery(s)}>
                              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                              <AppText style={styles.recentSearchText}>{s}</AppText>
                            </Pressable>
                          ))}
                        </View>
                      ) : (
                        <>
                          <Ionicons name={searchQuery ? "search-outline" : "chatbubbles-outline"} size={48} color={colors.textMuted} />
                          <AppText style={styles.emptyStateText}>
                            {searchQuery || activeFilter !== 'all' ? "No matches found" : "No messages yet"}
                          </AppText>
                          <AppText style={styles.emptyStateSubtext}>
                            {searchQuery || activeFilter !== 'all' ? "Try a different search term or filter" : "Be the first to say hello!"}
                          </AppText>
                        </>
                      )}
                    </View>
                  }
                />
              </View>

              {showMentions ? (
                <View style={[styles.mentionBox, { bottom: Math.max(86, composerH + 14) }]}>
                  {mentions.map((u) => (
                    <Pressable key={u.id} onPress={() => insertMention(u.name)} style={styles.mentionItem}>
                      <AppText variant="small">{u.name}</AppText>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {/* New messages floating pill */}
              {hasNewWhileUp && !isNearBottom && (
                <Pressable
                  onPress={() => {
                    hapticTap();
                    scrollToBottom(true);
                  }}
                  style={[styles.newMsgPill, { bottom: Math.max(72, composerH + 18) }]}
                >
                  <AppText style={styles.newMsgText}>New messages ↓</AppText>
                </Pressable>
              )}

              <View
                style={[styles.composerContainer, { paddingBottom: insets.bottom + 2 }]}
                onLayout={(e) => setComposerH(Math.round(e.nativeEvent.layout.height))}
              >
                {/* Reply bar - tap to jump to original */}
                {replyTo && (
                  <View style={styles.replyBar}>
                    <Pressable onPress={() => jumpToMessage(replyTo.id)} style={styles.replyBarContent}>
                      <AppText style={styles.replyBarText}>
                        Replying to <AppText style={styles.replyBarName}>{replyTo.user}</AppText>
                      </AppText>
                      <AppText numberOfLines={2} style={styles.replyBarSnippet}>
                        {replyTo.text}
                      </AppText>
                    </Pressable>
                    <Pressable onPress={() => setReplyTo(null)} style={styles.replyBarClose}>
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                )}

                {/* Editing bar */}
                {editing && (
                  <View style={styles.composerBar}>
                    <Pressable
                      onPress={() => {
                        setEditing(null);
                        setText('');
                      }}
                      style={styles.composerX}
                    >
                      <Ionicons name="close" size={18} color={colors.textSecondary} />
                    </Pressable>
                    <AppText style={styles.composerTitle}>Editing Message</AppText>
                  </View>
                )}

                <View style={styles.chatInputRow}>
                  <Pressable style={styles.chatIconButton} onPress={() => {
                    hapticTap();
                    sendMessage('', { type: 'image', url: '', aspectRatio: 1.5 });
                  }}>
                    <Ionicons name="add" size={20} color={colors.textSecondary} />
                  </Pressable>
                  <AppTextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={handleChange}
                    onFocus={onFocusInput}
                    placeholder="Message global chat"
                    style={styles.chatInput}
                    editable
                  />
                  {text.length === 0 ? (
                    <Pressable style={styles.chatIconButton} onPress={() => {
                      hapticTap();
                      sendMessage('', { type: 'audio', url: '', duration: 12 });
                    }}>
                      <Ionicons name="mic" size={20} color={colors.textSecondary} />
                    </Pressable>
                  ) : (
                    <Pressable style={styles.chatSend} onPress={handleSend}>
                      <Ionicons name="arrow-up" size={20} color={colors.textPrimary} />
                    </Pressable>
                  )}
                </View>
                {text.length > 0 && (
                  <AppText style={[styles.charCount, text.length > 450 && styles.charCountWarning]}>
                    {text.length}/500
                  </AppText>
                )}
              </View>
            </KeyboardAvoidingView>
          </Animated.View>
        </View>

        {/* Action menu on top of everything */}
        <MessageActionMenu
          visible={menuVisible}
          anchor={menuAnchor}
          isMine={isMine}
          onClose={closeMenu}
          onAction={handleAction}
          onReaction={handleReaction}
        />
      </View>
    </Modal>
  );
}

function SimpleRichText({ text, style }: { text: string; style: any }) {
  // Basic parser for **bold** and *italic*
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

const UserMessageRow = React.memo(function UserMessageRow({
  item,
  selected,
  menuVisible,
  isHighlighted,
  onOpenMenu,
  onJumpToReply,
}: {
  item: ChatMessage;
  selected: boolean;
  menuVisible: boolean;
  isHighlighted: boolean;
  onOpenMenu: (msg: ChatMessage, anchor: AnchorRect) => void;
  onJumpToReply: (id: string) => void;
}) {
  const bubbleRef = useRef<View>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressAnim = useRef(new Animated.Value(0)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const highlightLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const openMenuNow = useCallback(() => {
    bubbleRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
      onOpenMenu(item, { x, y, width: w, height: h });
    });
  }, [item, onOpenMenu]);

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (highlightLoopRef.current) highlightLoopRef.current.stop();
    };
  }, []);

  useEffect(() => {
    pressAnim.stopAnimation();
    Animated.timing(pressAnim, {
      toValue: selected ? 1 : 0,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [pressAnim, selected]);

  // Animate highlight flash
  useEffect(() => {
    if (highlightLoopRef.current) {
      highlightLoopRef.current.stop();
      highlightLoopRef.current = null;
    }

    if (isHighlighted) {
      highlightAnim.setValue(0);
      const pulse = Animated.sequence([
        Animated.timing(highlightAnim, {
          toValue: 1,
          duration: 210,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(highlightAnim, {
          toValue: 0.12,
          duration: 200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]);
      highlightLoopRef.current = Animated.sequence([
        pulse,
        pulse,
        pulse,
        Animated.timing(highlightAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]);
      highlightLoopRef.current.start(() => {
        highlightAnim.setValue(0);
        highlightLoopRef.current = null;
      });
      return;
    }

    highlightAnim.setValue(0);
  }, [highlightAnim, isHighlighted]);

  const onPressIn = () => {
    pressAnim.stopAnimation();
    Animated.timing(pressAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: false,
    }).start();

    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(openMenuNow, HOLD_MENU_DELAY_MS);
  };

  const onPressOut = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;

    if (!selected) {
      pressAnim.stopAnimation();
      Animated.timing(pressAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: false,
      }).start();
    }
  };

  const scale = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.98],
  });

  const borderColor = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.borderSubtle, 'rgba(255,255,255,0.22)'],
  });

  const overlayOpacity = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const highlightBorderColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(123,97,255,0)', 'rgba(123,97,255,0.78)'],
  });

  const highlightBg = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(123,97,255,0)', 'rgba(123,97,255,0.16)'],
  });

  const highlightGlowOpacity = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.35],
  });

  const highlightGlowRadius = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 12],
  });

  const highlightElevation = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });
  const mediaUri = item.media ? normalizeImageUri(item.media.url) : undefined;

  return (
    <Animated.View
      style={[
        styles.row,
        {
          borderColor: highlightBorderColor,
          backgroundColor: highlightBg,
          borderWidth: 1,
          borderRadius: 14,
          shadowColor: colors.accentPrimary,
          shadowOpacity: highlightGlowOpacity,
          shadowRadius: highlightGlowRadius,
          shadowOffset: { width: 0, height: 0 },
          elevation: highlightElevation,
        },
      ]}
    >
      <Pressable
        disabled={menuVisible && !selected}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.rowInner}
      >
        <View style={styles.avatar} />
        <View style={styles.content}>
          <View style={styles.msgHeader}>
            <AppText style={styles.name}>{item.user}</AppText>
            <AppText style={styles.timestamp}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </AppText>
          </View>

          {/* Reply embed - Discord style with vertical line */}
          {item.replyTo && (
            <Pressable onPress={() => onJumpToReply(item.replyTo!.id)} style={styles.replyEmbed}>
              <View style={styles.replyLine} />
              <View style={styles.replyEmbedContent}>
                <AppText style={styles.replyToName}>Replying to {item.replyTo.user}</AppText>
                <AppText numberOfLines={3} style={styles.replyPreview}>
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
              {
                transform: [{ scale }],
                borderColor,
              },
            ]}
          >
            {/* Media Content */}
            {item.media ? (
              <View style={styles.mediaContainer}>
                {item.media.type === 'image' && mediaUri ? (
                  <Image
                    source={{ uri: mediaUri }}
                    style={[
                      styles.mediaImage,
                      { aspectRatio: item.media.aspectRatio || 1.5 },
                    ]}
                  />
                ) : null}
                {item.media.type === 'image' && !mediaUri && (
                  <View style={[styles.mediaImage, styles.mediaFallback]}>
                    <Ionicons name="image-outline" size={20} color={colors.textMuted} />
                  </View>
                )}
                {item.media.type === 'audio' && (
                  <View style={styles.audioContainer}>
                    <Pressable style={styles.audioPlayBtn}>
                      <Ionicons name="play" size={16} color="#fff" />
                    </Pressable>
                    <View style={styles.audioWaveform}>
                      {[...Array(12)].map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.audioBar,
                            { height: Math.max(4, Math.random() * 16 + 4) },
                          ]}
                        />
                      ))}
                    </View>
                    <AppText style={styles.audioDuration}>
                      0:{item.media.duration?.toString().padStart(2, '0') || '00'}
                    </AppText>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.msgTextContainer}>
                <SimpleRichText text={item.text} style={styles.msgText} />
                {item.edited && <AppText style={styles.editedLabel}> (edited)</AppText>}
              </View>
            )}

            {/* Reactions Grid */}
            {item.reactions && item.reactions.length > 0 && (
              <View style={styles.reactionsContainer}>
                {item.reactions.map((r) => (
                  <View key={r.emoji} style={[styles.reactionPill, r.isMine && styles.reactionPillActive]}>
                    <AppText style={styles.reactionEmojiText}>{r.emoji}</AppText>
                    <AppText style={[styles.reactionCount, r.isMine && styles.reactionCountActive]}>
                      {r.count}
                    </AppText>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.msgFooter}>
              {item.status === 'sending' && <Ionicons name="time-outline" size={10} color={colors.textMuted} />}
              {item.status === 'sent' && <Ionicons name="checkmark" size={10} color={colors.textMuted} />}
              {item.status === 'failed' && <Ionicons name="alert-circle" size={10} color={colors.accentDanger} />}
            </View>
            <Animated.View style={[styles.bubbleGlow, { opacity: overlayOpacity }, styles.pointerEventsNone]} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  pointerEventsAuto: {
    pointerEvents: 'auto',
  },
  pointerEventsNone: {
    pointerEvents: 'none',
  },
  pointerEventsBoxNone: {
    pointerEvents: 'box-none',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  chatSheet: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    zIndex: 10,
    elevation: 10,
    overflow: 'hidden', // ensure children clipping
  },
  grabberContainer: {
    height: 30, // Just covers the grabber line area
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 4, // Small padding so grabber line sits at top
    zIndex: 15,
  },
  grabberWrap: {
    alignItems: 'center',
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  topChrome: {
    // Header row with drag zone
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 5,
  },
  headerDragZone: {
    // Drag zone covers title area
    flex: 1,
    minHeight: 44, // Ensure it's touchable
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  searchModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  searchBarFlex: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: 22,
    paddingHorizontal: 16,
    height: 44,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  headerIconButton: {
    minWidth: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
  },
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 44,
    position: 'relative',
  },
  titleContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  searchIconButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  searchContainerAbsolute: {
    position: 'absolute',
    left: 0,
    right: 70,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: 22,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  cancelButtonContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: 22, // Softer rounded corners
    paddingHorizontal: 16,
    height: 44,
    borderWidth: 1.5, // Slightly thicker for focus prominence
    borderColor: 'rgba(255,255,255,0.1)',
    minWidth: 60,
    overflow: 'hidden',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInputContainer: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  placeholderContainer: {
    position: 'absolute',
    left: 0,
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    includeFontPadding: false,
    height: '100%',
    paddingVertical: 0,
    zIndex: 1,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingLeft: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatHeaderTitleOnly: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    height: 60,
    width: '100%',
    justifyContent: 'center',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  filterChipActive: {
    backgroundColor: colors.accentPrimary,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  recentSearchesContainer: {
    width: '100%',
    paddingHorizontal: 20,
    alignItems: 'flex-start',
  },
  recentSearchesTitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
    fontWeight: '600',
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  recentSearchText: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  messagesWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  chatList: {
    flex: 1,
  },
  // Discord-style: all messages on left
  row: {
    marginVertical: 2,
  },
  rowInner: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    flex: 1,
  },
  name: {
    opacity: 0.9,
    fontWeight: '700',
    fontSize: 13,
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  timestamp: {
    opacity: 0.4,
    fontSize: 10,
  },
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  msgText: {
    opacity: 0.95,
  },
  mediaContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 2,
    marginBottom: 4,
  },
  mediaImage: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  mediaFallback: {
    aspectRatio: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 160,
  },
  audioPlayBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 20,
  },
  audioBar: {
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 1,
  },
  audioDuration: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    color: colors.textSecondary,
  },
  msgTextContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  msgFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
    opacity: 0.7,
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    marginBottom: 2,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  reactionPillActive: {
    backgroundColor: 'rgba(190, 56, 243, 0.2)', // Brand tint
    borderColor: 'rgba(190, 56, 243, 0.5)',
    borderWidth: 1,
    paddingVertical: 2, // Compensate for border
    paddingHorizontal: 5,
  },
  reactionEmojiText: {
    fontSize: 12,
  },
  reactionCount: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  reactionCountActive: {
    color: colors.textPrimary,
  },
  charCount: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'right',
    paddingRight: 12,
    marginTop: 4,
  },
  charCountWarning: {
    color: colors.accentDanger,
  },
  editedLabel: {
    opacity: 0.5,
    fontSize: 12,
  },
  bubbleGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Reply embed inside message (Discord style - tap to jump)
  replyEmbed: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  replyLine: {
    width: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  replyEmbedContent: {
    flex: 1,
  },
  replyToName: {
    fontSize: 12,
    opacity: 0.9,
    fontWeight: '600',
  },
  replyPreview: {
    fontSize: 12,
    opacity: 0.65,
    marginTop: 2,
  },
  // Reply bar above input (Discord style)
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPrimary,
  },
  replyBarContent: {
    flex: 1,
  },
  replyBarText: {
    opacity: 0.7,
    fontSize: 12,
  },
  replyBarName: {
    fontWeight: '700',
    opacity: 1,
  },
  replyBarSnippet: {
    opacity: 0.55,
    fontSize: 12,
    marginTop: 2,
  },
  replyBarClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Composer bar (replying / editing)
  composerContainer: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.lg,
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    gap: 8,
  },
  composerX: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerTitle: {
    opacity: 0.85,
    flex: 1,
  },
  // New messages floating pill
  newMsgPill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 72,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    zIndex: 30,
  },
  newMsgText: {
    fontSize: 13,
    opacity: 0.95,
  },
  // Input row
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chatIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...typography.body,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    includeFontPadding: false,
    lineHeight: 20,
    minHeight: 44,
    maxHeight: 120,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chatSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentPrimarySoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  systemMessageRow: {
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  systemMessageText: {
    textAlign: 'center',
    color: colors.textMuted,
  },
  mentionBox: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 86,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.sm,
    gap: spacing.xs,
    zIndex: 20,
  },
  mentionItem: {
    paddingVertical: spacing.xs,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentSuccess,
  },
  onlineText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    gap: spacing.sm,
    opacity: 0.6,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
