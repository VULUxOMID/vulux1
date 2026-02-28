import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { AdminEmptyState } from '../components/AdminEmptyState';
import { TelemetryPlaceholder } from '../components/TelemetryPlaceholder';
import {
  type AdminBroadcastAlertInput,
  type AdminIncidentCenterSnapshot,
  type AdminIncidentSeverity,
} from '../hooks/useAdminIncidentCenter';
import { ADMIN_NOT_CONNECTED_MESSAGE } from '../hooks/useAdminBackend';
import { useAdminActionState } from '../hooks/useAdminActionState';
import { useAdminAuth } from '../hooks/useAdminAuth';
import {
  ActionCard,
  AdminActionBanner,
  AdminBadge,
  AdminButton,
  AdminSectionHeader,
  AdminStatusChip,
  AdminTextInput,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { type AdminTone, adminTokens } from '../ui/adminTokens';
import { getPermissionLabel } from '../utils/permissions';

type IncidentCenterTabProps = {
  snapshot: AdminIncidentCenterSnapshot | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<AdminIncidentCenterSnapshot | null>;
  toggleMaintenanceMode: (enabled: boolean, message: string) => Promise<unknown>;
  broadcastAlert: (input: AdminBroadcastAlertInput) => Promise<unknown>;
  resolveIncident: () => Promise<unknown>;
};

const SEVERITY_OPTIONS: Array<{ label: string; value: AdminIncidentSeverity }> = [
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
  { label: 'Info', value: 'info' },
  { label: 'Resolved', value: 'success' },
];

function mapSeverityTone(severity: AdminIncidentSeverity | undefined | null): AdminTone {
  switch (severity) {
    case 'critical':
      return 'danger';
    case 'warning':
      return 'warning';
    case 'success':
      return 'success';
    default:
      return 'primary';
  }
}

export function IncidentCenterTab({
  snapshot,
  loading,
  error,
  refetch,
  toggleMaintenanceMode,
  broadcastAlert,
  resolveIncident,
}: IncidentCenterTabProps) {
  const { canPerform } = useAdminAuth();
  const { actions, runAction } = useAdminActionState();
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [severity, setSeverity] = useState<AdminIncidentSeverity>('warning');
  const [markAsOngoing, setMarkAsOngoing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const canManageSystem = canPerform('MANAGE_SYSTEM');
  const canBroadcastAlert = canPerform('BROADCAST_ALERT');
  const isNotConnected = error === ADMIN_NOT_CONNECTED_MESSAGE;
  const maintenanceEnabled = snapshot?.maintenanceMode.enabled ?? false;
  const ongoingIncident = snapshot?.ongoingIncident ?? null;

  const handleMaintenanceToggle = async (enabled: boolean) => {
    if (!canManageSystem || isNotConnected) {
      return;
    }

    await runAction(
      'maintenance-mode',
      async () => {
        await toggleMaintenanceMode(enabled, maintenanceMessage.trim());
      },
      {
        successMessage: enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.',
        errorMessage: 'Unable to update maintenance mode.',
      },
    );
  };

  const handleBroadcast = async () => {
    if (!canBroadcastAlert || isNotConnected) {
      return;
    }

    const normalizedTitle = broadcastTitle.trim();
    const normalizedMessage = broadcastMessage.trim();

    if (!normalizedTitle || !normalizedMessage) {
      setComposeError('Title and message are required.');
      return;
    }

    setComposeError(null);

    await runAction(
      'broadcast-alert',
      async () => {
        await broadcastAlert({
          title: normalizedTitle,
          message: normalizedMessage,
          severity,
          markAsOngoing,
        });
        setBroadcastTitle('');
        setBroadcastMessage('');
        setMarkAsOngoing(false);
      },
      {
        successMessage: markAsOngoing
          ? 'Broadcast sent and pinned as the active incident.'
          : 'Broadcast alert sent.',
        errorMessage: 'Unable to send broadcast alert.',
      },
    );
  };

  const handleResolveIncident = async () => {
    if (!canManageSystem || isNotConnected) {
      return;
    }

    await runAction(
      'resolve-incident',
      async () => {
        await resolveIncident();
      },
      {
        successMessage: 'Ongoing incident cleared.',
        errorMessage: 'Unable to resolve the ongoing incident.',
      },
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <AdminSectionHeader
        title="Incident center"
        description="Track active incidents, control maintenance mode, and send broadcast alerts."
      />

      {error && !isNotConnected ? <AdminActionBanner tone="danger" message={error} /> : null}

      {isNotConnected ? (
        <TelemetryPlaceholder detail="The admin backend is not connected, so the incident center is read-only." />
      ) : null}

      {ongoingIncident ? (
        <ActionCard
          title="Ongoing incident"
          subtitle={ongoingIncident.title}
          tone={mapSeverityTone(ongoingIncident.severity)}
          footer={
            <View style={styles.metaRow}>
              <AdminStatusChip
                label={ongoingIncident.severity.toUpperCase()}
                tone={mapSeverityTone(ongoingIncident.severity)}
              />
              <AdminBadge
                label={new Date(ongoingIncident.createdAt).toLocaleString()}
                tone="neutral"
              />
            </View>
          }
        >
          <Text style={styles.incidentMessage}>{ongoingIncident.message}</Text>
          <AdminButton
            label="Resolve incident"
            tone="success"
            disabled={!canManageSystem || actions['resolve-incident']?.status === 'loading'}
            disabledReason={!canManageSystem ? getPermissionLabel('MANAGE_SYSTEM') : undefined}
            loading={actions['resolve-incident']?.status === 'loading'}
            onPress={() => {
              void handleResolveIncident();
            }}
          />
          {actions['resolve-incident']?.message ? (
            <AdminActionBanner
              tone={
                actions['resolve-incident']?.status === 'error'
                  ? 'danger'
                  : actions['resolve-incident']?.status === 'success'
                    ? 'success'
                    : 'warning'
              }
              message={actions['resolve-incident']?.message || ''}
            />
          ) : null}
        </ActionCard>
      ) : (
        <ReadOnlyCard
          title="Ongoing incident"
          subtitle={snapshot ? 'No ongoing incident.' : 'Not connected'}
          footer={<AdminStatusChip label={snapshot ? 'Standby' : 'Not connected'} tone={snapshot ? 'success' : 'neutral'} />}
        />
      )}

      <ActionCard
        title="Maintenance mode"
        subtitle="This toggle is visible across the full admin shell and is restricted by backend permissions."
        tone={maintenanceEnabled ? 'danger' : 'warning'}
      >
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>Admin maintenance mode</Text>
            <Text style={styles.switchDetail}>
              {maintenanceEnabled
                ? snapshot?.maintenanceMode.message || 'Maintenance mode is currently active.'
                : 'Disabled'}
            </Text>
          </View>
          <Switch
            value={maintenanceEnabled}
            disabled={!canManageSystem || loading || isNotConnected}
            onValueChange={(value) => {
              void handleMaintenanceToggle(value);
            }}
            thumbColor={maintenanceEnabled ? adminTokens.colors.danger : adminTokens.colors.surface}
            trackColor={{
              false: adminTokens.colors.border,
              true: 'rgba(255, 68, 88, 0.35)',
            }}
          />
        </View>

        <AdminTextInput
          value={maintenanceMessage}
          onChangeText={setMaintenanceMessage}
          placeholder={
            snapshot?.maintenanceMode.message?.trim() || 'Optional maintenance banner message'
          }
          multiline
        />

        {!canManageSystem ? (
          <AdminActionBanner
            tone="warning"
            message={getPermissionLabel('MANAGE_SYSTEM')}
          />
        ) : null}

        {actions['maintenance-mode']?.message ? (
          <AdminActionBanner
            tone={
              actions['maintenance-mode']?.status === 'error'
                ? 'danger'
                : actions['maintenance-mode']?.status === 'success'
                  ? 'success'
                  : 'warning'
            }
            message={actions['maintenance-mode']?.message || ''}
          />
        ) : null}
      </ActionCard>

      <ActionCard
        title="Broadcast alert"
        subtitle="Send an alert to connected clients and optionally pin it as the current incident."
        tone="primary"
      >
        <AdminTextInput
          value={broadcastTitle}
          onChangeText={(value) => {
            setComposeError(null);
            setBroadcastTitle(value);
          }}
          placeholder="Alert title"
        />

        <AdminTextInput
          value={broadcastMessage}
          onChangeText={(value) => {
            setComposeError(null);
            setBroadcastMessage(value);
          }}
          placeholder="Alert message"
          multiline
        />

        <View style={styles.severityRow}>
          {SEVERITY_OPTIONS.map((option) => {
            const isActive = severity === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.severityChip, isActive && styles.severityChipActive]}
                onPress={() => setSeverity(option.value)}
              >
                <Text style={[styles.severityLabel, isActive && styles.severityLabelActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>Pin as ongoing incident</Text>
            <Text style={styles.switchDetail}>Keeps the alert visible as the active incident banner.</Text>
          </View>
          <Switch
            value={markAsOngoing}
            disabled={!canBroadcastAlert || isNotConnected}
            onValueChange={setMarkAsOngoing}
            thumbColor={markAsOngoing ? adminTokens.colors.warning : adminTokens.colors.surface}
            trackColor={{
              false: adminTokens.colors.border,
              true: 'rgba(255, 215, 0, 0.35)',
            }}
          />
        </View>

        {composeError ? <AdminActionBanner tone="danger" message={composeError} /> : null}

        {actions['broadcast-alert']?.message ? (
          <AdminActionBanner
            tone={
              actions['broadcast-alert']?.status === 'error'
                ? 'danger'
                : actions['broadcast-alert']?.status === 'success'
                  ? 'success'
                  : 'warning'
            }
            message={actions['broadcast-alert']?.message || ''}
          />
        ) : null}

        <AdminButton
          label="Send broadcast"
          tone="primary"
          disabled={!canBroadcastAlert || isNotConnected || actions['broadcast-alert']?.status === 'loading'}
          disabledReason={!canBroadcastAlert ? getPermissionLabel('BROADCAST_ALERT') : undefined}
          loading={actions['broadcast-alert']?.status === 'loading'}
          onPress={() => {
            void handleBroadcast();
          }}
        />
      </ActionCard>

      <ReadOnlyCard
        title="Recent alerts"
        subtitle={
          snapshot
            ? `${snapshot.recentAlerts.length} recent alert${snapshot.recentAlerts.length === 1 ? '' : 's'}`
            : 'Not connected'
        }
        footer={
          <View style={styles.metaRow}>
            <AdminBadge
              label={
                snapshot?.checkedAt
                  ? `Updated ${new Date(snapshot.checkedAt).toLocaleTimeString([], { hour12: false })}`
                  : 'Not connected'
              }
              tone="neutral"
            />
            <AdminButton
              label="Refresh"
              tone="neutral"
              loading={loading}
              onPress={() => {
                void refetch();
              }}
            />
          </View>
        }
      >
        {snapshot ? (
          snapshot.recentAlerts.length > 0 ? (
            <View style={styles.alertList}>
              {snapshot.recentAlerts.slice(0, 8).map((alert) => (
                <View key={alert.id} style={styles.alertItem}>
                  <View style={styles.alertHeader}>
                    <Text style={styles.alertTitle}>{alert.title}</Text>
                    <AdminStatusChip
                      label={alert.severity.toUpperCase()}
                      tone={mapSeverityTone(alert.severity)}
                    />
                  </View>
                  <Text style={styles.alertMessage}>{alert.message}</Text>
                  <View style={styles.metaRow}>
                    <AdminBadge
                      label={new Date(alert.createdAt).toLocaleString()}
                      tone="neutral"
                    />
                    <AdminBadge
                      label={`${alert.deliveredCount} deliveries`}
                      tone="neutral"
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <AdminEmptyState
              title="No recent alerts"
              description="Broadcast alerts and maintenance changes will appear here."
              icon="notifications-off-outline"
            />
          )
        ) : (
          <TelemetryPlaceholder detail="Connect the admin backend to load recent alerts." />
        )}
      </ReadOnlyCard>
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
    alignItems: 'center',
  },
  incidentMessage: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textPrimary,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: adminTokens.spacing.gapMd,
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  switchTitle: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textPrimary,
    fontWeight: '700',
  },
  switchDetail: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  severityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  severityChip: {
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.chip,
    backgroundColor: adminTokens.colors.surfaceAlt,
    paddingHorizontal: adminTokens.spacing.gapMd,
    paddingVertical: adminTokens.spacing.gapSm,
  },
  severityChipActive: {
    borderColor: adminTokens.colors.primaryBorder,
    backgroundColor: adminTokens.colors.primarySubtle,
  },
  severityLabel: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  severityLabelActive: {
    color: adminTokens.colors.textPrimary,
    fontWeight: '700',
  },
  alertList: {
    gap: adminTokens.spacing.gapSm,
  },
  alertItem: {
    gap: adminTokens.spacing.gapSm,
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.input,
    backgroundColor: adminTokens.colors.surfaceAlt,
    padding: adminTokens.spacing.gapSm,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: adminTokens.spacing.gapSm,
  },
  alertTitle: {
    flex: 1,
    ...adminTokens.typography.body,
    color: adminTokens.colors.textPrimary,
    fontWeight: '700',
  },
  alertMessage: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
});
