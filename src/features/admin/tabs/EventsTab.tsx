import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { spacetimeDb, subscribeSpacetimeDataChanges } from '../../../lib/spacetime';
import { TelemetryPlaceholder } from '../components/TelemetryPlaceholder';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminEventOverview } from '../hooks/useAdminEventOverview';
import { ADMIN_NOT_CONNECTED_MESSAGE } from '../hooks/useAdminBackend';
import {
  ActionCard,
  AdminActionBanner,
  AdminBadge,
  AdminButton,
  AdminTextInput,
  AdminSectionHeader,
  ReadOnlyCard,
} from '../ui/AdminLayout';
import { adminTokens } from '../ui/adminTokens';
import { getPermissionLabel } from '../utils/permissions';

type AdminBannerTone = 'success' | 'danger';

type EventWidgetConfigSnapshot = {
  enabled: boolean;
  entryAmountCash: number;
  drawDurationMinutes: number;
  drawIntervalMinutes: number;
  autoplayEnabled: boolean;
  updatedBy: string;
  updatedAt: string;
};

type EventWidgetConfigForm = {
  enabled: boolean;
  entryAmountCash: string;
  drawDurationMinutes: string;
  drawIntervalMinutes: string;
  autoplayEnabled: boolean;
};

const EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN = 0;
const EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX = 1_000_000;
const EVENT_WIDGET_DRAW_DURATION_MINUTES_MIN = 1;
const EVENT_WIDGET_DRAW_DURATION_MINUTES_MAX = 24 * 60;
const EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MIN = 1;
const EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MAX = 24 * 60;
const EVENT_WIDGET_DEFAULT_CONFIG: EventWidgetConfigSnapshot = {
  enabled: true,
  entryAmountCash: 0,
  drawDurationMinutes: 3,
  drawIntervalMinutes: 3,
  autoplayEnabled: true,
  updatedBy: '',
  updatedAt: '',
};

function toFiniteInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? Math.floor(asNumber) : fallback;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }

  return fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function toText(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (value && typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    const text = (value as { toString: () => string }).toString().trim();
    if (text.length > 0 && text !== '[object Object]') {
      return text;
    }
  }
  return fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function formatUtcLabel(iso: string): string {
  if (!iso) {
    return 'Not available';
  }

  return iso.replace('T', ' ').replace('.000Z', 'Z');
}

function readEventWidgetConfigSnapshot(): EventWidgetConfigSnapshot {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(
    dbView?.eventWidgetConfigItem?.iter?.() ?? dbView?.event_widget_config_item?.iter?.() ?? [],
  );
  const row = rows[0];
  if (!row) {
    return EVENT_WIDGET_DEFAULT_CONFIG;
  }

  const drawDurationMinutes = clampInt(
    toFiniteInt(row.drawDurationMinutes, EVENT_WIDGET_DEFAULT_CONFIG.drawDurationMinutes),
    EVENT_WIDGET_DRAW_DURATION_MINUTES_MIN,
    EVENT_WIDGET_DRAW_DURATION_MINUTES_MAX,
  );
  const drawIntervalMinutes = clampInt(
    toFiniteInt(row.drawIntervalMinutes, EVENT_WIDGET_DEFAULT_CONFIG.drawIntervalMinutes),
    EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MIN,
    Math.min(EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MAX, drawDurationMinutes),
  );

  return {
    enabled: toBoolean(row.enabled, EVENT_WIDGET_DEFAULT_CONFIG.enabled),
    entryAmountCash: clampInt(
      toFiniteInt(row.entryAmountCash, EVENT_WIDGET_DEFAULT_CONFIG.entryAmountCash),
      EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
      EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX,
    ),
    drawDurationMinutes,
    drawIntervalMinutes,
    autoplayEnabled: toBoolean(row.autoplayEnabled, EVENT_WIDGET_DEFAULT_CONFIG.autoplayEnabled),
    updatedBy: toText(row.updatedBy),
    updatedAt: toText(row.updatedAt),
  };
}

function toForm(snapshot: EventWidgetConfigSnapshot): EventWidgetConfigForm {
  return {
    enabled: snapshot.enabled,
    entryAmountCash: String(snapshot.entryAmountCash),
    drawDurationMinutes: String(snapshot.drawDurationMinutes),
    drawIntervalMinutes: String(snapshot.drawIntervalMinutes),
    autoplayEnabled: snapshot.autoplayEnabled,
  };
}

function parseBoundedInt(
  value: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clampInt(parsed, min, max);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return 'Unknown event configuration error.';
}

async function callEventReducer(
  reducerNames: string[],
  args: Record<string, unknown>,
): Promise<void> {
  const reducers = spacetimeDb.reducers as Record<string, unknown> | null | undefined;
  if (!reducers) {
    throw new Error('SpacetimeDB reducers are unavailable.');
  }

  for (const reducerName of reducerNames) {
    const reducer = reducers[reducerName];
    if (typeof reducer === 'function') {
      await (reducer as (nextArgs: Record<string, unknown>) => Promise<unknown>)(args);
      return;
    }
  }

  throw new Error(`Reducer unavailable: ${reducerNames.join(' / ')}`);
}

export function EventsTab() {
  const { canPerform } = useAdminAuth();
  const canEditEventConfig = canPerform('EDIT_EVENT_CONFIG');
  const { snapshot, loading, error, refetch } = useAdminEventOverview();
  const isNotConnected = error === ADMIN_NOT_CONNECTED_MESSAGE;
  const [persistedConfig, setPersistedConfig] = useState<EventWidgetConfigSnapshot>(
    EVENT_WIDGET_DEFAULT_CONFIG,
  );
  const [form, setForm] = useState<EventWidgetConfigForm>(() =>
    toForm(EVENT_WIDGET_DEFAULT_CONFIG),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [statusTone, setStatusTone] = useState<AdminBannerTone | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const refreshConfigFromDb = useCallback(() => {
    const nextSnapshot = readEventWidgetConfigSnapshot();
    setPersistedConfig(nextSnapshot);
    setForm((currentForm) => (isDirty ? currentForm : toForm(nextSnapshot)));
  }, [isDirty]);

  useEffect(() => {
    refreshConfigFromDb();
    const unsubscribe = subscribeSpacetimeDataChanges((event) => {
      if (event.scopes.includes('events')) {
        refreshConfigFromDb();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [refreshConfigFromDb]);

  const saveDisabledReason = useMemo(
    () => (canEditEventConfig ? undefined : getPermissionLabel('EDIT_EVENT_CONFIG')),
    [canEditEventConfig],
  );

  const onPatchForm = useCallback((patch: Partial<EventWidgetConfigForm>) => {
    setForm((currentForm) => ({ ...currentForm, ...patch }));
    setIsDirty(true);
    setStatusTone(null);
    setStatusMessage('');
  }, []);

  const onResetToPersisted = useCallback(() => {
    setForm(toForm(persistedConfig));
    setIsDirty(false);
    setStatusTone(null);
    setStatusMessage('');
  }, [persistedConfig]);

  const onSave = useCallback(async () => {
    if (!canEditEventConfig) {
      setStatusTone('danger');
      setStatusMessage(getPermissionLabel('EDIT_EVENT_CONFIG'));
      return;
    }

    const drawDurationMinutes = parseBoundedInt(
      form.drawDurationMinutes,
      persistedConfig.drawDurationMinutes,
      EVENT_WIDGET_DRAW_DURATION_MINUTES_MIN,
      EVENT_WIDGET_DRAW_DURATION_MINUTES_MAX,
    );
    const drawIntervalMinutes = parseBoundedInt(
      form.drawIntervalMinutes,
      persistedConfig.drawIntervalMinutes,
      EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MIN,
      Math.min(EVENT_WIDGET_DRAW_INTERVAL_MINUTES_MAX, drawDurationMinutes),
    );
    const entryAmountCash = parseBoundedInt(
      form.entryAmountCash,
      persistedConfig.entryAmountCash,
      EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
      EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX,
    );

    const normalizedNextConfig: EventWidgetConfigSnapshot = {
      enabled: form.enabled,
      entryAmountCash,
      drawDurationMinutes,
      drawIntervalMinutes,
      autoplayEnabled: form.autoplayEnabled,
      updatedBy: persistedConfig.updatedBy,
      updatedAt: persistedConfig.updatedAt,
    };

    const enabledChanged = normalizedNextConfig.enabled !== persistedConfig.enabled;
    const configPatch: Record<string, unknown> = {};

    if (normalizedNextConfig.entryAmountCash !== persistedConfig.entryAmountCash) {
      configPatch.entryAmountCash = normalizedNextConfig.entryAmountCash;
    }
    if (normalizedNextConfig.drawDurationMinutes !== persistedConfig.drawDurationMinutes) {
      configPatch.drawDurationMinutes = normalizedNextConfig.drawDurationMinutes;
    }
    if (normalizedNextConfig.drawIntervalMinutes !== persistedConfig.drawIntervalMinutes) {
      configPatch.drawIntervalMinutes = normalizedNextConfig.drawIntervalMinutes;
    }
    if (normalizedNextConfig.autoplayEnabled !== persistedConfig.autoplayEnabled) {
      configPatch.autoplayEnabled = normalizedNextConfig.autoplayEnabled;
    }

    if (!enabledChanged && Object.keys(configPatch).length === 0) {
      setStatusTone('success');
      setStatusMessage('No event configuration changes to save.');
      setIsDirty(false);
      return;
    }

    setSaveLoading(true);
    setStatusTone(null);
    setStatusMessage('');

    try {
      if (enabledChanged) {
        await callEventReducer(
          ['setEventWidgetEnabled', 'set_event_widget_enabled'],
          { enabled: normalizedNextConfig.enabled },
        );
      }

      if (Object.keys(configPatch).length > 0) {
        await callEventReducer(
          ['setEventWidgetConfig', 'set_event_widget_config'],
          configPatch,
        );
      }

      setIsDirty(false);
      setStatusTone('success');
      setStatusMessage('Event configuration saved.');
      refreshConfigFromDb();
    } catch (nextError) {
      setStatusTone('danger');
      setStatusMessage(toErrorMessage(nextError));
    } finally {
      setSaveLoading(false);
    }
  }, [canEditEventConfig, form, persistedConfig, refreshConfigFromDb]);

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
        subtitle="Write live event runtime configuration and persist changes to SpacetimeDB."
        tone="primary"
      >
        <View style={styles.metricList}>
          <Text style={styles.metricText}>
            Current enabled: {persistedConfig.enabled ? 'true' : 'false'}
          </Text>
          <Text style={styles.metricText}>
            Current entry amount: {persistedConfig.entryAmountCash}
          </Text>
          <Text style={styles.metricText}>
            Current draw duration (minutes): {persistedConfig.drawDurationMinutes}
          </Text>
          <Text style={styles.metricText}>
            Current draw interval (minutes): {persistedConfig.drawIntervalMinutes}
          </Text>
          <Text style={styles.metricText}>
            Current autoplay enabled: {persistedConfig.autoplayEnabled ? 'true' : 'false'}
          </Text>
          <Text style={styles.boundaryText}>
            Last updated by: {persistedConfig.updatedBy || 'Not available'}
          </Text>
          <Text style={styles.boundaryText}>
            Last updated at: {formatUtcLabel(persistedConfig.updatedAt)}
          </Text>
        </View>

        {statusTone && statusMessage ? (
          <AdminActionBanner tone={statusTone} message={statusMessage} />
        ) : null}

        <View style={styles.toggleRow}>
          <AdminButton
            label={form.enabled ? 'Disable widget' : 'Enable widget'}
            tone={form.enabled ? 'danger' : 'success'}
            disabled={!canEditEventConfig}
            disabledReason={saveDisabledReason}
            onPress={() => onPatchForm({ enabled: !form.enabled })}
          />
          <Text style={styles.metricText}>Draft enabled: {form.enabled ? 'true' : 'false'}</Text>
        </View>

        <View style={styles.toggleRow}>
          <AdminButton
            label={form.autoplayEnabled ? 'Disable autoplay' : 'Enable autoplay'}
            tone={form.autoplayEnabled ? 'warning' : 'success'}
            disabled={!canEditEventConfig}
            disabledReason={saveDisabledReason}
            onPress={() => onPatchForm({ autoplayEnabled: !form.autoplayEnabled })}
          />
          <Text style={styles.metricText}>
            Draft autoplay enabled: {form.autoplayEnabled ? 'true' : 'false'}
          </Text>
        </View>

        <AdminTextInput
          value={form.entryAmountCash}
          onChangeText={(value) => onPatchForm({ entryAmountCash: value })}
          placeholder="Entry amount (cash)"
          keyboardType="number-pad"
        />
        <AdminTextInput
          value={form.drawDurationMinutes}
          onChangeText={(value) => onPatchForm({ drawDurationMinutes: value })}
          placeholder="Draw duration minutes"
          keyboardType="number-pad"
        />
        <AdminTextInput
          value={form.drawIntervalMinutes}
          onChangeText={(value) => onPatchForm({ drawIntervalMinutes: value })}
          placeholder="Draw interval minutes"
          keyboardType="number-pad"
        />

        <AdminButton
          label="Save Event Configuration"
          tone="primary"
          loading={saveLoading}
          disabled={!canEditEventConfig || saveLoading}
          disabledReason={saveDisabledReason}
          onPress={() => {
            void onSave();
          }}
        />
        <AdminButton
          label="Reset form to current values"
          tone="neutral"
          disabled={!isDirty}
          onPress={onResetToPersisted}
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
  toggleRow: {
    gap: adminTokens.spacing.gapSm,
  },
});
