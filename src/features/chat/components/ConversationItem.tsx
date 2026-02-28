import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Image, Pressable, Modal, Animated } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { formatDistanceToNow } from 'date-fns';

import { AppText } from '../../../components';
import type { Conversation, SocialUser } from '../../../data/contracts';
import { colors, radius, spacing } from '../../../theme';

interface ConversationItemProps {
  conversation: Conversation;
  otherUser?: SocialUser;
  onPress: (conversation: Conversation) => void;
  onMarkAsRead?: (conversation: Conversation) => void;
  onMute?: (conversation: Conversation) => void;
  onClose?: (conversation: Conversation) => void;
  onFavorite?: (conversation: Conversation) => void;
  onViewProfile?: (userId: string) => void;
}

function hasImageUri(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

type SocialPresenceStatus = NonNullable<SocialUser['status']>;

function resolveSocialStatus(user: SocialUser): SocialPresenceStatus {
  if (user.status) {
    return user.status;
  }
  if (user.isLive) {
    return 'live';
  }
  if (user.isOnline) {
    return 'online';
  }
  return 'offline';
}

export function ConversationItem({
  conversation,
  otherUser: otherUserProp,
  onPress,
  onMarkAsRead,
  onMute,
  onClose,
  onFavorite,
  onViewProfile,
}: ConversationItemProps) {
  const [menuVisible, setMenuVisible] = useState(false);
  const otherUser = useMemo<SocialUser>(() => {
    return otherUserProp || {
      id: conversation.otherUserId,
      username: 'User',
      avatarUrl: '',
      isOnline: false,
    };
  }, [conversation.otherUserId, otherUserProp]);
  const otherUserStatus = useMemo(() => resolveSocialStatus(otherUser), [otherUser]);
  const showOnlineBadge = otherUserStatus === 'live' || otherUserStatus === 'online' || otherUserStatus === 'busy';
  const isUnread = conversation.unreadCount > 0;
  const isLastMessageFromMe = conversation.lastMessage.senderId === 'me';
  const lastMessageReadAt =
    typeof conversation.lastMessage.readAt === 'number' &&
      Number.isFinite(conversation.lastMessage.readAt)
      ? conversation.lastMessage.readAt
      : null;
  const lastMessageDeliveredAt =
    typeof conversation.lastMessage.deliveredAt === 'number' &&
      Number.isFinite(conversation.lastMessage.deliveredAt)
      ? conversation.lastMessage.deliveredAt
      : null;
  const lastMessageReceiptIcon = isLastMessageFromMe
    ? lastMessageReadAt !== null
      ? 'eye-outline'
      : lastMessageDeliveredAt !== null
        ? 'checkmark-done'
        : 'checkmark'
    : null;
  const lastMessageReceiptColor =
    lastMessageReadAt !== null ? colors.accentPrimary : colors.textMuted;

  // Streak animation
  const streakOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!conversation.streak || !conversation.streakExpiresAt) return;

    const checkStreakExpiry = () => {
      const now = new Date();
      const expiresAt = new Date(conversation.streakExpiresAt!);
      const timeLeft = expiresAt.getTime() - now.getTime();
      const hoursLeft = timeLeft / (1000 * 60 * 60);

      // Start fading when less than 4 hours left
      if (hoursLeft < 4 && hoursLeft > 0) {
        // Fade out animation
        Animated.loop(
          Animated.sequence([
            Animated.timing(streakOpacity, {
              toValue: 0.3,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(streakOpacity, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
            }),
          ])
        ).start();
      } else {
        // Stop animations if streak is safe or expired
        streakOpacity.setValue(1);
      }
    };

    checkStreakExpiry();
    const interval = setInterval(checkStreakExpiry, 60000); // Check every minute

    return () => {
      clearInterval(interval);
      streakOpacity.setValue(1);
    };
  }, [conversation.streak, conversation.streakExpiresAt, streakOpacity]);

  const handleLongPress = () => {
    setMenuVisible(true);
  };

  const handleMenuOption = (action: () => void) => {
    setMenuVisible(false);
    action();
  };

  // Format time
  let timeDisplay = '';
  try {
    const date = new Date(conversation.lastMessage.createdAt);
    timeDisplay = formatDistanceToNow(date, { addSuffix: false })
      .replace('less than a minute', 'now')
      .replace('about ', '')
      .replace(' hours', 'h')
      .replace(' hour', 'h')
      .replace(' minutes', 'm')
      .replace(' minute', 'm')
      .replace(' days', 'd')
      .replace(' day', 'd')
      .replace(' months', 'mo')
      .replace(' month', 'mo')
      .replace(' years', 'y')
      .replace(' year', 'y');
  } catch (e) {
    timeDisplay = '';
  }

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.container,
          pressed && styles.pressed,
          conversation.pinned && styles.pinned,
        ]}
        onPress={() => onPress(conversation)}
        onLongPress={handleLongPress}
        delayLongPress={300}
      >
        {/* Avatar */}
        <Pressable
          style={styles.avatarContainer}
          onPress={(event) => {
            event.stopPropagation();
            onViewProfile?.(conversation.otherUserId);
          }}
          hitSlop={6}
        >
          {hasImageUri(otherUser.avatarUrl) ? (
            <Image source={{ uri: otherUser.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]} />
          )}
          {showOnlineBadge ? (
            <View
              style={[styles.onlineBadge, otherUserStatus === 'busy' && styles.busyBadge]}
            />
          ) : null}
        </Pressable>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.usernameWithStreak}>
              <AppText style={styles.username} numberOfLines={1}>
                {otherUser.username}
              </AppText>
              {(conversation.streak || 0) > 0 && (
                <Animated.View style={[styles.streakBadge, { opacity: streakOpacity }]}>
                  <AppText style={styles.streakNumber}>{conversation.streak}</AppText>
                  <StreakIcon />
                </Animated.View>
              )}
            </View>
            <AppText style={[styles.time, isUnread && styles.activeTime]}>
              {timeDisplay}
            </AppText>
          </View>

          <View style={styles.messageRow}>
            {lastMessageReceiptIcon ? (
              <View style={styles.messageReceipt}>
                <Ionicons
                  name={lastMessageReceiptIcon}
                  size={13}
                  color={lastMessageReceiptColor}
                />
              </View>
            ) : null}
            <AppText
              style={[styles.message, isUnread && styles.unreadMessage]}
              numberOfLines={1}
            >
              {isLastMessageFromMe
                ? `You: ${conversation.lastMessage.text || 'Sent an attachment'}`
                : conversation.lastMessage.text || 'Started a conversation'}
            </AppText>

            {isUnread && (
              <View style={styles.unreadBadge}>
                <AppText style={styles.unreadText}>
                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                </AppText>
              </View>
            )}
          </View>
        </View>
      </Pressable>

      {/* Discord-style Long Press Menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            {/* User Header */}
            <View style={styles.menuHeader}>
              {hasImageUri(otherUser.avatarUrl) ? (
                <Image source={{ uri: otherUser.avatarUrl }} style={styles.menuAvatar} />
              ) : (
                <View style={[styles.menuAvatar, styles.avatarFallback]} />
              )}
              <AppText style={styles.menuUsername}>@{otherUser.username}</AppText>
            </View>

            {/* Menu Options - Group 1 */}
            <View style={styles.menuGroup}>
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => handleMenuOption(() => onViewProfile?.(conversation.otherUserId))}
              >
                <Ionicons name="person" size={20} color={colors.textSecondary} />
                <AppText style={styles.menuItemText}>Profile</AppText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => handleMenuOption(() => onClose?.(conversation))}
              >
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                <AppText style={styles.menuItemText}>Close DM</AppText>
              </Pressable>
            </View>

            {/* Menu Options - Group 2 */}
            <View style={styles.menuGroup}>
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => handleMenuOption(() => onFavorite?.(conversation))}
              >
                <Ionicons name="star" size={20} color={colors.textSecondary} />
                <AppText style={styles.menuItemText}>Favorite</AppText>
              </Pressable>
            </View>

            {/* Menu Options - Group 3 */}
            <View style={styles.menuGroup}>
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => handleMenuOption(() => onMarkAsRead?.(conversation))}
              >
                <Ionicons name="eye" size={20} color={colors.textSecondary} />
                <AppText style={styles.menuItemText}>Mark As Read</AppText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => handleMenuOption(() => onMute?.(conversation))}
              >
                <Ionicons name="notifications-off" size={20} color={colors.textSecondary} />
                <AppText style={styles.menuItemText}>Mute Conversation</AppText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    marginHorizontal: spacing.xs,
  },
  pinned: {
    backgroundColor: 'rgba(123, 97, 255, 0.05)', // extremely subtle tint
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceAlt,
  },
  avatarFallback: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accentSuccess,
    borderWidth: 2,
    borderColor: colors.background,
  },
  busyBadge: {
    backgroundColor: colors.accentDanger,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usernameWithStreak: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.xs,
    gap: 2,
  },
  streakNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E69F4',
  },
  time: {
    fontSize: 12,
    color: colors.textMuted,
  },
  activeTime: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  messageReceipt: {
    marginRight: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
    marginRight: spacing.sm,
  },
  unreadMessage: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: colors.badgeNotificationBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    color: colors.badgeNotificationText,
    fontSize: 10,
    fontWeight: '700',
  },
  // Menu styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 40,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  menuAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
  },
  menuUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuGroup: {
    backgroundColor: colors.surfaceAlt,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  menuItemPressed: {
    backgroundColor: colors.borderSubtle,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
});

