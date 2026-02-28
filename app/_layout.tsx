import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { SpacetimeAuthProvider } from '../src/auth/spacetimeSession';

import { colors } from '../src/theme';
import { AuthProvider, WalletProvider, FriendsProvider } from '../src/context';
import { LiveProvider } from '../src/context/LiveContext';
import { ProfileProvider } from '../src/context/ProfileContext';
import { UserProfileProvider } from '../src/context/UserProfileContext';
import { AdminProvider } from '../src/features/admin/hooks/useAdminAuth';
import { MusicProvider } from '../src/features/music/context/MusicContext';
import { VideoProvider } from '../src/context/VideoContext';
import { LiveOverlay } from '../src/features/home/LiveOverlay';
import { ProfileModal } from '../src/components/ProfileModal';
import { TrackActionMenu } from '../src/features/music/components/TrackActionMenu';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ToastProvider } from '../src/components/ToastProvider';
import { SpacetimeDebugBadge } from '../src/components/SpacetimeDebugBadge';
import { DataProvider } from '../src/data/provider';

export default function RootLayout() {
  const showSpacetimeDebugBadge =
    __DEV__ ||
    (process.env.EXPO_PUBLIC_SHOW_SPACETIME_DEBUG?.trim().toLowerCase() ?? 'false') === 'true';

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={colors.background} />
      <SpacetimeAuthProvider>
        <ErrorBoundary>
          <ToastProvider>
            <DataProvider>
              <AuthProvider>
                <WalletProvider>
                  <FriendsProvider>
                    <LiveProvider>
                      <ProfileProvider>
                        <UserProfileProvider>
                          <AdminProvider>
                            <VideoProvider>
                              <MusicProvider>
                                <View style={styles.container}>
                                  <Stack screenOptions={{ headerShown: false }}>
                                    <Stack.Screen name="(auth)" />
                                    <Stack.Screen name="(tabs)" />
                                    <Stack.Screen
                                      name="live"
                                      options={{
                                        presentation: 'transparentModal',
                                        animation: 'none',
                                        headerShown: false,
                                        animationDuration: 150,
                                      }}
                                    />
                                    <Stack.Screen
                                      name="video/[id]"
                                      options={{
                                        presentation: 'transparentModal',
                                        animation: 'fade',
                                        headerShown: false,
                                        animationDuration: 180,
                                        contentStyle: { backgroundColor: 'transparent' },
                                      }}
                                    />
                                  </Stack>
                                  {showSpacetimeDebugBadge ? <SpacetimeDebugBadge /> : null}
                                  <LiveOverlay />
                                  <ProfileModal />
                                  <TrackActionMenu />
                                </View>
                              </MusicProvider>
                            </VideoProvider>
                          </AdminProvider>
                        </UserProfileProvider>
                      </ProfileProvider>
                    </LiveProvider>
                  </FriendsProvider>
                </WalletProvider>
              </AuthProvider>
            </DataProvider>
          </ToastProvider>
        </ErrorBoundary>
      </SpacetimeAuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
