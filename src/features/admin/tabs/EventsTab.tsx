import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
    ActionCard,
    AdminActionBanner,
    AdminButton,
    AdminSectionHeader,
    AdminStatusChip,
    ReadOnlyCard,
} from '../ui/AdminLayout';
import { DemoBadge } from '../components/DemoBadge';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { ADMIN_NOT_CONNECTED_MESSAGE } from '../hooks/useAdminBackend';
import { adminTokens } from '../ui/adminTokens';
import { getPermissionLabel } from '../utils/permissions';

const DEFAULT_TICKET_COST = 10;
const DEFAULT_NEXT_DRAW_MINUTES = 60;

export function EventsTab() {
    const { canPerform } = useAdminAuth();
    const canEditEventConfig = canPerform('EDIT_EVENT_CONFIG');

    return (
        <View style={styles.container}>
            <AdminSectionHeader
                title="Event engine"
                description="Event controls stay read-only until a live admin endpoint is available."
            />

            <ReadOnlyCard
                title="Current status"
                subtitle="The event engine control plane is not connected in this build."
                footer={
                    <View style={styles.row}>
                        <Text style={styles.label}>Runtime</Text>
                        <AdminStatusChip label={ADMIN_NOT_CONNECTED_MESSAGE} tone="danger" />
                    </View>
                }
            >
                <View style={styles.summaryList}>
                    <Text style={styles.summaryText}>Base ticket cost: {DEFAULT_TICKET_COST} gems</Text>
                    <Text style={styles.summaryText}>Next draw timer: {DEFAULT_NEXT_DRAW_MINUTES} minutes</Text>
                </View>
            </ReadOnlyCard>

            <ActionCard
                title="Configuration"
                subtitle="The save action remains disabled until the backend is wired."
                tone="warning"
                footer={<DemoBadge />}
            >
                <Text style={styles.summaryText}>
                    Configuration changes are unavailable until the event control endpoint is implemented.
                </Text>
                <AdminButton
                    label="Save Event Configuration"
                    tone="warning"
                    disabled
                    disabledReason={
                        canEditEventConfig ? ADMIN_NOT_CONNECTED_MESSAGE : getPermissionLabel('EDIT_EVENT_CONFIG')
                    }
                    onPress={() => undefined}
                />
                <AdminActionBanner tone="danger" message={ADMIN_NOT_CONNECTED_MESSAGE} />
            </ActionCard>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: adminTokens.spacing.pageX,
        paddingTop: adminTokens.spacing.gapMd,
        gap: adminTokens.spacing.gapMd,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    label: {
        ...adminTokens.typography.caption,
        color: adminTokens.colors.textSecondary,
    },
    summaryList: {
        gap: adminTokens.spacing.gapSm,
    },
    summaryText: {
        ...adminTokens.typography.body,
        color: adminTokens.colors.textSecondary,
    },
});
