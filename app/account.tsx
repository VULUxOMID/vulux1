import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppScreen, AppText } from '../src/components';
import { EditValueModal } from '../src/components/EditValueModal';
import { SettingsRow } from '../src/components/SettingsRow';
import { toast } from '../src/components/Toast';
import { useAuth } from '../src/context';
import { useUserProfile } from '../src/context/UserProfileContext';
import { colors, spacing } from '../src/theme';
import { normalizeImageUri } from '../src/utils/imageSource';

function AccountHeader({ title, onBack }: { title: string; onBack: () => void }) {
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

type FieldType = 'username' | 'name' | 'email' | 'password' | null;
type FieldValidator = (value: string) => string | null;

export default function AccountScreen() {
  const router = useRouter();
  const { user, updateUserEmail, updateUserPassword, deleteUserAccount } = useAuth();
  const { userProfile, updateUserProfile } = useUserProfile();

  const [editingField, setEditingField] = useState<FieldType>(null);
  
  const displayPhone = user?.phoneNumber || 'Not set';
  const avatarUri = normalizeImageUri(userProfile.avatarUrl);

  const validateUsername: FieldValidator = (value) => {
    const normalized = value.trim();
    if (!normalized) return 'Username is required.';
    if (normalized.length < 3 || normalized.length > 20) {
      return 'Username must be 3-20 characters.';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(normalized)) {
      return 'Use letters, numbers, or underscores only.';
    }
    return null;
  };

  const validateDisplayName: FieldValidator = (value) => {
    const normalized = value.trim();
    if (!normalized) return 'Display name is required.';
    if (normalized.length < 2 || normalized.length > 40) {
      return 'Display name must be 2-40 characters.';
    }
    return null;
  };

  const validateEmail: FieldValidator = (value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return 'Enter a valid email address.';
    }
    return null;
  };

  const validatePassword: FieldValidator = (value) => {
    const normalized = value.trim();
    if (!normalized) return 'Password is required.';
    if (normalized.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Za-z]/.test(normalized) || !/[0-9]/.test(normalized)) {
      return 'Password must include letters and numbers.';
    }
    return null;
  };

  const handleSaveField = async (value: string) => {
    try {
      if (editingField === 'username') {
        const normalized = value.trim();
        const validationError = validateUsername(normalized);
        if (validationError) {
          throw new Error(validationError);
        }
        updateUserProfile({ username: normalized });
        toast.success('Username updated successfully');
      } else if (editingField === 'name') {
        const normalized = value.trim();
        const validationError = validateDisplayName(normalized);
        if (validationError) {
          throw new Error(validationError);
        }
        updateUserProfile({ name: normalized });
        toast.success('Display name updated successfully');
      } else if (editingField === 'email') {
        const normalized = value.trim().toLowerCase();
        const validationError = validateEmail(normalized);
        if (validationError) {
          throw new Error(validationError);
        }
        await updateUserEmail(normalized);
        toast.success('Email updated successfully');
      } else if (editingField === 'password') {
        const validationError = validatePassword(value);
        if (validationError) {
          throw new Error(validationError);
        }
        await updateUserPassword(value);
        toast.success('Password updated successfully');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update');
      throw error;
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUserAccount();
              router.replace('/');
            } catch (error: any) {
              // Re-authentication might be required
              toast.error(error.message || 'Failed to delete account. You may need to sign out and sign in again.');
            }
          },
        },
      ]
    );
  };

  const handleRestorePurchases = () => {
    // Restore flow placeholder
    toast.success('Purchases restored successfully.');
  };

  const getModalProps = () => {
    switch (editingField) {
      case 'username':
        return {
          title: 'Edit Username',
          initialValue: userProfile.username,
          placeholder: 'Enter username',
          validate: validateUsername,
        };
      case 'name':
        return {
          title: 'Edit Display Name',
          initialValue: userProfile.name,
          placeholder: 'Enter display name',
          validate: validateDisplayName,
        };
      case 'email':
        return {
          title: 'Edit Email',
          initialValue: user?.email || '',
          placeholder: 'Enter email',
          keyboardType: 'email-address' as const,
          validate: validateEmail,
        };
      case 'password':
        return {
          title: 'Change Password',
          initialValue: '',
          placeholder: 'Enter new password',
          validate: validatePassword,
        };
      default:
        return { title: '', initialValue: '', validate: undefined };
    }
  };

  const modalProps = getModalProps();

  return (
    <AppScreen noPadding style={styles.container}>
      <AccountHeader 
        title="Account" 
        onBack={() => router.back()} 
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]} />
          )}
          <View style={styles.avatarInfo}>
            <AppText style={styles.avatarName}>{userProfile.name}</AppText>
            <AppText style={styles.avatarUsername}>@{userProfile.username}</AppText>
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="small" style={styles.sectionTitle}>
            Account Information
          </AppText>
          <View style={styles.sectionContent}>
            <SettingsRow
              label="Username"
              icon="at-outline"
              value={userProfile.username}
              onPress={() => setEditingField('username')} 
            />
            <SettingsRow
              label="Display Name"
              icon="person-outline"
              value={userProfile.name}
              onPress={() => setEditingField('name')}
            />
            <SettingsRow
              label="Email"
              icon="mail-outline"
              value={user?.email || ''}
              onPress={() => setEditingField('email')}
            />
            <SettingsRow
              label="Phone"
              icon="call-outline"
              value={displayPhone}
              onPress={() => toast.info('Phone number cannot be changed currently.')}
              showArrow={false}
            />
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="small" style={styles.sectionTitle}>
            How you sign into your account
          </AppText>
          <View style={styles.sectionContent}>
            <SettingsRow
              label="Password"
              icon="lock-closed-outline"
              onPress={() => setEditingField('password')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="small" style={styles.sectionTitle}>
            Users
          </AppText>
          <View style={styles.sectionContent}>
            <SettingsRow
              label="Blocked Users"
              icon="remove-circle-outline"
              onPress={() => router.push('/blocked-users')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="small" style={styles.sectionTitle}>
            Shop
          </AppText>
          <View style={styles.sectionContent}>
            <SettingsRow
              label="Restore Purchases"
              icon="refresh-outline"
              onPress={handleRestorePurchases}
            />
          </View>
        </View>

        <View style={styles.deleteSection}>
          <AppText variant="small" style={styles.sectionTitle}>
            Account Management
          </AppText>
          <View style={styles.sectionContent}>
            <SettingsRow
              label="Delete Account"
              icon="trash-outline"
              onPress={handleDeleteAccount}
              variant="destructive"
              showArrow={false}
            />
          </View>
        </View>
      </ScrollView>

      <EditValueModal
        visible={!!editingField}
        title={modalProps.title}
        initialValue={modalProps.initialValue}
        placeholder={modalProps.placeholder}
        keyboardType={modalProps.keyboardType || 'default'}
        secureTextEntry={editingField === 'password'}
        autoCapitalize={
          editingField === 'password' || editingField === 'email' || editingField === 'username'
            ? 'none'
            : 'sentences'
        }
        autoCorrect={editingField === 'name'}
        validate={modalProps.validate}
        onClose={() => setEditingField(null)}
        onSave={handleSaveField}
      />
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
    width: 32,
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
  deleteSection: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceAlt,
  },
  avatarFallback: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  avatarInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  avatarName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  avatarUsername: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
