import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  useLeaderboardRepo,
  useLiveRepo,
  useMessagesRepo,
  useNotificationsRepo,
  useSocialRepo,
} from '../../../data/provider';
import { AdminTabId } from '../adminTabs';
import {
  ConfirmActionModal,
  type ConfirmActionPayload,
} from '../components/ConfirmActionModal';
import { TelemetryPlaceholder } from '../components/TelemetryPlaceholder';
import { useAdminActionState } from '../hooks/useAdminActionState';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminBackend } from '../hooks/useAdminBackend';
import { useAdminTelemetry } from '../hooks/useAdminTelemetry';
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
import { getPermissionLabel } from '../utils/permissions';

type PendingStreamAction = {
  hostLabel: string;
  liveId: string;
} | null;

function getBannerTone(status?: string) {
  if (status === 'error') return 'danger';
  if (status === 'success') return 'success';
  return 'warning';
}

export function OperationsTab({ onNavigate }: { onNavigate: (tab: AdminTabId) => void }) {
  const { canPerform } = useAdminAuth();
  const { get, post } = useAdminBackend();
  const socialRepo = useSocialRepo();
  const liveRepo = useLiveRepo();
  const messagesRepo = useMessagesRepo();
  const notificationsRepo = useNotificationsRepo();
  const leaderboardRepo = useLeaderboardRepo();
  const telemetry = useAdminTelemetry();
  const { actions, runAction } = useAdminActionState();
  const [pendingStreamAction, setPendingStreamAction] = useState<PendingStreamAction>(null);
  const [hiddenLiveIds, setHiddenLiveIds] = useState<Set<string>>(new Set());

  const users = socialRepo.listUsers();
  const activeUsers = users.filter((user) => user.status === 'online' || user.status === 'live').length;
  const lives = liveRepo.listLives();
  const visibleLives = useMemo(
    () => lives.filter((live) => !hiddenLiveIds.has(live.id)),
    [hiddenLiveIds, lives],
  );
  const recentMessages = messagesRepo.listGlobalMessages({ limit: 50 });
  const notifications = useMemo(() => {
    try {
      return notificationsRepo.listNotifications() || [];
    } catch {
      return [];
    }
  }, [notificationsRepo]);
  const leaderboard = useMemo(() => {
    try {
      return leaderboardRepo.listLeaderboardItems() || [];
    } catch {
      return [];
    }
  }, [leaderboardRepo]);

  const canTriggerSnapshot = canPerform('TRIGGER_SNAPSHOT');
  const canManageSystem = canPerform('MANAGE_SYSTEM');
  const canViewUsers = canPerform('VIEW_USERS');
  const canViewMessageLogs = canPerform('VIEW_MESSAGE_LOGS');
  const canViewSupportTickets = canPerform('VIEW_SUPPORT_TICKETS');

  const runManualSync = async () => {
    if (!canTriggerSnapshot) {
      return;
    }

    await runAction(
      'dashboard-sync',
      async () => {
        await get('/snapshot');
      },
      {
        successMessage: 'Operational snapshot refreshed.',
        errorMessage: 'Failed to refresh operational snapshot.',
      },
    );
  };

  const confirmEndStream = async ({ reason }: ConfirmActionPayload) => {
    if (!pendingStreamAction) {
      return;
    }

    const success = await runAction(
      'dashboard-end-stream',
      async () => {
        await post('/admin/live/end', {
          liveId: pendingStreamAction.liveId,
          reason,
        });

        setHiddenLiveIds((prev) => {
          const next = new Set(prev);
          next.add(pendingStreamAction.liveId);
          return next;
        });
      },
      {
        successMessage: `Live stream ended for ${pendingStreamAction.hostLabel}.`,
        errorMessage: 'Unable to end this stream.',
      },
    );

    if (success) {
      setPendingStreamAction(null);
    }
  };

  return (
    <View style={styles.container}>
      <AdminSectionHeader
        title="Ops overview"
        description="Fast snapshot of moderation load, live activity, and communication volume."
      />

      <View style={styles.grid}>
        <ReadOnlyCard
          title="Active users"
          subtitle={`${activeUsers} currently online/live`}
          footer={
            <AdminStatusChip
              label={activeUsers > 0 ? 'healthy' : 'idle'}
              tone={activeUsers > 0 ? 'success' : 'warning'}
            />
          }
        />
        <ReadOnlyCard
          title="Live rooms"
          subtitle={`${visibleLives.length} streams currently active`}
          footer={
            <AdminStatusChip
              label={visibleLives.length > 0 ? 'active' : 'standby'}
              tone={visibleLives.length > 0 ? 'success' : 'neutral'}
            />
          }
        />
        <ReadOnlyCard
          title="Global messages"
          subtitle={`${recentMessages.length} recent messages`}
          footer={<AdminBadge label="Moderation feed" tone="primary" />}
        />
        <ReadOnlyCard
          title="Notifications"
          subtitle={`${notifications.length} queued locally`}
          footer={<AdminBadge label="Delivery layer" tone="warning" />}
        />
      </View>

      <ReadOnlyCard
        title="Spacetime telemetry"
        subtitle={
          telemetry.isConnected
            ? `${telemetry.statusLabel} • ${telemetry.dataFreshnessLabel}`
            : 'Live runtime telemetry is currently unavailable.'
        }
        footer={
          telemetry.isConnected ? (
            <View style={styles.telemetryFooter}>
              <AdminStatusChip label={telemetry.statusLabel} tone="success" />
              <AdminBadge label={`${telemetry.snapshot.dataChangeCount} updates`} tone="primary" />
              <AdminBadge
                label={`${telemetry.snapshot.coreRowCounts.globalMessages} msgs`}
                tone="warning"
              />
              <AdminBadge label={`${telemetry.snapshot.coreRowCounts.lives} lives`} tone="neutral" />
            </View>
          ) : null
        }
      >
        {telemetry.isConnected ? (
          <View style={styles.telemetryBody}>
            <Text style={styles.telemetryText}>{telemetry.updatedLabel}</Text>
            <Text style={styles.telemetryText}>
              Users {telemetry.snapshot.coreRowCounts.socialUsers} • Conversations{' '}
              {telemetry.snapshot.coreRowCounts.conversations} • Notifications{' '}
              {telemetry.snapshot.coreRowCounts.notifications}
            </Text>
          </View>
        ) : (
          <TelemetryPlaceholder detail={telemetry.snapshot.lastError || undefined} />
        )}
      </ReadOnlyCard>

      <ActionCard
        title="Operational actions"
        subtitle="Use live refresh and move directly to work queues."
        tone="primary"
      >
        <View style={styles.actionsColumn}>
          <AdminButton
            label="Refresh Snapshot"
            tone="primary"
            disabled={!canTriggerSnapshot}
            disabledReason={!canTriggerSnapshot ? getPermissionLabel('TRIGGER_SNAPSHOT') : undefined}
            loading={actions['dashboard-sync']?.status === 'loading'}
            onPress={runManualSync}
          />
          <AdminButton
            label="Open Users Queue"
            tone="neutral"
            disabled={!canViewUsers}
            disabledReason={!canViewUsers ? getPermissionLabel('VIEW_USERS') : undefined}
            onPress={() => onNavigate('users')}
          />
          <AdminButton
            label="Open Moderation Queue"
            tone="neutral"
            disabled={!canViewMessageLogs}
            disabledReason={!canViewMessageLogs ? getPermissionLabel('VIEW_MESSAGE_LOGS') : undefined}
            onPress={() => onNavigate('moderation')}
          />
          <AdminButton
            label="Open Support Queue"
            tone="neutral"
            disabled={!canViewSupportTickets}
            disabledReason={!canViewSupportTickets ? getPermissionLabel('VIEW_SUPPORT_TICKETS') : undefined}
            onPress={() => onNavigate('support')}
          />
        </View>

        {actions['dashboard-sync']?.message ? (
          <AdminActionBanner
            tone={getBannerTone(actions['dashboard-sync']?.status)}
            message={actions['dashboard-sync']?.message || ''}
          />
        ) : null}
      </ActionCard>

      <ActionCard
        title="Live stream control"
        subtitle="Ending a stream immediately removes the active room for all viewers."
        tone="danger"
      >
        <View style={styles.streamList}>
          {visibleLives.length === 0 ? (
            <Text style={styles.telemetryText}>No active streams available for intervention.</Text>
          ) : (
            visibleLives.slice(0, 6).map((live) => {
              const hostLabel = live.hosts?.[0]?.name || live.title || live.id;

              return (
                <View key={live.id} style={styles.streamRow}>
                  <View style={styles.streamMeta}>
                    <Text style={styles.streamTitle} numberOfLines={1}>
                      {live.title || hostLabel}
                    </Text>
                    <Text style={styles.streamSubtitle}>
                      {hostLabel} • {live.viewers ?? 0} viewers
                    </Text>
                  </View>
                  <AdminButton
                    label="End Stream"
                    tone="danger"
                    disabled={!canManageSystem}
                    disabledReason={!canManageSystem ? getPermissionLabel('MANAGE_SYSTEM') : undefined}
                    onPress={() =>
                      setPendingStreamAction({
                        hostLabel,
                        liveId: live.id,
                      })
                    }
                  />
                </View>
              );
            })
          )}
        </View>

        {actions['dashboard-end-stream']?.message ? (
          <AdminActionBanner
            tone={getBannerTone(actions['dashboard-end-stream']?.status)}
            message={actions['dashboard-end-stream']?.message || ''}
          />
        ) : null}
      </ActionCard>

      <ReadOnlyCard
        title="Leaderboard signal"
        subtitle={
          leaderboard.length
            ? `Top profile: ${leaderboard[0]?.username || 'Unknown'}`
            : 'No leaderboard rows available'
        }
        footer={
          <AdminStatusChip
            label={leaderboard.length ? 'data available' : 'empty'}
            tone={leaderboard.length ? 'success' : 'warning'}
          />
        }
      />

      <ConfirmActionModal
        visible={!!pendingStreamAction}
        title="Confirm Stream End"
        description={
          pendingStreamAction
            ? `This will immediately end the live stream hosted by ${pendingStreamAction.hostLabel}.`
            : ''
        }
        confirmLabel="End Stream"
        tone="danger"
        requireReason
        requireTypeToConfirmText="CONFIRM"
        loading={actions['dashboard-end-stream']?.status === 'loading'}
        onCancel={() => setPendingStreamAction(null)}
        onConfirm={confirmEndStream}
      />
    </View>
  );
}

export const DashboardOpsTab = OperationsTab;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: adminTokens.spacing.pageX,
    paddingTop: adminTokens.spacing.gapMd,
    paddingBottom: 140,
    gap: adminTokens.spacing.gapMd,
  },
  grid: {
    gap: adminTokens.spacing.gapSm,
  },
  telemetryBody: {
    gap: 4,
  },
  telemetryFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  telemetryText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  actionsColumn: {
    gap: adminTokens.spacing.gapSm,
  },
  streamList: {
    gap: adminTokens.spacing.gapSm,
  },
  streamRow: {
    gap: adminTokens.spacing.gapSm,
    padding: adminTokens.spacing.gapSm,
    borderRadius: adminTokens.radius.input,
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    backgroundColor: adminTokens.colors.surfaceAlt,
  },
  streamMeta: {
    gap: 2,
  },
  streamTitle: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textPrimary,
  },
  streamSubtitle: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
});
