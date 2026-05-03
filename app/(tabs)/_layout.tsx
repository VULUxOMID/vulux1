import { Redirect, Tabs, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/auth/clerkSession';

import { BottomBar } from '../../src/components/navigation/BottomBar';
import { FloatingMenuButton } from '../../src/components/navigation/FloatingMenuButton';
import { useBottomBarBadgeCounts } from '../../src/components/navigation/useBottomBarBadgeCounts';
import { useUserProfile } from '../../src/context/UserProfileContext';
import { AuthLoadingScreen } from '../../src/features/auth/AuthLoadingScreen';
import {
  isVuluOnboardingComplete,
  shouldSkipVuluOnboardingForQa,
} from '../../src/features/auth/onboardingState';
import { MiniPlayer } from '../../src/features/music/components/MiniPlayer';
import { FullPlayer } from '../../src/features/music/components/FullPlayer';

export default function TabsLayout() {
  const params = useLocalSearchParams<{ preview?: string | string[] }>();
  const {
    isLoaded: isAuthLoaded,
    hasSession,
    isSignedIn,
    needsVerification,
  } = useAuth();
  const { isProfileReady, userProfile } = useUserProfile();
  const { notificationsBadgeCount, messagesBadgeCount } = useBottomBarBadgeCounts();
  const hasPendingSession = hasSession && !isSignedIn && !needsVerification;
  const hasActiveSession = isSignedIn;
  const shouldSkipOnboarding = shouldSkipVuluOnboardingForQa();
  const needsOnboarding =
    hasActiveSession && !shouldSkipOnboarding && !isVuluOnboardingComplete(userProfile);
  const isPreview =
    __DEV__ &&
    (params.preview === '1' ||
      params.preview === 'true' ||
      (Array.isArray(params.preview) && params.preview.includes('1')));

  if (isPreview) {
    return (
      <>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: { display: 'none' },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="play" options={{ title: 'Play' }} />
          <Tabs.Screen name="videos" options={{ title: 'Videos' }} />
          <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
          <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
          <Tabs.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        </Tabs>

        <MiniPlayer />
        <FullPlayer />
        <BottomBar
          notificationsBadgeCount={notificationsBadgeCount}
          messagesBadgeCount={messagesBadgeCount}
        />
        <FloatingMenuButton />
      </>
    );
  }

  if (!isAuthLoaded) {
    return (
      <AuthLoadingScreen
        title="Opening Vulu"
        detail="Checking your session."
      />
    );
  }

  if (isAuthLoaded && hasSession && needsVerification) {
    return <Redirect href="/onboarding" />;
  }

  if (hasPendingSession && !isVuluOnboardingComplete(userProfile)) {
    return <Redirect href="/onboarding" />;
  }

  if (hasActiveSession && !isProfileReady) {
    return (
      <AuthLoadingScreen
        title="Opening Vulu"
        detail="Preparing your profile."
      />
    );
  }

  if (needsOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  if (isAuthLoaded && !hasActiveSession) {
    if (!hasSession) {
      return <Redirect href="/onboarding" />;
    }
    if (!isVuluOnboardingComplete(userProfile)) {
      return <Redirect href="/onboarding" />;
    }
    // Signed in with Clerk but Railway not ready (e.g. edge unreachable): allow main app if onboarding is done.
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="play" options={{ title: 'Play' }} />
        <Tabs.Screen name="videos" options={{ title: 'Videos' }} />
        <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
        <Tabs.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>

      <MiniPlayer />
      <FullPlayer />
      <BottomBar
        notificationsBadgeCount={notificationsBadgeCount}
        messagesBadgeCount={messagesBadgeCount}
      />
      <FloatingMenuButton />
    </>
  );
}
