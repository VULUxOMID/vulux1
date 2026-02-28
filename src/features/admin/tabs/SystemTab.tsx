import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ConfirmActionModal,
  type ConfirmActionPayload,
} from '../components/ConfirmActionModal';
import { useAdminActionState } from '../hooks/useAdminActionState';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminBackend } from '../hooks/useAdminBackend';
import {
  ActionCard,
  AdminActionBanner,
  AdminBadge,
  AdminButton,
  AdminSectionHeader,
  AdminStatusChip,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { adminTokens } from '../ui/adminTokens';
import { auditLogger } from '../utils/auditLogger';
import { getPermissionLabel } from '../utils/permissions';

function getBannerTone(status?: string) {
  if (status === 'error') return 'danger';
  if (status === 'success') return 'success';
  return 'warning';
}

export function SystemTab() {
  const { canPerform } = useAdminAuth();
  const { get, post } = useAdminBackend();
  const { actions, runAction } = useAdminActionState();
  const [isClearChatModalVisible, setIsClearChatModalVisible] = useState(false);
  const canTriggerSnapshot = canPerform('TRIGGER_SNAPSHOT');
  const canClearGlobalChat = canPerform('MANAGE_SYSTEM');

  const requestSnapshot = async () => {
    if (!canTriggerSnapshot) {
      return;
    }

    await runAction(
      'system-snapshot',
      async () => {
        await get('/snapshot');
        auditLogger.log({
          adminId: 'current-admin',
          actionType: 'SNAPSHOT_REQUEST',
          targetType: 'system',
          targetId: 'snapshot-service',
          reason: 'Manual snapshot trigger from admin panel',
        });
      },
      {
        successMessage: 'Snapshot request submitted.',
        errorMessage: 'Snapshot request failed.',
      },
    );
  };

  const clearGlobalChat = async ({ reason }: ConfirmActionPayload) => {
    if (!canClearGlobalChat) {
      return;
    }

    const success = await runAction(
      'system-clear-global-chat',
      async () => {
        await post('/admin/messages/clear', {
          reason,
          roomId: 'global',
        });
      },
      {
        successMessage: 'Global chat cleared.',
        errorMessage: 'Unable to clear global chat.',
      },
    );

    if (success) {
      setIsClearChatModalVisible(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AdminSectionHeader
        title="System operations"
        description="Snapshot controls, export tooling, and operational notes."
      />

      <ReadOnlyCard
        title="Audit trail"
        subtitle="All admin requests now write to persistent audit storage. Use the Audit Logs workspace to filter, paginate, and inspect failures."
        footer={
          <View style={styles.metaRow}>
            <AdminStatusChip label="request logging enabled" tone="success" />
            <AdminBadge label="persistent storage" tone="neutral" />
          </View>
        }
      />

      <ActionCard
        title="Snapshot and backup"
        subtitle="Fetch the authenticated backend snapshot and record the request."
        tone="warning"
      >
        <AdminButton
          label="Fetch system snapshot"
          tone="warning"
          disabled={!canTriggerSnapshot}
          disabledReason={!canTriggerSnapshot ? getPermissionLabel('TRIGGER_SNAPSHOT') : undefined}
          loading={actions['system-snapshot']?.status === 'loading'}
          onPress={() => {
            void requestSnapshot();
          }}
        />
        {actions['system-snapshot']?.message ? (
          <AdminActionBanner
            tone={getBannerTone(actions['system-snapshot']?.status)}
            message={actions['system-snapshot']?.message || ''}
          />
        ) : null}
      </ActionCard>

      <ActionCard
        title="Global chat controls"
        subtitle="This permanently removes all messages from the global chat feed."
        tone="danger"
      >
        <AdminButton
          label="Clear global chat"
          tone="danger"
          disabled={!canClearGlobalChat}
          disabledReason={!canClearGlobalChat ? getPermissionLabel('MANAGE_SYSTEM') : undefined}
          onPress={() => setIsClearChatModalVisible(true)}
        />
        {actions['system-clear-global-chat']?.message ? (
          <AdminActionBanner
            tone={getBannerTone(actions['system-clear-global-chat']?.status)}
            message={actions['system-clear-global-chat']?.message || ''}
          />
        ) : null}
      </ActionCard>

      <ReadOnlyCard
        title="Operational scope"
        subtitle="Wallet, moderation, support, and exports are handled in their own workspaces and audited independently."
        footer={
          <View style={styles.metaRow}>
            <AdminBadge label="wallet" tone="neutral" />
            <AdminBadge label="moderation" tone="neutral" />
            <AdminBadge label="support" tone="neutral" />
          </View>
        }
      >
        <Text style={styles.helperText}>
          This screen intentionally keeps only shared system controls. In-memory audit log lists have been removed.
        </Text>
      </ReadOnlyCard>

      <ConfirmActionModal
        visible={isClearChatModalVisible}
        title="Confirm Global Chat Clear"
        description="This removes every message from the global chat feed for all users."
        confirmLabel="Clear Global Chat"
        tone="danger"
        requireReason
        requireTypeToConfirmText="CONFIRM"
        loading={actions['system-clear-global-chat']?.status === 'loading'}
        onCancel={() => setIsClearChatModalVisible(false)}
        onConfirm={clearGlobalChat}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: adminTokens.spacing.pageX,
    paddingTop: adminTokens.spacing.gapMd,
    paddingBottom: 140,
    gap: adminTokens.spacing.gapMd,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  helperText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
});
