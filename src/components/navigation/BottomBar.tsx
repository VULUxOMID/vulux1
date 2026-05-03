import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
          height: NAV_BAR_HEIGHT + 16,
          bottom: insets.bottom > 0 ? Math.max(insets.bottom - 10, 10) : 10,
          paddingBottom: 0,
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(18, 18, 20, 0.96)', 'rgba(8, 8, 10, 0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backdrop}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Home"
        onPress={() => {
          if (isHome) {
            emitHomeScrollTop();
            return;
          }
          router.replace('/(tabs)');
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
          router.replace('/(tabs)/notifications');
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
          router.replace('/(tabs)/messages');
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
          router.replace('/(tabs)/profile');
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
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 12, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.xsPlus,
    overflow: 'hidden',
    zIndex: 20,
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  iconButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.smPlus,
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  iconWrapperInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  iconWrapperActive: {
    backgroundColor: 'rgba(0, 230, 118, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.42)',
    shadowColor: colors.accentPrimary,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
  },
  avatarWrapperInactive: {
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  avatarWrapperActive: {
    borderColor: 'rgba(0, 230, 118, 0.46)',
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    shadowColor: colors.accentPrimary,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    padding: 0,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0B0B0D',
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
    height: NAV_BAR_HEIGHT + 8,
    width: '100%',
  },
  activeDot: {
    position: 'absolute',
    bottom: 0,
    width: 22,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    shadowColor: colors.accentPrimary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
