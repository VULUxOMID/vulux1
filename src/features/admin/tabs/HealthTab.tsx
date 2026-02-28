import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { TelemetryPlaceholder } from '../components/TelemetryPlaceholder';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { ADMIN_NOT_CONNECTED_MESSAGE } from '../hooks/useAdminBackend';
import { useAdminSystemHealth } from '../hooks/useAdminSystemHealth';
import {
  ActionCard,
  AdminActionBanner,
  AdminBadge,
  AdminButton,
  AdminSectionHeader,
  AdminStatusChip,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { type AdminTone, adminTokens } from '../ui/adminTokens';
import { getPermissionLabel } from '../utils/permissions';

type MetricCard = {
  title: string;
  subtitle: string;
  statusLabel: string;
  tone: AdminTone;
  badgeLabel?: string;
};

function formatLatency(value: number | null): string {
  if (value === null) {
    return 'Not connected';
  }

  return `${value.toFixed(1)} ms`;
}

function formatCount(value: number | null): string {
  if (value === null) {
    return 'Not connected';
  }

  return `${value}`;
}

function formatErrorRate(value: number | null): string {
  if (value === null) {
    return 'Not connected';
  }

  return `${(value * 100).toFixed(1)}%`;
}

function getLatencyTone(value: number | null): AdminTone {
  if (value === null) {
    return 'neutral';
  }

  if (value < 120) {
    return 'success';
  }

  if (value < 300) {
    return 'warning';
  }

  return 'danger';
}

function getErrorRateTone(value: number | null): AdminTone {
  if (value === null) {
    return 'neutral';
  }

  if (value <= 0.01) {
    return 'success';
  }

  if (value <= 0.05) {
    return 'warning';
  }

  return 'danger';
}

export function HealthTab() {
  const { canPerform } = useAdminAuth();
  const { snapshot, loading, error, refetch } = useAdminSystemHealth();
  const canViewSystemHealth = canPerform('VIEW_SYSTEM_HEALTH');

  const metricCards = useMemo<MetricCard[]>(
    () => [
      {
        title: 'API status',
        subtitle: snapshot?.apiStatus ? snapshot.apiStatus.toUpperCase() : 'Not connected',
        statusLabel: snapshot?.apiStatus ? 'Live' : 'Not connected',
        tone: snapshot?.apiStatus ? 'success' : 'neutral',
        badgeLabel: snapshot?.checkedAt
          ? `Checked ${new Date(snapshot.checkedAt).toLocaleTimeString([], { hour12: false })}`
          : undefined,
      },
      {
        title: 'DB latency',
        subtitle: formatLatency(snapshot?.dbLatencyMs ?? null),
        statusLabel: snapshot?.dbLatencyMs === null ? 'Not connected' : 'Measured',
        tone: getLatencyTone(snapshot?.dbLatencyMs ?? null),
      },
      {
        title: 'Queue size',
        subtitle: formatCount(snapshot?.queueSize ?? null),
        statusLabel: snapshot?.queueSize === null ? 'Not connected' : 'Measured',
        tone: snapshot?.queueSize === null ? 'neutral' : 'primary',
      },
      {
        title: 'Active sessions',
        subtitle: formatCount(snapshot?.activeSessions ?? null),
        statusLabel: snapshot?.activeSessions === null ? 'Not connected' : 'Live sockets',
        tone: snapshot?.activeSessions === null ? 'neutral' : 'primary',
      },
      {
        title: 'Error rate',
        subtitle: formatErrorRate(snapshot?.errorRate ?? null),
        statusLabel: snapshot?.errorRate === null ? 'Not connected' : 'Rolling window',
        tone: getErrorRateTone(snapshot?.errorRate ?? null),
        badgeLabel:
          snapshot && snapshot.sampledRequests > 0
            ? `${snapshot.sampledErrors}/${snapshot.sampledRequests} errors`
            : undefined,
      },
    ],
    [snapshot],
  );

  const isNotConnected = error === ADMIN_NOT_CONNECTED_MESSAGE;

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <AdminSectionHeader
        title="System health"
        description="Real backend metrics where available. Unwired sources stay marked as Not connected."
      />

      {error && !isNotConnected ? <AdminActionBanner tone="danger" message={error} /> : null}

      {isNotConnected ? (
        <TelemetryPlaceholder detail="The admin backend is not connected, so health metrics are unavailable." />
      ) : null}

      <View style={styles.grid}>
        {metricCards.map((metric) => (
          <ReadOnlyCard
            key={metric.title}
            title={metric.title}
            subtitle={metric.subtitle}
            footer={
              <View style={styles.metaRow}>
                <AdminStatusChip label={metric.statusLabel} tone={metric.tone} />
                {metric.badgeLabel ? <AdminBadge label={metric.badgeLabel} tone="neutral" /> : null}
              </View>
            }
          />
        ))}
      </View>

      <ActionCard
        title="Sampling window"
        subtitle="Error rate reflects recent HTTP responses, and queue size remains offline until a queue backend is wired."
        tone="primary"
      >
        <View style={styles.metaRow}>
          <AdminBadge
            label={
              snapshot
                ? `${Math.round(snapshot.errorWindowMs / 60_000)} min rolling window`
                : 'Not connected'
            }
            tone="primary"
          />
          <AdminBadge
            label={snapshot ? `${snapshot.sampledRequests} sampled requests` : 'No samples'}
            tone="neutral"
          />
        </View>

        <AdminButton
          label="Refresh health"
          tone="primary"
          disabled={!canViewSystemHealth}
          disabledReason={!canViewSystemHealth ? getPermissionLabel('VIEW_SYSTEM_HEALTH') : undefined}
          loading={loading}
          onPress={() => {
            void refetch();
          }}
        />
      </ActionCard>
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
  grid: {
    gap: adminTokens.spacing.gapSm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
});
