import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
    Image,
} from 'react-native';

import { AppScreen, AppText } from '../src/components';
import { useAuth as useSessionAuth } from '../src/auth/spacetimeSession';
import { useUserProfile } from '../src/context/UserProfileContext';
import { useSocialRepo } from '../src/data/provider';
import { colors, radius, spacing } from '../src/theme';

export default function SetStatusScreen() {
    const router = useRouter();
    const { userId } = useSessionAuth();
    const socialRepo = useSocialRepo();
    const { userProfile, updateUserProfile } = useUserProfile();
    const [statusMessage, setStatusMessage] = useState(userProfile.statusMessage || '');

    const handleSave = () => {
        const trimmedMessage = statusMessage.trim();
        const nextStatusMessage = trimmedMessage.length > 0 ? trimmedMessage : undefined;
        const nextPresenceStatus = userProfile.presenceStatus;

        updateUserProfile({
            presenceStatus: nextPresenceStatus,
            statusMessage: nextStatusMessage,
        });

        if (userId) {
            void socialRepo.updateUserStatus({
                userId,
                status: nextPresenceStatus,
                statusText: nextStatusMessage,
            }).catch((error) => {
                if (__DEV__) {
                    console.warn('[profile] Failed to persist status message', error);
                }
            });
        }

        router.back();
    };

    const currentPhoto = userProfile.avatarUrl || userProfile.photos[0]?.uri;

    return (
        <AppScreen>
            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.headerButton}>
                        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                    </Pressable>
                    <AppText variant="h3" style={styles.headerTitle}>Set Status</AppText>
                    <Pressable onPress={handleSave} style={styles.saveButton}>
                        <AppText style={styles.saveButtonText}>Save</AppText>
                    </Pressable>
                </View>

                {/* Main Content Area */}
                <View style={styles.contentContainer}>
                    {/* User Info Section */}
                    <View style={styles.userInfoSection}>
                        <View style={styles.avatarContainer}>
                            {currentPhoto ? (
                                <Image source={{ uri: currentPhoto }} style={styles.avatar} />
                            ) : (
                                <View style={[styles.avatar, styles.avatarPlaceholder]} />
                            )}
                        </View>
                        <AppText variant="h2" style={styles.displayName}>{userProfile.name}</AppText>
                        <AppText variant="small" secondary style={styles.username}>@{userProfile.username}</AppText>
                    </View>

                    {/* Status Input Section */}
                    <View style={styles.inputSection}>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.textInput}
                                value={statusMessage}
                                onChangeText={setStatusMessage}
                                placeholder="What's on your mind?"
                                placeholderTextColor={colors.textMuted}
                                multiline
                                autoFocus
                                maxLength={80}
                                returnKeyType="done"
                                onSubmitEditing={handleSave}
                                selectionColor={colors.accentPrimary}
                            />
                            <View style={styles.characterCountContainer}>
                                <AppText variant="micro" style={[
                                    styles.characterCount,
                                    statusMessage.length >= 80 ? styles.characterCountLimit : undefined
                                ]}>
                                    {statusMessage.length}/80
                                </AppText>
                            </View>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </AppScreen>
    );
}

const styles = StyleSheet.create({
    keyboardAvoidingView: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderSubtle,
        backgroundColor: colors.surface,
        zIndex: 10,
    },
    headerButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: -8,
    },
    headerTitle: {
        color: colors.textPrimary,
        fontWeight: '600',
    },
    saveButton: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
    },
    saveButtonText: {
        color: colors.accentPrimary,
        fontWeight: '600',
        fontSize: 16,
    },
    contentContainer: {
        flex: 1,
        paddingTop: spacing.xxl,
        paddingHorizontal: spacing.lg,
    },
    userInfoSection: {
        alignItems: 'center',
        marginBottom: spacing.xl,
    },
    avatarContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        marginBottom: spacing.md,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: colors.borderSubtle,
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 50,
    },
    avatarPlaceholder: {
        backgroundColor: colors.surfaceAlt,
    },
    displayName: {
        marginBottom: spacing.xxs,
        textAlign: 'center',
    },
    username: {
        textAlign: 'center',
    },
    inputSection: {
        width: '100%',
    },
    inputWrapper: {
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
        minHeight: 120,
    },
    textInput: {
        color: colors.textPrimary,
        fontSize: 18,
        minHeight: 80,
        textAlignVertical: 'top',
        lineHeight: 24,
    },
    characterCountContainer: {
        alignItems: 'flex-end',
        marginTop: spacing.xs,
    },
    characterCount: {
        color: colors.textMuted,
    },
    characterCountLimit: {
        color: colors.accentDanger,
    },
});
