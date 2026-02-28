import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_BAR_HEIGHT } from './layoutConstants';
import { emitHomeScrollTop } from '../../services/uiEvents';
import { colors, radius, spacing } from '../../theme';
import { useUserProfile } from '../../context/UserProfileContext';

type BottomBarProps = {
  homeBadgeCount?: number;
  notificationsBadgeCount?: number;
  messagesBadgeCount?: number;
  userStatus?: 'online' | 'busy' | 'offline';
  avatarUri?: string | null;
};

const STATUS_COLOR: Record<NonNullable<BottomBarProps['userStatus']>, string> = {
  online: colors.accentSuccess,
  busy: colors.accentDanger,
  offline: colors.textMuted,
};

export function BottomBar({
  homeBadgeCount = 0,
  notificationsBadgeCount = 0,
  messagesBadgeCount = 0,
  userStatus,
  avatarUri,
}: BottomBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { userProfile } = useUserProfile();

  // Use userProfile avatar if no avatarUri prop is provided
  const normalizedAvatar = (avatarUri ?? userProfile.avatarUrl ?? '').trim();
  const displayAvatar = normalizedAvatar.length > 0 ? normalizedAvatar : null;
  const resolvedStatus = userStatus ?? userProfile.presenceStatus;

  const isHome = pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/';
  const homeActive = isHome;
  const notificationsActive =
    pathname === '/notifications' ||
    pathname.startsWith('/notifications/') ||
    pathname.startsWith('/(tabs)/notifications');
  const messagesActive =
    pathname === '/messages' ||
    pathname.startsWith('/messages/') ||
    pathname.startsWith('/(tabs)/messages');
  const profileActive =
    pathname === '/profile' || pathname.startsWith('/profile/') || pathname.startsWith('/(tabs)/profile');

  return (
    <View
      style={[
        styles.container,
        {
          height: NAV_BAR_HEIGHT + 8,
          bottom: insets.bottom > 0 ? insets.bottom - 16 : 8,
          paddingBottom: 0,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Home"
        onPress={() => {
          if (isHome) {
            emitHomeScrollTop();
            return;
          }
          router.push('/(tabs)');
        }}
        style={styles.iconButton}
      >
        <View style={styles.tabColumn}>
          <View
            style={[
              styles.iconWrapper,
              homeActive ? styles.iconWrapperActive : styles.iconWrapperInactive,
            ]}
          >
            <Ionicons
              name="home"
              size={24}
              color={homeActive ? colors.textPrimary : colors.textMuted}
            />
            {homeBadgeCount > 0 ? <Badge count={homeBadgeCount} /> : null}
          </View>
          {homeActive && <View style={styles.activeDot} />}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        onPress={() => {
          router.push('/(tabs)/notifications');
        }}
        style={styles.iconButton}
      >
        <View style={styles.tabColumn}>
          <View
            style={[
              styles.iconWrapper,
              notificationsActive ? styles.iconWrapperActive : styles.iconWrapperInactive,
            ]}
          >
            <Ionicons
              name="notifications-outline"
              size={24}
              color={notificationsActive ? colors.textPrimary : colors.textMuted}
            />
            {notificationsBadgeCount > 0 ? <Badge count={notificationsBadgeCount} /> : null}
          </View>
          {notificationsActive && <View style={styles.activeDot} />}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Messages"
        onPress={() => {
          router.push('/(tabs)/messages');
        }}
        style={styles.iconButton}
      >
        <View style={styles.tabColumn}>
          <View
            style={[
              styles.iconWrapper,
              messagesActive ? styles.iconWrapperActive : styles.iconWrapperInactive,
            ]}
          >
            <Ionicons
              name="chatbubbles"
              size={24}
              color={messagesActive ? colors.textPrimary : colors.textMuted}
            />
            {messagesBadgeCount > 0 ? <Badge count={messagesBadgeCount} /> : null}
          </View>
          {messagesActive && <View style={styles.activeDot} />}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile"
        onPress={() => {
          router.push('/(tabs)/profile');
        }}
        style={styles.iconButton}
      >
        <View style={styles.tabColumn}>
          <View
            style={[
              styles.avatarContainer,
              profileActive ? styles.avatarWrapperActive : styles.avatarWrapperInactive,
            ]}
          >
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[resolvedStatus] }]} />
          </View>
          {profileActive && <View style={styles.activeDot} />}
        </View>
      </Pressable>
    </View>
  );
}

function Badge({ count }: { count: number }) {
  const label = count > 99 ? '99+' : String(count);
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.full,
    zIndex: 20,
  },
  iconButton: {
    padding: spacing.sm,
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
  },
  iconWrapperInactive: {
    backgroundColor: 'transparent',
  },
  iconWrapperActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
  },
  avatarContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarWrapperInactive: {
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  avatarWrapperActive: {
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    padding: 0,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 17,
  },
  avatarPlaceholder: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.badgeNotificationBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.badgeNotificationText,
    fontSize: 9,
    fontWeight: '700',
  },
  tabColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: NAV_BAR_HEIGHT,
  },
  activeDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textPrimary,
  },
});
