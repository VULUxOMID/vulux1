import { Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';

import { AppScreen, AppText, PageHeader, SectionCard } from '../src/components';
import { EditValueModal } from '../src/components/EditValueModal';
import { SettingsRow } from '../src/components/SettingsRow';
import { toast } from '../src/components/Toast';
import { useAuth } from '../src/context';
import { useUserProfile } from '../src/context/UserProfileContext';
import { colors, radius, spacing } from '../src/theme';
import { normalizeImageUri } from '../src/utils/imageSource';

type FieldType = 'username' | 'name' | null;
type FieldValidator = (value: string) => string | null;
type ModalConfig = {
  title: string;
  initialValue: string;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  validate?: FieldValidator;
};

export default function AccountScreen() {
  const router = useRouter();
  const { user, initializing, deleteUserAccount } = useAuth();
  const { userProfile, updateUserProfile } = useUserProfile();

  if (!initializing && !user) {
    return <Redirect href="/(auth)/login" />;
  }

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
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update');
      throw error;
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Deactivate Account',
      'This will mark your account as deactivated and sign you out. Contact support if you need permanent deletion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUserAccount();
              router.replace('/');
            } catch (error: any) {
              toast.error(error.message || 'Failed to deactivate your account.');
            }
          },
        },
      ]
    );
  };

  const getModalProps = (): ModalConfig => {
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
      default:
        return { title: '', initialValue: '', validate: undefined };
    }
  };

  const modalProps = getModalProps();

  return (
    <AppScreen noPadding style={styles.container}>
      <View style={styles.headerWrap}>
        <PageHeader
          eyebrow="Identity"
          title="Account"
          subtitle="Manage the profile details tied to your Vulu account."
          onBack={() => router.back()}
        />
      </View>

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

        <SectionCard title="Account information" subtitle="Core identity and contact details.">
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
              onPress={() => toast.info('Email changes are not available in this build.')}
              showArrow={false}
            />
            <SettingsRow
              label="Phone"
              icon="call-outline"
              value={displayPhone}
              onPress={() => toast.info('Phone number cannot be changed currently.')}
              showArrow={false}
            />
        </SectionCard>

        <SectionCard title="Sign-in methods" subtitle="Authentication and password access.">
            <SettingsRow
              label="Password"
              icon="lock-closed-outline"
              onPress={() => toast.info('Password changes are not available in this build.')}
              showArrow={false}
            />
        </SectionCard>

        <SectionCard title="People" subtitle="Moderation and blocked user controls.">
            <SettingsRow
              label="Blocked Users"
              icon="remove-circle-outline"
              onPress={() => router.push('/blocked-users')}
            />
        </SectionCard>

        <View style={styles.deleteSection}>
          <SectionCard title="Danger zone" subtitle="Sensitive account actions.">
            <SettingsRow
              label="Deactivate Account"
              icon="trash-outline"
              onPress={handleDeleteAccount}
              variant="destructive"
              showArrow={false}
            />
          </SectionCard>
        </View>
      </ScrollView>

      <EditValueModal
        visible={!!editingField}
        title={modalProps.title}
        initialValue={modalProps.initialValue}
        placeholder={modalProps.placeholder}
        keyboardType={modalProps.keyboardType || 'default'}
        secureTextEntry={false}
        autoCapitalize={
          editingField === 'username'
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
  },
  headerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  deleteSection: {
    paddingBottom: spacing.md,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 17, 19, 0.9)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  avatarUsername: {
    fontSize: 14,
    color: colors.accentPrimary,
  },
});
