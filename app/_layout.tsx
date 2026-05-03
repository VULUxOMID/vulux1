import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { ClerkSessionProvider } from '../src/auth/clerkSession';

import { colors } from '../src/theme';
import { AuthProvider, WalletProvider, FriendsProvider } from '../src/context';
import { LiveProvider } from '../src/context/LiveContext';
import { ProfileProvider } from '../src/context/ProfileContext';
import { UserProfileProvider } from '../src/context/UserProfileContext';
import { MusicProvider } from '../src/features/music/context/MusicContext';
import { VideoProvider } from '../src/context/VideoContext';
import { LiveOverlay } from '../src/features/home/LiveOverlay';
import { ProfileModal } from '../src/components/ProfileModal';
import { TrackActionMenu } from '../src/features/music/components/TrackActionMenu';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ToastProvider } from '../src/components/ToastProvider';
import { DataProvider } from '../src/data/provider';
import { PostsProvider } from '../src/features/posts/PostsContext';
import { DemoProvider } from '../src/features/demo/DemoContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={colors.background} />
      <ClerkSessionProvider>
        <ErrorBoundary>
          <ToastProvider>
            <DemoProvider>
              <DataProvider>
                <PostsProvider>
                  <AuthProvider>
                    <WalletProvider>
                      <FriendsProvider>
                        <LiveProvider>
                          <ProfileProvider>
                            <UserProfileProvider>
                              <VideoProvider>
                                <MusicProvider>
                                  <View style={styles.container}>
                                    <Stack screenOptions={{ headerShown: false }}>
                                      <Stack.Screen name="(auth)" />
                                      <Stack.Screen name="(tabs)" />
                                      <Stack.Screen name="demo" />
                                      <Stack.Screen
                                        name="live"
                                        options={{
                                          presentation: 'card',
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
                                    <LiveOverlay />
                                    <ProfileModal />
                                    <TrackActionMenu />
                                  </View>
                                </MusicProvider>
                              </VideoProvider>
                            </UserProfileProvider>
                          </ProfileProvider>
                        </LiveProvider>
                      </FriendsProvider>
                    </WalletProvider>
                  </AuthProvider>
                </PostsProvider>
              </DataProvider>
            </DemoProvider>
          </ToastProvider>
        </ErrorBoundary>
      </ClerkSessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
