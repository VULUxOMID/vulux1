import React, { useMemo, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppScreen, AppText, Avatar } from '../../src/components';
import { useFriends } from '../../src/context';
import { colors, radius, spacing, typography } from '../../src/theme';
import { hapticTap, hapticSuccess } from '../../src/utils/haptics';
import { toast } from '../../src/components/Toast';
import { useAuth } from '../../src/auth/clerkSession';
import { createGroupChatRoom } from '../../src/features/messages/groupChatApi';

export default function NewGroupScreen() {
    const router = useRouter();
    const { userId } = useAuth();
    const { friends, loading: friendsLoading } = useFriends();
    const [searchQuery, setSearchQuery] = useState('');
    const [groupTitle, setGroupTitle] = useState('');
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Group friends by the first letter of their name for alphabetical sectioning (if desired later),
    // but for now we just filter based on search query.
    const filteredFriends = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return friends;
        return friends.filter(
            (f) =>
                f.name.toLowerCase().includes(q) ||
                (f.username && f.username.toLowerCase().includes(q)),
        );
    }, [friends, searchQuery]);

    const selectedFriends = useMemo(() => {
        return friends.filter((f) => selectedUserIds.has(f.id));
    }, [friends, selectedUserIds]);

    const toggleUser = (userId: string) => {
        hapticTap();
        setSelectedUserIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) {
                next.delete(userId);
            } else {
                if (next.size >= 10) {
                    toast.show('You can only select up to 10 members.');
                    return prev;
                }
                next.add(userId);
            }
            return next;
        });
    };

    const handleCreateGroup = async () => {
        if (selectedUserIds.size === 0) {
            toast.show('Select at least one member to create a group.');
            return;
        }
        if (!userId) {
            toast.show('Sign in to create a group.');
            return;
        }
        setIsSubmitting(true);
        try {
            const room = await createGroupChatRoom({
                title: groupTitle.trim() || undefined,
                members: selectedFriends.map((friend) => ({
                    userId: friend.id,
                    displayName: friend.name,
                    username: friend.username ?? undefined,
                    avatarUrl: friend.avatarUrl || friend.imageUrl || undefined,
                })),
            });
            hapticSuccess();
            toast.show('Group created successfully!');
            router.replace(`/chat/room/${encodeURIComponent(room.id)}`);
        } catch (error) {
            toast.show(error instanceof Error ? error.message : 'Could not create the group.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AppScreen noPadding style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </Pressable>
                <View style={styles.headerTitles}>
                    <AppText style={styles.headerTitle}>New Group</AppText>
                    <AppText style={styles.headerSubtitle}>
                        {selectedUserIds.size} of 10 members
                    </AppText>
                </View>
                <Pressable
                    onPress={() => {
                        void handleCreateGroup();
                    }}
                    style={[
                        styles.createButton,
                        (selectedUserIds.size === 0 || isSubmitting) && styles.createButtonDisabled,
                    ]}
                >
                    <AppText
                        style={[
                            styles.createText,
                            (selectedUserIds.size === 0 || isSubmitting) && styles.createTextDisabled,
                        ]}
                    >
                        {isSubmitting ? 'Saving' : 'Create'}
                    </AppText>
                </Pressable>
            </View>

            <KeyboardAvoidingView
                style={styles.keyboardAvoid}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Search & Selected Chips Area */}
                <View style={styles.searchSection}>
                    <View style={styles.titleInputContainer}>
                        <Ionicons name="chatbubbles-outline" size={18} color={colors.textMuted} />
                        <TextInput
                            value={groupTitle}
                            onChangeText={setGroupTitle}
                            placeholder="Group name (optional)"
                            placeholderTextColor={colors.textMuted}
                            style={styles.titleInput}
                        />
                    </View>
                    <View style={styles.searchInputContainer}>
                        <Ionicons name="search" size={20} color={colors.textMuted} />
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.chipsScrollContent}
                            style={styles.chipsScroll}
                        >
                            {selectedFriends.map((f) => (
                                <Pressable
                                    key={`chip-${f.id}`}
                                    style={styles.chip}
                                    onPress={() => toggleUser(f.id)}
                                >
                                    <Avatar
                                        uri={f.avatarUrl || f.imageUrl}
                                        name={f.name}
                                        customSize={20}
                                    />
                                    <AppText style={styles.chipText} numberOfLines={1}>
                                        {f.name}
                                    </AppText>
                                </Pressable>
                            ))}
                            <TextInput
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder={selectedUserIds.size === 0 ? 'Search people...' : ''}
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                                autoFocus
                            />
                        </ScrollView>
                    </View>
                </View>

                {/* User List */}
                <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
                    {friendsLoading ? (
                        <View style={styles.emptyState}>
                            <AppText secondary>Loading friends...</AppText>
                        </View>
                    ) : filteredFriends.length === 0 ? (
                        <View style={styles.emptyState}>
                            <AppText secondary>No friends found.</AppText>
                        </View>
                    ) : (
                        filteredFriends.map((friend) => {
                            const isSelected = selectedUserIds.has(friend.id);
                            return (
                                <Pressable
                                    key={friend.id}
                                    style={styles.userRow}
                                    onPress={() => toggleUser(friend.id)}
                                >
                                    <Avatar
                                        uri={friend.avatarUrl || friend.imageUrl}
                                        name={friend.name}
                                        size="md"
                                    />
                                    <View style={styles.userInfo}>
                                        <AppText style={styles.userName}>{friend.name}</AppText>
                                        {friend.username && (
                                            <AppText variant="small" secondary style={styles.userHandle}>
                                                @{friend.username}
                                            </AppText>
                                        )}
                                    </View>
                                    <View
                                        style={[
                                            styles.checkbox,
                                            isSelected && styles.checkboxSelected,
                                        ]}
                                    >
                                        {isSelected && (
                                            <Ionicons name="checkmark" size={16} color={colors.background} />
                                        )}
                                    </View>
                                </Pressable>
                            );
                        })
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
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
        paddingHorizontal: spacing.md,
        height: 56,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderSubtle,
    },
    backButton: {
        padding: spacing.xs,
        width: 40,
        alignItems: 'flex-start',
    },
    headerTitles: {
        alignItems: 'center',
        flex: 1,
    },
    headerTitle: {
        ...typography.label,
        fontSize: 18,
    },
    headerSubtitle: {
        ...typography.tiny,
        color: colors.textMuted,
        marginTop: 2,
    },
    createButton: {
        width: 60,
        alignItems: 'flex-end',
        paddingVertical: spacing.xs,
    },
    createButtonDisabled: {
        opacity: 0.5,
    },
    createText: {
        ...typography.label,
        color: colors.accentPrimary,
    },
    createTextDisabled: {
        color: colors.textMuted,
    },
    keyboardAvoid: {
        flex: 1,
    },
    searchSection: {
        padding: spacing.lg,
        paddingBottom: spacing.sm,
        gap: spacing.sm,
    },
    titleInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        minHeight: 44,
        paddingHorizontal: spacing.md,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        gap: spacing.sm,
    },
    titleInput: {
        flex: 1,
        color: colors.textPrimary,
        fontSize: 15,
    },
    searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        minHeight: 44,
        paddingHorizontal: spacing.md,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
    },
    chipsScroll: {
        flex: 1,
        marginLeft: spacing.sm,
    },
    chipsScrollContent: {
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.xs,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.playSurfaceHighlight,
        borderRadius: radius.full,
        padding: 4,
        paddingRight: 10,
        gap: 6,
    },
    chipText: {
        ...typography.small,
        color: colors.textPrimary,
        maxWidth: 80,
    },
    input: {
        flex: 1,
        minWidth: 100,
        color: colors.textPrimary,
        ...typography.body,
        paddingVertical: 0,
        height: '100%',
    },
    listContainer: {
        flex: 1,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap: spacing.md,
    },
    userInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    userName: {
        ...typography.bodyBold,
    },
    userHandle: {
        marginTop: 2,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: colors.textMuted,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: colors.accentPrimary,
        borderColor: colors.accentPrimary,
    },
    emptyState: {
        padding: spacing.xxl,
        alignItems: 'center',
    },
});
