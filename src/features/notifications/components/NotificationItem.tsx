import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../../../components';
import { colors, spacing, radius } from '../../../theme';
import { Notification, ActivityNotification } from '../types';
import { resolveActivityNotificationNavigation } from '../notificationNavigation';
import {
  getActivityNotificationAccessibilityText,
  shouldPrefixActivityActor,
} from '../activityNotificationText';
import { countsTowardUnreadNotificationBadges } from '../unreadBadgeState';

interface NotificationItemProps {
  item: Notification;
  onAction?: (type: string, id: string, action: any) => void;
  onPress?: () => void;
  onLongPress?: () => void;
}

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#A29BFE', '#FD79A8', '#6C5CE7',
  '#00B894', '#E17055', '#0984E3', '#F39C12', '#1ABC9C',
];
function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getTypeTint(item: Notification): string | undefined {
  if (item.type === 'friend_request') return 'rgba(78, 205, 196, 0.45)';
  if (item.type === 'announcement') return undefined;
  if (item.type === 'profile_view') return 'rgba(190, 56, 243, 0.45)';
  if (item.type === 'activity') {
    switch ((item as ActivityNotification).activityType) {
      case 'mention':
      case 'reply':
        return 'rgba(123, 97, 255, 0.45)';
      case 'money_received': return 'rgba(25, 250, 152, 0.45)';
      case 'live_invite': return 'rgba(255, 94, 94, 0.45)';
      case 'event': return 'rgba(255, 215, 0, 0.45)';
      default: return undefined;
    }
  }
  return undefined;
}

function formatTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const d = new Date(timestamp);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getAccessibilityLabel(item: Notification): string {
  const time = formatTime(item.createdAt);
  switch (item.type) {
    case 'friend_request':
      if (item.direction === 'sent') {
        return `Friend request sent to ${item.fromUser.name}, ${item.status}, ${time}`;
      }
      return `Friend request from ${item.fromUser.name}, ${item.status}, ${time}`;
    case 'announcement':
      return `Announcement: ${item.title}, ${time}`;
    case 'profile_view':
      return `${item.viewer.name} viewed your profile, ${time}`;
    case 'activity':
      return `${getActivityNotificationAccessibilityText(item)}, ${time}`;
    default:
      return `Notification, ${time}`;
  }
}

