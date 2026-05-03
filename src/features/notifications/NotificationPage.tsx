import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { AppScreen, AppText, CurrencyPill } from '../../components';
import { toast } from '../../components/Toast';
import { colors, spacing, radius } from '../../theme';
import { 
  Notification, 
  FriendRequestNotification,
  ProfileViewNotification,
  AnnouncementNotification,
  ActivityNotification
} from './types';
import { NotificationItem } from './components/NotificationItem';
import { AnnouncementModal } from './components/AnnouncementModal';
import { NotificationSettingsModal } from './components/NotificationSettingsModal';
import { NotificationPageSkeleton } from './components/SkeletonLoader';
import { getActivityContextKey } from './activityGrouping';
import { shouldMarkNotificationReadBeforeNavigation } from './navigationReadState';
import { getUnreadProfileViewNotificationIds } from './profileViewReadState';
import { resolveActivityNotificationNavigation } from './notificationNavigation';
import { countsTowardUnreadNotificationBadges } from './unreadBadgeState';
import { ProfileViewsModal } from '../liveroom/components/ProfileViewsModal';
import { getProfileViewsPillAccessibilityLabel } from './profileViewAccessibility';
import { ProfileViewData } from '../liveroom/types';
import { useProfile } from '../../context/ProfileContext';
import { TopBar } from '../home/TopBar';

type NotificationPageProps = {
  notifications?: Notification[];
  onNotificationAction?: (type: string, id: string, action: any) => void | Promise<void>;
  onRefresh?: () => Promise<void> | void;
  onClearAll?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => Promise<void> | void;
  initialTab?: NotificationTab;
  openProfileViewsOnMount?: boolean;
};

type NotificationTab = 'requests' | 'mentions' | 'activity';

const formatBadgeCount = (count: number) => (count > 99 ? '99+' : `${count}`);
const formatTopCounterCount = (count: number) => (count >= 1000 ? `${(count / 1000).toFixed(1)}k` : `${count}`);
const SIX_HOURS = 1000 * 60 * 60 * 6;

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return fallbackMessage;
}

function getActivityGroupingKey(notification: ActivityNotification): string {
  return [
    notification.activityType,
    notification.message,
    getActivityContextKey(notification.metadata),
    notification.read ? 'read' : 'unread',
  ].join('|');
}