function StreakIcon() {
  return (
    <Svg width="9" height="12" viewBox="0 0 9 12" fill="none">
      <Path
        d="M8.65743 9.57011C7.81557 11.2048 5.75064 11.5543 5.66178 11.5688C5.64978 11.5713 5.63542 11.5713 5.62341 11.5713C5.60906 11.5713 5.59461 11.5688 5.58026 11.5665C5.57069 11.5665 5.56104 11.564 5.55147 11.5592C5.53467 11.5568 5.51789 11.5496 5.50353 11.5376C5.49153 11.5303 5.47952 11.5232 5.46996 11.5134C5.46039 11.5086 5.45081 11.5014 5.44359 11.4918C5.44116 11.4893 5.43881 11.487 5.43881 11.4845C5.41245 11.4507 5.39566 11.4122 5.38844 11.3736C5.386 11.3712 5.386 11.3712 5.386 11.3688C5.38356 11.3567 5.38356 11.3446 5.38356 11.3327C5.38356 11.3183 5.386 11.3037 5.38835 11.2893C5.38835 11.2797 5.39314 11.2676 5.39557 11.2555C5.39801 11.2507 5.39801 11.2483 5.39801 11.2459C5.40523 11.2338 5.41002 11.2218 5.41723 11.2122C5.42445 11.2001 5.43159 11.1881 5.44125 11.1784C5.44603 11.1687 5.4556 11.159 5.46526 11.1519C5.46761 11.1494 5.47004 11.1471 5.47248 11.1446C7.10815 9.67879 6.72922 8.30696 6.71242 8.24898C6.7052 8.2321 6.70286 8.21286 6.70042 8.19598C6.62369 6.98564 5.67866 5.63545 5.08387 4.90023C4.97112 6.04308 4.26838 7.7621 4.0909 8.17919C4.04532 8.28772 3.92779 8.34553 3.81748 8.32139C3.70239 8.29489 3.62558 8.19117 3.63045 8.07548C3.6448 7.69698 3.34023 7.19308 3.07158 6.83382C2.9517 7.13762 2.72142 7.60777 2.28488 8.3528C2.09063 8.68551 1.97788 9.02554 1.95151 9.35817C1.858 10.5564 2.62547 10.9977 2.8173 11.0869C2.84366 11.099 2.85809 11.1038 2.86044 11.1038C2.89646 11.1182 2.9276 11.1375 2.95161 11.1664C2.96119 11.1737 2.96841 11.1833 2.97562 11.193C2.98763 11.2146 2.99964 11.2363 3.00442 11.258C3.01878 11.2942 3.02121 11.3328 3.01399 11.3713C3.01155 11.3858 3.00677 11.4003 3.00199 11.4147C2.97562 11.487 2.91803 11.5401 2.84853 11.5593C2.83652 11.5641 2.82451 11.5666 2.8126 11.5689C2.80059 11.5714 2.78859 11.5714 2.77658 11.5714C2.75022 11.5714 2.72143 11.5666 2.69507 11.557H2.69028C1.4239 11.0627 0.591702 10.3129 0.220001 9.32924C-0.350778 7.82229 0.332747 6.19735 0.651677 5.56802C0.812356 5.25459 1.01863 4.93634 1.30162 4.56501C2.86302 2.51807 3.2899 0.220383 3.29469 0.198667C3.30905 0.109464 3.37386 0.0371417 3.46016 0.0106431C3.5441 -0.0158555 3.63763 0.00819441 3.70244 0.0708982C5.03833 1.44515 6.08163 2.54456 6.79875 3.34023C7.43191 4.04186 7.94273 4.78443 8.31691 5.55357C9.09387 7.14707 9.209 8.49708 8.65743 9.57011Z"
        fill="#6E69F4"
      />
    </Svg>
  );
}
