import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { useMusicCatalogRepo, useVideoRepo } from '../../../data/provider';
import {
    ActionCard,
    AdminActionBanner,
    AdminBadge,
    AdminButton,
    AdminSectionHeader,
    AdminStatusChip,
    ReadOnlyCard,
} from '../ui/AdminLayout';
import { AdminEmptyState } from '../components/AdminEmptyState';
import { DemoBadge } from '../components/DemoBadge';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { ADMIN_NOT_CONNECTED_MESSAGE } from '../hooks/useAdminBackend';
import { adminTokens } from '../ui/adminTokens';
import { getPermissionLabel } from '../utils/permissions';

type ContentItem = {
    id: string;
    name: string;
    meta: string;
    type: 'music' | 'video';
};

export function ContentOpsTab() {
    const { canPerform } = useAdminAuth();
    const musicRepo = useMusicCatalogRepo();
    const videoRepo = useVideoRepo();
    const canUnpublishContent = canPerform('UNPUBLISH_CONTENT');

    const tracks = musicRepo.listTracks();
    const videos = videoRepo.listVideos();

    const items: ContentItem[] = [
        ...(tracks || []).map(
            (track: any): ContentItem => ({
                id: track.id?.toString() || '?',
                name: track.title || track.name || 'Unknown Track',
                meta: track.artist || 'Unknown Artist',
                type: 'music',
            })
        ),
        ...(videos || []).map(
            (video: any): ContentItem => ({
                id: video.id?.toString() || '?',
                name: video.title || 'Untitled Video',
                meta: video.category || video.creator || 'Uncategorized',
                type: 'video',
            })
        ),
    ];

    return (
        <View style={styles.container}>
            <AdminSectionHeader
                title="Content operations"
                description="Review published media and run controlled unpublish actions."
                filters={
                    <View style={styles.filtersRow}>
                        <AdminBadge label={`${tracks.length} tracks`} tone="neutral" />
                        <AdminBadge label={`${videos.length} videos`} tone="neutral" />
                    </View>
                }
            />

            <FlatList
                data={items}
                keyExtractor={(item) => `${item.type}-${item.id}`}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                    <View style={styles.cardStack}>
                        <ReadOnlyCard
                            title={item.name}
                            subtitle={item.meta}
                            footer={
                                <View style={styles.filtersRow}>
                                    <AdminStatusChip label={item.type} tone="neutral" />
                                    <AdminBadge label={`ID ${item.id}`} tone="neutral" />
                                </View>
                            }
                        />

                        <ActionCard
                            title="Actions"
                            subtitle="Unpublish is not wired to a live backend in this build."
                            tone="neutral"
                            footer={<DemoBadge />}
                        >
                            <Text style={styles.readOnlyCopy}>
                                Unpublish actions are hidden until the content moderation API is available.
                            </Text>
                            <AdminButton
                                label="Unpublish content"
                                tone="danger"
                                disabled
                                disabledReason={
                                    canUnpublishContent ? ADMIN_NOT_CONNECTED_MESSAGE : getPermissionLabel('UNPUBLISH_CONTENT')
                                }
                                onPress={() => undefined}
                            />
                            <AdminActionBanner tone="danger" message={ADMIN_NOT_CONNECTED_MESSAGE} />
                        </ActionCard>
                    </View>
                )}
                ListEmptyComponent={
                    <AdminEmptyState
                        icon="cloud-offline-outline"
                        title="No content assets"
                        description="No tracks or videos are currently available in the catalog."
                    />
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: adminTokens.spacing.pageX,
        paddingTop: adminTokens.spacing.gapMd,
    },
    filtersRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: adminTokens.spacing.gapSm,
    },
    listContent: {
        gap: adminTokens.spacing.gapMd,
        paddingBottom: 140,
    },
    cardStack: {
        gap: adminTokens.spacing.gapSm,
    },
    readOnlyCopy: {
        ...adminTokens.typography.body,
        color: adminTokens.colors.textSecondary,
    },
});