export function NotificationPage({ 
  notifications = [], 
  onNotificationAction,
  onRefresh,
  onClearAll,
  loading = false,
  error = null,
  onRetry,
  initialTab = 'requests',
  openProfileViewsOnMount = false,
}: NotificationPageProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [showAllFriendRequests, setShowAllFriendRequests] = useState(false);
  const [showProfileViews, setShowProfileViews] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementNotification | null>(null);
  const [activeTab, setActiveTab] = useState<NotificationTab>(initialTab);

  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const hiddenIdSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);

  const visibleNotifications = useMemo(
    () => notifications.filter(n => !hiddenIdSet.has(n.id)),
    [notifications, hiddenIdSet]
  );
  const hasAnyNotifications = visibleNotifications.length > 0;
  const unreadCount = useMemo(
    () => visibleNotifications.reduce(
      (count, notification) => count + (countsTowardUnreadNotificationBadges(notification) ? 1 : 0),
      0,
    ),
    [visibleNotifications]
  );
  const canRetry = Boolean(onRetry || onRefresh);

  const tabCounts = useMemo(() => {
    let requests = 0;
    let mentions = 0;
    let activity = 0;

    visibleNotifications.forEach((notification) => {
      if (!countsTowardUnreadNotificationBadges(notification)) return;
      if (notification.type === 'friend_request') {
        if (notification.status === 'pending') {
          requests += 1;
        } else {
          activity += 1;
        }
        return;
      }
      if (
        notification.type === 'activity' &&
        (notification.activityType === 'mention' || notification.activityType === 'reply')
      ) {
        mentions += 1;
        return;
      }
      if (notification.type === 'activity' || notification.type === 'announcement') {
        activity += 1;
      }
    });

    return { requests, mentions, activity };
  }, [visibleNotifications]);

  const tabItems = useMemo(
    () => [
      { key: 'requests' as const, label: 'Requests', count: tabCounts.requests },
      { key: 'mentions' as const, label: 'Mentions', count: tabCounts.mentions },
      { key: 'activity' as const, label: 'Activity', count: tabCounts.activity },
    ],
    [tabCounts]
  );

  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case 'requests':
        return visibleNotifications.filter(
          (n): n is FriendRequestNotification =>
            n.type === 'friend_request' && n.status === 'pending',
        );
      case 'mentions':
        return visibleNotifications.filter(
          (n): n is ActivityNotification =>
            n.type === 'activity' && (n.activityType === 'mention' || n.activityType === 'reply')
        );
      case 'activity':
      default:
        return visibleNotifications.filter(
          n =>
            (n.type === 'activity' && n.activityType !== 'mention' && n.activityType !== 'reply') ||
            n.type === 'announcement' ||
            (n.type === 'friend_request' && n.status !== 'pending')
        );
    }
  }, [activeTab, visibleNotifications]);

  const [undoItem, setUndoItem] = useState<{ id: string; timeout: ReturnType<typeof setTimeout> } | null>(null);
  const undoOpacity = useRef(new Animated.Value(0)).current;
  const attemptedProfileViewReadIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setHiddenIds(prev => prev.filter(id => notifications.some(n => n.id === id)));
  }, [notifications]);

  useEffect(() => {
    return () => {
      if (undoItem?.timeout) {
        clearTimeout(undoItem.timeout);
      }
    };
  }, [undoItem]);

  useEffect(() => {
    if (activeTab !== 'requests' && showAllFriendRequests) {
      setShowAllFriendRequests(false);
    }
  }, [activeTab, showAllFriendRequests]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!openProfileViewsOnMount) return;
    setShowProfileViews(true);
  }, [openProfileViewsOnMount]);

  const unreadProfileViewNotificationIds = useMemo(
    () => getUnreadProfileViewNotificationIds(visibleNotifications),
    [visibleNotifications],
  );

  const { showProfile, isPremiumUser } = useProfile();

  const { profileViewData, totalProfileViews } = useMemo(() => {
    const views = visibleNotifications.filter((n): n is ProfileViewNotification => n.type === 'profile_view');
    const total = views.reduce((acc, curr) => acc + curr.viewCount, 0);
    
    const mappedData: ProfileViewData[] = views.map(n => ({
      user: {
        id: n.viewer.id,
        name: n.viewer.name,
        username: n.viewer.name.toLowerCase().replace(/\s/g, ''),
        avatarUrl: n.viewer.avatar || '',
        age: 0,
        verified: false,
        country: '',
        bio: ''
      },
      viewedAt: n.createdAt,
      viewCount: n.viewCount
    }));

    return { profileViewData: mappedData, totalProfileViews: total };
  }, [visibleNotifications]);

  const { sections, hasMoreFriendRequests } = useMemo(() => {
    const sorted = [...filteredNotifications].sort((a, b) => b.createdAt - a.createdAt);
    const result: Array<{
      title: string;
      data: Notification[];
      type: 'friend_request' | 'activity';
    }> = [];

    if (activeTab === 'requests') {
      const allFriendRequests = sorted.filter(
        (n): n is FriendRequestNotification => n.type === 'friend_request'
      );
      const hasMore = allFriendRequests.length > 3;
      const friendRequests = showAllFriendRequests
        ? allFriendRequests
        : allFriendRequests.slice(0, 3);

      if (friendRequests.length > 0) {
        result.push({
          title: 'Requests',
          data: friendRequests,
          type: 'friend_request',
        });
      }

      return { sections: result, hasMoreFriendRequests: hasMore };
    }

    const rawActivity = sorted.filter(
      n =>
        n.type === 'announcement' ||
        (n.type === 'activity') ||
        (n.type === 'friend_request' && n.status !== 'pending')
    );

    const recentActivity: Notification[] = [];
    const latestGroupByKey = new Map<
      string,
      {
        index: number;
        newestTimestamp: number;
        totalCount: number;
        baseActorId: string;
        groupedActorIds: Set<string>;
        groupedActorNames: string[];
      }
    >();

    for (const n of rawActivity) {
      if (n.type !== 'activity' || !n.fromUser) {
        recentActivity.push(n);
        continue;
      }

      const groupKey = getActivityGroupingKey(n);
      const existingGroup = latestGroupByKey.get(groupKey);

      if (existingGroup && existingGroup.newestTimestamp - n.createdAt <= SIX_HOURS) {
        existingGroup.totalCount += 1;

        if (n.fromUser.id !== existingGroup.baseActorId && !existingGroup.groupedActorIds.has(n.fromUser.id)) {
          existingGroup.groupedActorIds.add(n.fromUser.id);
          existingGroup.groupedActorNames.push(n.fromUser.name);
        }

        const currentLead = recentActivity[existingGroup.index] as ActivityNotification;
        recentActivity[existingGroup.index] = {
          ...currentLead,
          groupCount: existingGroup.totalCount,
          groupedNames:
            existingGroup.groupedActorNames.length > 0 ? existingGroup.groupedActorNames : undefined,
        };
        continue;
      }

      const index = recentActivity.length;
      recentActivity.push(n);
      latestGroupByKey.set(groupKey, {
        index,
        newestTimestamp: n.createdAt,
        totalCount: 1,
        baseActorId: n.fromUser.id,
        groupedActorIds: new Set<string>(),
        groupedActorNames: [],
      });
    }

    const title = activeTab === 'mentions' ? 'Mentions' : 'Activity';
    if (recentActivity.length > 0) {
      result.push({
        title,
        data: recentActivity,
        type: 'activity',
      });
    }

    return { sections: result, hasMoreFriendRequests: false };
  }, [activeTab, filteredNotifications, showAllFriendRequests]);

  const emptyStateContent = useMemo(() => {
    if (!hasAnyNotifications) {
      return {
        title: 'Nothing new yet',
        subtitle: 'Friend requests, mentions, replies, and live activity will appear here once people interact with you.',
        ctaLabel: 'Explore live and activity',
      };
    }

    if (activeTab === 'requests') {
      return {
        title: 'No friend requests',
        subtitle: 'When someone wants to connect with you, this tab is where you will approve or decline it.',
        ctaLabel: 'Find people to follow',
      };
    }

    if (activeTab === 'mentions') {
      return {
        title: 'No mentions',
        subtitle: 'Replies, mentions, and direct activity that needs your attention will collect here.',
        ctaLabel: 'Join the conversation',
      };
    }

    return {
      title: 'No activity updates',
      subtitle: 'Announcements, profile views, accepted requests, and other account activity will show up here.',
      ctaLabel: 'Browse live activity',
    };
  }, [activeTab, hasAnyNotifications]);

  const runNotificationAction = useCallback(async (
    type: string,
    id: string,
    action: any,
    fallbackMessage: string
  ): Promise<boolean> => {
    if (!onNotificationAction) {
      return true;
    }

    try {
      await Promise.resolve(onNotificationAction(type, id, action));
      return true;
    } catch (actionError) {
      toast.error(getErrorMessage(actionError, fallbackMessage));
      return false;
    }
  }, [onNotificationAction]);

  useEffect(() => {
    if (!showProfileViews || unreadProfileViewNotificationIds.length === 0) {
      return;
    }

    const pendingIds = unreadProfileViewNotificationIds.filter((id) => {
      if (attemptedProfileViewReadIdsRef.current.has(id)) {
        return false;
      }
      attemptedProfileViewReadIdsRef.current.add(id);
      return true;
    });

    for (const notificationId of pendingIds) {
      void runNotificationAction(
        'mark_read',
        notificationId,
        null,
        "Couldn't mark profile views as read.",
      ).then((success) => {
        if (!success) {
          attemptedProfileViewReadIdsRef.current.delete(notificationId);
        }
      });
    }
  }, [runNotificationAction, showProfileViews, unreadProfileViewNotificationIds]);

  const handleRefresh = useCallback(async () => {
    setRefreshError(null);
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await onRefresh?.();
    } catch (refreshErr) {
      const message = getErrorMessage(refreshErr, "Couldn't refresh notifications. Pull to retry.");
      setRefreshError(message);
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleRetry = useCallback(async () => {
    const retry = onRetry ?? onRefresh;
    if (!retry) {
      return;
    }

    setRefreshError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await Promise.resolve(retry());
    } catch (retryErr) {
      toast.error(getErrorMessage(retryErr, "Couldn't load notifications. Please try again."));
    }
  }, [onRetry, onRefresh]);

  const handleAction = useCallback((type: string, id: string, action: any) => {
    if (shouldMarkNotificationReadBeforeNavigation(type, id, visibleNotifications)) {
      void runNotificationAction('mark_read', id, null, "Couldn't mark notification as read.");
    }
    void runNotificationAction(type, id, action, 'Action failed. Please try again.');
  }, [runNotificationAction, visibleNotifications]);

  const handleItemPress = useCallback((item: Notification) => {
    // Always mark as read if not already
    if (!item.read) {
      void runNotificationAction('mark_read', item.id, null, "Couldn't mark notification as read.");
    }

    switch (item.type) {
      case 'announcement':
        setSelectedAnnouncement(item);
        break;
        
      case 'friend_request':
        if (item.status === 'accepted') {
          // Construct a partial LiveUser for the profile modal
          showProfile({
            id: item.fromUser.id,
            name: item.fromUser.name,
            username: item.fromUser.name.toLowerCase().replace(/\s/g, ''),
            avatarUrl: item.fromUser.avatar || '',
            age: 0,
            verified: false,
            country: '',
            bio: ''
          });
        }
        break;

      case 'profile_view':
        if (!isPremiumUser) {
          setShowProfileViews(true);
          break;
        }

        showProfile({
          id: item.viewer.id,
          name: item.viewer.name,
          username: item.viewer.name.toLowerCase().replace(/\s/g, ''),
          avatarUrl: item.viewer.avatar || '',
          age: 0,
          verified: false,
          country: '',
          bio: '',
        });
        break;
        
      case 'activity':
        {
          const navigation = resolveActivityNotificationNavigation(item, 'open');
          if (navigation) {
            const fallbackMessage =
              navigation.type === 'open_live'
                ? "Couldn't open this live."
                : navigation.type === 'open_dm'
                  ? "Couldn't open this conversation."
                  : "Couldn't open this chat.";
            void runNotificationAction('navigation', item.id, navigation, fallbackMessage);
          }
        }
        break;
    }
  }, [isPremiumUser, runNotificationAction, showProfile]);

  const handleDelete = useCallback((id: string) => {
    setHiddenIds(prev => (prev.includes(id) ? prev : [...prev, id]));

    if (undoItem) {
      clearTimeout(undoItem.timeout);
      void (async () => {
        const success = await runNotificationAction('delete', undoItem.id, null, "Couldn't delete notification.");
        if (!success) {
          setHiddenIds(prev => prev.filter(x => x !== undoItem.id));
        }
      })();
    }

    Animated.timing(undoOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    const timeout = setTimeout(() => {
      void (async () => {
        const success = await runNotificationAction('delete', id, null, "Couldn't delete notification.");
        if (!success) {
          setHiddenIds(prev => prev.filter(x => x !== id));
        }
        Animated.timing(undoOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        setUndoItem(null);
      })();
    }, 4000);

    setUndoItem({ id, timeout });
  }, [runNotificationAction, undoItem, undoOpacity]);

  const handleUndo = useCallback(() => {
    if (undoItem) {
      clearTimeout(undoItem.timeout);
      setHiddenIds(prev => prev.filter(x => x !== undoItem.id));
      Animated.timing(undoOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      setUndoItem(null);
    }
  }, [undoItem, undoOpacity]);

  const handleMarkRead = useCallback((id: string) => {
    void runNotificationAction('mark_read', id, null, "Couldn't mark notification as read.");
  }, [runNotificationAction]);

  const handleClearAll = useCallback(() => {
    if (!onClearAll || unreadCount <= 0) {
      return;
    }

    void Promise.resolve(onClearAll()).catch((clearError) => {
      toast.error(getErrorMessage(clearError, "Couldn't mark all notifications as read."));
    });
  }, [onClearAll, unreadCount]);
  const handleTabChange = useCallback((tab: NotificationTab) => {
    setActiveTab(tab);
  }, []);

  const handleItemLongPress = useCallback((item: Notification) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete notification?',
      'You can undo this for a few seconds after deleting.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            handleDelete(item.id);
          },
        },
      ],
      { cancelable: true }
    );
  }, [handleDelete]);

  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setHeaderHeight(prevHeight => (prevHeight === nextHeight ? prevHeight : nextHeight));
  }, []);

  const hasInitialError = Boolean(error) && !loading && !hasAnyNotifications;

  return (
    <AppScreen noPadding style={styles.container}>
      {/* Header */}
      <View style={styles.header} onLayout={handleHeaderLayout}>
        <TopBar
          title="Notifications"
          variant="page"
          actions={
            <>
              <CurrencyPill
                icon="eye"
                label={formatTopCounterCount(totalProfileViews)}
                color={colors.accentPremium}
                onPress={() => setShowProfileViews(true)}
                accessibilityLabel={getProfileViewsPillAccessibilityLabel(
                  totalProfileViews,
                  unreadProfileViewNotificationIds.length,
                )}
                accessibilityHint="Opens the profile views list."
                showDot={unreadProfileViewNotificationIds.length > 0}
              />
              {onClearAll && unreadCount > 0 ? (
                <Pressable
                  style={styles.markAllPill}
                  onPress={handleClearAll}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Mark all notifications as read"
                >
                  <AppText style={styles.markAllPillText}>Mark all</AppText>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.settingsPill}
                onPress={() => setShowSettings(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Open notification settings"
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
              </Pressable>
            </>
          }
        />
      </View>

      
      {loading ? (
        <NotificationPageSkeleton />
      ) : hasInitialError ? (
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.accentDanger} />
          <AppText style={styles.errorTitle}>Unable to load notifications</AppText>
          <AppText style={styles.errorSubtext}>{error}</AppText>
          {canRetry ? (
            <Pressable style={styles.errorRetryBtn} onPress={() => { void handleRetry(); }}>
              <AppText style={styles.errorRetryText}>Try again</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.rowWrapper}>
              <NotificationItem 
                item={item} 
                onAction={handleAction}
                onPress={() => handleItemPress(item)}
                onLongPress={() => handleItemLongPress(item)}
              />
            </View>
          )}
          renderSectionHeader={({ section: { title } }) => (
            sections.length > 1 ? (
              <View style={styles.sectionHeader}>
                <AppText style={styles.sectionTitle}>{title}</AppText>
              </View>
            ) : null
          )}
          renderSectionFooter={({ section }) => {
            if (section.type === 'friend_request' && hasMoreFriendRequests && !showAllFriendRequests) {
              return (
                <Pressable 
                  style={styles.seeAllBtn}
                  onPress={() => setShowAllFriendRequests(true)}
                >
                  <AppText style={styles.seeAllText}>See all friend requests</AppText>
                  <Ionicons name="chevron-forward" size={16} color={colors.accentPrimary} />
                </Pressable>
              );
            }
            return null;
          }}
          ListHeaderComponent={
            <View>
              {refreshError ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.accentDanger} />
                  <AppText style={styles.errorBannerText} numberOfLines={2}>
                    {refreshError}
                  </AppText>
                  {onRefresh ? (
                    <Pressable onPress={() => { void handleRefresh(); }} hitSlop={8}>
                      <AppText style={styles.errorBannerAction}>Retry</AppText>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.tabBar}>
                {tabItems.map((tab) => {
                  const isActive = tab.key === activeTab;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => handleTabChange(tab.key)}
                      style={[styles.tabItem, isActive && styles.tabItemActive]}
                      accessibilityRole="tab"
                      accessibilityLabel={tab.label}
                      accessibilityState={{ selected: isActive }}
                    >
                      <AppText style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                        {tab.label}
                      </AppText>
                      {tab.count > 0 ? (
                        <View style={styles.tabBadge}>
                          <AppText style={styles.tabBadgeText}>{formatBadgeCount(tab.count)}</AppText>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={handleRefresh}
              tintColor={colors.accentPrimary}
            />
          }
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
              <AppText style={styles.emptyText}>{emptyStateContent.title}</AppText>
              <AppText style={styles.emptySubtext}>{emptyStateContent.subtitle}</AppText>
              {!hasAnyNotifications ? (
                <Pressable
                  style={styles.emptyCta}
                  onPress={() => {
                    void runNotificationAction('navigation', '', { type: 'explore' }, "Couldn't open Live Rooms.");
                  }}
                >
                  <AppText style={styles.emptyCtaText}>{emptyStateContent.ctaLabel}</AppText>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}

      {/* Profile Views Modal */}
      <ProfileViewsModal 
        visible={showProfileViews}
        onClose={() => setShowProfileViews(false)}
        totalViews={totalProfileViews}
        profileViewData={profileViewData}
        isPremiumUser={isPremiumUser}
      />

      {/* Announcement Modal */}
      <AnnouncementModal 
        visible={!!selectedAnnouncement}
        announcement={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
      />

      {/* Notification Settings Modal */}
      <NotificationSettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {undoItem && (
        <Animated.View style={[styles.undoToast, { opacity: undoOpacity }]}>
          <AppText style={styles.undoText}>Notification deleted</AppText>
          <Pressable onPress={handleUndo} hitSlop={8}>
            <AppText style={styles.undoAction}>Undo</AppText>
          </Pressable>
        </Animated.View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    zIndex: 10,
  },
  settingsPill: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markAllPill: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markAllPillText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xl * 2,
  },
  rowWrapper: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorSubtext: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorRetryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
  },
  errorRetryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentDanger,
    backgroundColor: colors.surface,
  },
  errorBannerText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  errorBannerAction: {
    color: colors.accentPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: spacing.smPlus,
  },
  emptyText: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    maxWidth: 320,
    lineHeight: 20,
  },
  emptyCta: {
    marginTop: spacing.lg,
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 24,
  },
  emptyCtaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.xxs,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
  },
  tabItemActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badgeNotificationBg,
  },
  tabBadgeText: {
    color: colors.badgeNotificationText,
    fontSize: 11,
    fontWeight: '700',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  seeAllText: {
    color: colors.accentPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
  },
  dropdownMenu: {
    position: 'absolute',
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    zIndex: 100,
    minWidth: 200,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  menuItemDisabled: {
    opacity: 0.55,
  },
  menuItemText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  menuItemTextDisabled: {
    color: colors.textMuted,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  undoToast: {
    position: 'absolute',
    bottom: 40,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  undoText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  undoAction: {
    color: colors.accentPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
