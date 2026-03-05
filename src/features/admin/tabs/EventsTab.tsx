import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TelemetryPlaceholder } from '../components/TelemetryPlaceholder';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminEventOverview } from '../hooks/useAdminEventOverview';
import { ADMIN_NOT_CONNECTED_MESSAGE } from '../hooks/useAdminBackend';
import {
  ActionCard,
  AdminActionBanner,
  AdminBadge,
  AdminButton,
  AdminSectionHeader,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { adminTokens } from '../ui/adminTokens';
import { getPermissionLabel } from '../utils/permissions';

function formatUtcLabel(iso: string): string {
  if (!iso) {
    return 'Not available';
  }

  return iso.replace('T', ' ').replace('.000Z', 'Z');
}

export function EventsTab() {
  const { canPerform } = useAdminAuth();
  const canEditEventConfig = canPerform('EDIT_EVENT_CONFIG');
  const { snapshot, loading, error, refetch } = useAdminEventOverview();
  const isNotConnected = error === ADMIN_NOT_CONNECTED_MESSAGE;

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <AdminSectionHeader
        title="Event engine"
        description="Overview metrics are server-backed and use UTC day/week/month bucket boundaries."
      />

      {error && !isNotConnected ? <AdminActionBanner tone="danger" message={error} /> : null}

      {isNotConnected ? (
        <TelemetryPlaceholder detail="Spacetime event overview is not connected yet." />
      ) : null}

      <ReadOnlyCard
        title="Real-time overview"
        subtitle={snapshot ? `As of ${formatUtcLabel(snapshot.asOfIsoUtc)}` : 'Waiting for event metrics'}
        footer={
          <View style={styles.metaRow}>
            <AdminBadge
              label={`Timezone ${snapshot?.bucketTimezone ?? 'UTC'}`}
              tone="primary"
            />
            <AdminBadge
              label={`Active window ${Math.round((snapshot?.activeWindowMs ?? 0) / 1000)}s`}
              tone="neutral"
            />
          </View>
        }
      >
        <View style={styles.metricList}>
          <Text style={styles.metricText}>Active players now: {snapshot?.activePlayersNow ?? 0}</Text>
          <Text style={styles.metricText}>Players today (UTC): {snapshot?.totalPlayersToday ?? 0}</Text>
          <Text style={styles.metricText}>Players this week (UTC): {snapshot?.totalPlayersWeek ?? 0}</Text>
          <Text style={styles.metricText}>Players this month (UTC): {snapshot?.totalPlayersMonth ?? 0}</Text>
        </View>
      </ReadOnlyCard>

      <ReadOnlyCard
        title="Aggregate buckets"
        subtitle="Totals are deduped by player within UTC bucket windows."
      >
        <View style={styles.metricList}>
          <Text style={styles.metricText}>Entries today: {snapshot?.totalEntriesToday ?? 0}</Text>
          <Text style={styles.metricText}>Entries this week: {snapshot?.totalEntriesWeek ?? 0}</Text>
          <Text style={styles.metricText}>Entries this month: {snapshot?.totalEntriesMonth ?? 0}</Text>
        </View>
        <View style={styles.boundaryList}>
          <Text style={styles.boundaryText}>Today starts: {formatUtcLabel(snapshot?.todayStartIsoUtc ?? '')}</Text>
          <Text style={styles.boundaryText}>Week starts: {formatUtcLabel(snapshot?.weekStartIsoUtc ?? '')}</Text>
          <Text style={styles.boundaryText}>Month starts: {formatUtcLabel(snapshot?.monthStartIsoUtc ?? '')}</Text>
        </View>
        <AdminButton
          label="Refresh overview"
          tone="primary"
          loading={loading}
          onPress={() => {
            void refetch();
          }}
        />
      </ReadOnlyCard>

      <ActionCard
        title="Configuration"
        subtitle="Write controls stay disabled in this scope while overview and aggregate paths are validated."
        tone="warning"
      >
        <Text style={styles.metricText}>
          Event config mutations are intentionally blocked in this task. This tab now wires the live overview contract.
        </Text>
        <AdminButton
          label="Save Event Configuration"
          tone="warning"
          disabled
          disabledReason={
            canEditEventConfig ? 'Configuration writes are not enabled in this rollout phase.' : getPermissionLabel('EDIT_EVENT_CONFIG')
          }
          onPress={() => undefined}
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
  metricList: {
    gap: adminTokens.spacing.gapSm,
  },
  metricText: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textSecondary,
  },
  boundaryList: {
    gap: adminTokens.spacing.gapSm,
    marginTop: adminTokens.spacing.gapSm,
  },
  boundaryText: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
});
