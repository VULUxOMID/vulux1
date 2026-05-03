import { Redirect, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppScreen, AppText, PageHeader, SectionCard } from '../src/components';
import { SettingsRow } from '../src/components/SettingsRow';
import { useAuth } from '../src/context';
import { colors, spacing } from '../src/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, initializing, signOut } = useAuth();

  if (!initializing && !user) {
    return <Redirect href="/(auth)/login" />;
  }

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace('/(auth)');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <AppScreen noPadding style={styles.container}>
      <View style={styles.headerWrap}>
        <PageHeader
          eyebrow="Preferences"
          title="Settings"
          subtitle="Tune your account, alerts, and app behavior."
          onBack={() => router.back()}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <SectionCard title="Account information" subtitle="Identity and account-level settings.">
            <SettingsRow
              label="Account"
              icon="person-outline"
              onPress={() => router.push('/account')}
            />
        </SectionCard>

        <SectionCard title="App settings" subtitle="Notifications and product-level controls.">
            <SettingsRow
              label="Notification"
              icon="notifications-outline"
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/notifications',
                })
              }
            />
        </SectionCard>

        <View style={styles.logoutSection}>
          <SectionCard title="Session" subtitle="Sign out from this device.">
            <SettingsRow
              label="Sign Out"
              icon="log-out-outline"
              onPress={handleLogout}
              variant="destructive"
              showArrow={false}
              labelStyle={styles.logoutLabel}
              rightElement={null}
            />
          </SectionCard>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  sectionTitle: {
    color: colors.textMuted,
    marginLeft: spacing.sm,
    marginBottom: spacing.xs,
  },
  logoutSection: {
    paddingBottom: spacing.xxl,
  },
  logoutLabel: {
    fontWeight: 'bold',
  },
});