export function NotificationItem({ item, onAction, onPress, onLongPress }: NotificationItemProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendRequestStatus = item.type === 'friend_request' ? item.status : undefined;
  const friendRequestDirection = item.type === 'friend_request' ? (item.direction ?? 'received') : undefined;
  const showsUnreadIndicator = countsTowardUnreadNotificationBadges(item);

  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    setLoadingAction(null);
  }, [item.id, friendRequestStatus, friendRequestDirection]);

  const handleFriendAction = (action: 'accept' | 'decline' | 'cancel') => {
    setLoadingAction(action);
    onAction?.('friend_request', item.id, action);

    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = setTimeout(() => {
      setLoadingAction(null);
    }, 2500);
  };

  const renderAvatar = () => {
    if (item.type === 'announcement') {
      return (
        <View style={[styles.avatar, styles.systemAvatar]}>
          <Ionicons name="megaphone" size={20} color="#fff" />
        </View>
      );
    }

    let uri: string | undefined;
    let name = '';
    let id = '';

    if (item.type === 'friend_request') {
      uri = item.fromUser.avatar;
      name = item.fromUser.name;
      id = item.fromUser.id;
    } else if (item.type === 'profile_view') {
      uri = item.viewer.avatar;
      name = item.viewer.name;
      id = item.viewer.id;
    } else if (item.type === 'activity' && item.fromUser) {
      uri = item.fromUser.avatar;
      name = item.fromUser.name;
      id = item.fromUser.id;
    }

    if (uri) {
      return <Image source={{ uri }} style={styles.avatar} />;
    }

    const initial = name.charAt(0).toUpperCase() || '?';
    return (
      <View style={[styles.avatar, { backgroundColor: getAvatarColor(id || name) }]}>
        <AppText style={styles.avatarInitial}>{initial}</AppText>
      </View>
    );
  };

  const renderContent = () => {
    switch (item.type) {
      case 'friend_request':
        if (item.status === 'pending') {
          const isSent = friendRequestDirection === 'sent';
          return (
            <View style={styles.contentContainer}>
              <AppText style={styles.primaryText}>
                {isSent ? (
                  <>
                    You sent a friend request to <AppText style={styles.bold}>{item.fromUser.name}</AppText>.
                  </>
                ) : (
                  <>
                    <AppText style={styles.bold}>{item.fromUser.name}</AppText> sent you a friend request.
                  </>
                )}
              </AppText>
              <View style={styles.timeRow}>
                {isSent && (
                  <View style={[styles.statusPill, styles.statusPending]}>
                    <AppText style={[styles.statusPillText, styles.statusPendingText]}>Pending</AppText>
                  </View>
                )}
                <AppText style={styles.time}>{formatTime(item.createdAt)}</AppText>
                {showsUnreadIndicator && <View style={styles.unreadDot} />}
              </View>
              {isSent ? (
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.actionBtn, styles.ignoreBtn, loadingAction && styles.btnDisabled]}
                    onPress={() => handleFriendAction('cancel')}
                    disabled={!!loadingAction}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel friend request"
                  >
                    {loadingAction === 'cancel'
                      ? <ActivityIndicator size="small" color={colors.textSecondary} />
                      : <AppText style={styles.ignoreBtnText}>Cancel</AppText>}
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.actionBtn, styles.acceptBtn, loadingAction && styles.btnDisabled]}
                    onPress={() => handleFriendAction('accept')}
                    disabled={!!loadingAction}
                    accessibilityRole="button"
                    accessibilityLabel="Accept friend request"
                  >
                    {loadingAction === 'accept'
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <AppText style={styles.acceptBtnText}>Accept</AppText>}
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.ignoreBtn, loadingAction && styles.btnDisabled]}
                    onPress={() => handleFriendAction('decline')}
                    disabled={!!loadingAction}
                    accessibilityRole="button"
                    accessibilityLabel="Ignore friend request"
                  >
                    {loadingAction === 'decline'
                      ? <ActivityIndicator size="small" color={colors.textSecondary} />
                      : <AppText style={styles.ignoreBtnText}>Ignore</AppText>}
                  </Pressable>
                </View>
              )}
            </View>
          );
        }
        const isSent = friendRequestDirection === 'sent';
        const statusCopy = isSent
          ? item.status === 'accepted'
            ? `${item.fromUser.name} accepted your friend request.`
            : `${item.fromUser.name} declined your friend request.`
          : item.status === 'accepted'
            ? `You accepted ${item.fromUser.name}'s friend request.`
            : `You declined ${item.fromUser.name}'s friend request.`;
        return (
          <View style={styles.contentContainer}>
            <AppText style={styles.primaryText}>
              {statusCopy}
            </AppText>
            <View style={styles.timeRow}>
              <View style={[
                styles.statusPill,
                item.status === 'accepted' ? styles.statusAccepted : styles.statusDeclined,
              ]}>
                <AppText style={[
                  styles.statusPillText,
                  item.status === 'accepted' ? styles.statusAcceptedText : styles.statusDeclinedText,
                ]}>
                  {item.status === 'accepted' ? 'Accepted' : 'Declined'}
                </AppText>
              </View>
              <AppText style={styles.time}>{formatTime(item.createdAt)}</AppText>
            </View>
          </View>
        );

      case 'announcement':
        return (
          <View style={styles.contentContainer}>
            <AppText style={styles.primaryText}>
              <AppText style={styles.bold}>{item.title}</AppText>
            </AppText>
            <AppText style={styles.secondaryText} numberOfLines={2}>
              {item.message}
            </AppText>
            <View style={styles.timeRow}>
              <AppText style={styles.time}>{formatTime(item.createdAt)}</AppText>
              {!item.read && <View style={styles.unreadDot} />}
            </View>
          </View>
        );

      case 'profile_view':
        return (
          <View style={styles.contentContainer}>
            <AppText style={styles.primaryText}>
              <AppText style={styles.bold}>{item.viewer.name}</AppText> viewed your profile.
            </AppText>
            {item.viewCount > 1 && (
              <AppText style={styles.secondaryText}>
                Visited {item.viewCount} times
              </AppText>
            )}
            <View style={styles.timeRow}>
              <AppText style={styles.time}>{formatTime(item.createdAt)}</AppText>
              {!item.read && <View style={styles.unreadDot} />}
            </View>
          </View>
        );

      case 'activity':
        const groupedNames = item.groupedNames ?? [];
        const showActorPrefix = shouldPrefixActivityActor(item);
        const showGroupedPrefix = showActorPrefix && Boolean(item.groupCount && item.groupCount > 1 && groupedNames.length > 0);
        return (
          <View style={styles.contentContainer}>
            <AppText style={styles.primaryText}>
              {showActorPrefix && item.fromUser ? (
                <AppText style={styles.bold}>{item.fromUser.name}</AppText>
              ) : null}
              {showGroupedPrefix ? (
                <AppText style={styles.primaryText}>
                  {' + '}
                  <AppText style={styles.bold}>
                    {groupedNames.length === 1
                      ? groupedNames[0]
                      : `${groupedNames.length}`}
                  </AppText>
                </AppText>
              ) : null}
              {showActorPrefix && (item.fromUser || showGroupedPrefix) ? ' ' : null}
              {item.message}
            </AppText>

            {item.metadata?.preview && (
              <View style={styles.messagePreview}>
                <View style={styles.quoteLine} />
                <AppText style={styles.previewText} numberOfLines={2}>
                  {item.metadata.preview}
                </AppText>
              </View>
            )}

            <View style={styles.timeRow}>
              <AppText style={styles.time}>{formatTime(item.createdAt)}</AppText>
              {!item.read && <View style={styles.unreadDot} />}
            </View>

            {(item.activityType === 'mention' || item.activityType === 'reply') && (
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, styles.replyBtn]}
                  onPress={() => {
                    const action = resolveActivityNotificationNavigation(item, 'reply');
                    if (action) {
                      onAction?.('navigation', item.id, action);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Reply to mention"
                >
                  <AppText style={styles.replyBtnText}>Reply</AppText>
                </Pressable>
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  const typeTint = getTypeTint(item);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        !item.read && styles.unread,
        typeTint && !item.read && { borderColor: typeTint },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      accessibilityLabel={getAccessibilityLabel(item)}
      accessibilityHint={onLongPress ? 'Double tap to open. Long press for actions.' : 'Double tap to open.'}
      accessibilityRole="button"
    >
      <View style={styles.left}>
        {renderAvatar()}
      </View>
      {renderContent()}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    minHeight: 64,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  unread: {
    borderWidth: 1,
    borderColor: colors.overlayAccentPrimarySubtle,
  },
  left: {
    marginRight: spacing.md,
    position: 'relative',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  systemAvatar: {
    backgroundColor: colors.accentPrimary,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 20,
    marginRight: spacing.xs,
  },
  bold: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  time: {
    fontSize: 12,
    color: colors.textMuted,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentPrimary,
  },
  secondaryText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 2,
  },
  messagePreview: {
    marginTop: 4,
    flexDirection: 'row',
    paddingLeft: spacing.xs,
  },
  quoteLine: {
    width: 2,
    backgroundColor: colors.borderSubtle,
    marginRight: spacing.sm,
    borderRadius: 1,
  },
  previewText: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
    minHeight: 36,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  acceptBtn: {
    backgroundColor: colors.accentPrimary,
  },
  acceptBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  ignoreBtn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  ignoreBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  replyBtn: {
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  replyBtnText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusAccepted: {
    backgroundColor: 'rgba(25, 250, 152, 0.12)',
  },
  statusDeclined: {
    backgroundColor: 'rgba(255, 94, 94, 0.12)',
  },
  statusPending: {
    backgroundColor: colors.accentPrimarySubtle,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusAcceptedText: {
    color: colors.accentSuccess,
  },
  statusDeclinedText: {
    color: colors.accentDanger,
  },
  statusPendingText: {
    color: colors.accentPrimary,
  },
});
