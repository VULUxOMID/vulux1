import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppScreen, AppText } from '../src/components';
import { SettingsRow } from '../src/components/SettingsRow';
import { useAuth } from '../src/context';
import { colors, spacing } from '../src/theme';

function SettingsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backButton} hitSlop={12}>
        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
      </Pressable>
      <AppText variant="h3" style={styles.headerTitle}>{title}</AppText>
      <View style={styles.headerRight} />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

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
      <SettingsHeader 
        title="Settings" 
        onBack={() => router.back()} 
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <AppText variant="small" style={styles.sectionTitle}>
            Account Information
          </AppText>
          <View style={styles.sectionContent}>
            <SettingsRow
              label="Account"
              icon="person-outline"
              onPress={() => router.push('/account')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="small" style={styles.sectionTitle}>
            App settings
          </AppText>
          <View style={styles.sectionContent}>
            <SettingsRow
              label="Notification"
              icon="notifications-outline"
              onPress={() => console.log('Notifications')}
            />
          </View>
        </View>

        <View style={styles.logoutSection}>
          <View style={styles.sectionContent}>
            <SettingsRow
              label="Sign Out"
              icon="log-out-outline"
              onPress={handleLogout}
              variant="destructive"
              showArrow={false}
              labelStyle={styles.logoutLabel}
              rightElement={null}
            />
          </View>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  backButton: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  headerRight: {
    width: 32, // Balance back button
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    marginLeft: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionContent: {
    backgroundColor: colors.surface,
    borderRadius: spacing.md,
    overflow: 'hidden',
  },
  logoutSection: {
    marginTop: spacing.xl,
  },
  logoutLabel: {
    fontWeight: 'bold',
  },
});
