import { Stack } from 'expo-router';

import { BottomBar } from '../../src/components/navigation/BottomBar';
import { FloatingMenuButton } from '../../src/components/navigation/FloatingMenuButton';
import { useBottomBarBadgeCounts } from '../../src/components/navigation/useBottomBarBadgeCounts';

export default function PostsLayout() {
  const { notificationsBadgeCount, messagesBadgeCount } = useBottomBarBadgeCounts();

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <BottomBar
        notificationsBadgeCount={notificationsBadgeCount}
        messagesBadgeCount={messagesBadgeCount}
      />
      <FloatingMenuButton />
    </>
  );
}
