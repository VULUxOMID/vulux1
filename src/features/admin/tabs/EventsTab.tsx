import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TelemetryPlaceholder } from '../components/TelemetryPlaceholder';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useAdminEventOverview } from '../hooks/useAdminEventOverview';
import { ADMIN_NOT_CONNECTED_MESSAGE } from '../hooks/useAdminBackend';
import { useAdminEventWidgetConfig } from '../hooks/useAdminEventWidgetConfig';
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
import {
  buildEventWidgetConfigSubmitPlan,
  EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MAX,
  EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MIN,
  EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX,
  EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
  EVENT_WIDGET_TIMER_LIMIT_MINUTES_MAX,
  EVENT_WIDGET_TIMER_LIMIT_MINUTES_MIN,
  toEventWidgetControlDraft,
  type EventWidgetControlDraft,
} from './eventWidgetControlModel';

function formatUtcLabel(iso: string): string {
  if (!iso) {
    return 'Not available';
  }

  return iso.replace('T', ' ').replace('.000Z', 'Z');
}

function formatUtcLabelFromMs(valueMs: number | null): string {
  if (!valueMs || !Number.isFinite(valueMs)) {
    return 'Not available';
  }

  return formatUtcLabel(new Date(valueMs).toISOString());
}

export function EventsTab() {
  const { canPerform } = useAdminAuth();
  const canEditEventConfig = canPerform('EDIT_EVENT_CONFIG');
  const overview = useAdminEventOverview();
  const config = useAdminEventWidgetConfig();
  const [draft, setDraft] = useState<EventWidgetControlDraft | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    tone: 'success' | 'warning' | 'danger';
    message: string;
  } | null>(null);

  const overviewSnapshot = overview.snapshot;
  const overviewError = overview.error;
  const isOverviewNotConnected = overviewError === ADMIN_NOT_CONNECTED_MESSAGE;

  useEffect(() => {
    if (config.snapshot && draft === null) {
      setDraft(toEventWidgetControlDraft(config.snapshot));
    }
  }, [config.snapshot, draft]);

  const submitPlan = useMemo(() => {
    if (!config.snapshot || !draft) {
      return null;
    }

    return buildEventWidgetConfigSubmitPlan(config.snapshot, draft);
  }, [config.snapshot, draft]);

  const latestUpdateAtLabel = formatUtcLabelFromMs(config.snapshot?.updatedAtMs ?? null);
  const latestUpdatedBy = config.snapshot?.updatedBy?.trim() || 'Unknown';

  const canSubmit = Boolean(canEditEventConfig && submitPlan?.canSubmit && submitPlan?.hasChanges);
  const saveDisabledReason = !canEditEventConfig
    ? getPermissionLabel('EDIT_EVENT_CONFIG')
    : submitPlan && !submitPlan.canSubmit
      ? 'Fix validation errors before saving.'
      : 'No configuration changes to save.';

  const clearTransientErrors = () => {
    if (actionMessage?.tone === 'danger') {
      setActionMessage(null);
    }
    if (config.saveError) {
      config.clearSaveError();
    }
  };

  const updateDraft = (patch: Partial<EventWidgetControlDraft>) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        ...patch,
      };
    });
    clearTransientErrors();
  };

  const handleSaveConfig = async () => {
    if (!draft) {
      return;
    }

    const result = await config.saveDraft(draft);
    if (!result.ok) {
      setActionMessage({
        tone: 'danger',
        message: result.error ?? 'Failed to update event widget config.',
      });
      return;
    }

    if (!result.changed) {
      setActionMessage({
        tone: 'warning',
        message: 'No configuration changes to save.',
      });
      return;
    }

    setActionMessage({
      tone: 'success',
      message: 'Event widget configuration saved.',
    });
    if (result.snapshot) {
      setDraft(toEventWidgetControlDraft(result.snapshot));
    }
  };

  const handleRetrySave = async () => {
    const result = await config.retryLastFailedSave();
    if (!result.ok) {
      setActionMessage({
        tone: 'danger',
        message: result.error ?? 'Retry failed.',
      });
      return;
    }

    setActionMessage({
      tone: 'success',
      message: result.changed
        ? 'Event widget configuration retry succeeded.'
        : 'Event widget configuration is already up to date.',
    });
    if (result.snapshot) {
      setDraft(toEventWidgetControlDraft(result.snapshot));
    }
  };

  const handleRefreshConfig = async () => {
    const nextSnapshot = await config.refetch();
    if (nextSnapshot) {
      setDraft(toEventWidgetControlDraft(nextSnapshot));
      setActionMessage({
        tone: 'success',
        message: 'Config reloaded from server.',
      });
    }
  };

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

      {overviewError && !isOverviewNotConnected ? (
        <AdminActionBanner tone="danger" message={overviewError} />
      ) : null}
      {config.error ? <AdminActionBanner tone="danger" message={config.error} /> : null}
      {actionMessage ? (
        <AdminActionBanner tone={actionMessage.tone} message={actionMessage.message} />
      ) : null}

      {isOverviewNotConnected ? (
        <TelemetryPlaceholder detail="Spacetime event overview is not connected yet." />
      ) : null}

      <ReadOnlyCard
        title="Admin overview cards"
        subtitle={overviewSnapshot ? `As of ${formatUtcLabel(overviewSnapshot.asOfIsoUtc)}` : 'Waiting for event metrics'}
        footer={
          <View style={styles.metaRow}>
            <AdminBadge
              label={`Timezone ${overviewSnapshot?.bucketTimezone ?? 'UTC'}`}
              tone="primary"
            />
            <AdminBadge
              label={`Active window ${Math.round((overviewSnapshot?.activeWindowMs ?? 0) / 1000)}s`}
              tone="neutral"
            />
          </View>
        }
      >
        <View style={styles.metricGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Active players now</Text>
            <Text style={styles.metricValue}>{overviewSnapshot?.activePlayersNow ?? 0}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total played today</Text>
            <Text style={styles.metricValue}>{overviewSnapshot?.totalEntriesToday ?? 0}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total played week</Text>
            <Text style={styles.metricValue}>{overviewSnapshot?.totalEntriesWeek ?? 0}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total played month</Text>
            <Text style={styles.metricValue}>{overviewSnapshot?.totalEntriesMonth ?? 0}</Text>
          </View>
        </View>
      </ReadOnlyCard>

      <ReadOnlyCard
        title="Aggregate buckets"
        subtitle="Totals are deduped by player within UTC bucket windows."
      >
        <View style={styles.metricList}>
          <Text style={styles.metricText}>Players today (UTC): {overviewSnapshot?.totalPlayersToday ?? 0}</Text>
          <Text style={styles.metricText}>Players this week (UTC): {overviewSnapshot?.totalPlayersWeek ?? 0}</Text>
          <Text style={styles.metricText}>Players this month (UTC): {overviewSnapshot?.totalPlayersMonth ?? 0}</Text>
        </View>
        <View style={styles.boundaryList}>
          <Text style={styles.boundaryText}>
            Today starts: {formatUtcLabel(overviewSnapshot?.todayStartIsoUtc ?? '')}
          </Text>
          <Text style={styles.boundaryText}>
            Week starts: {formatUtcLabel(overviewSnapshot?.weekStartIsoUtc ?? '')}
          </Text>
          <Text style={styles.boundaryText}>
            Month starts: {formatUtcLabel(overviewSnapshot?.monthStartIsoUtc ?? '')}
          </Text>
        </View>
        <AdminButton
          label="Refresh overview"
          tone="primary"
          loading={overview.loading}
          onPress={() => {
            void overview.refetch();
          }}
        />
      </ReadOnlyCard>

      <ActionCard
        title="Configuration"
        subtitle="Controls are server-authoritative and validated with min/max guardrails before submit."
        tone="primary"
      >
        <View style={styles.metaRow}>
          <AdminBadge label={`Updated by ${latestUpdatedBy}`} tone="neutral" />
          <AdminBadge label={`Updated at ${latestUpdateAtLabel}`} tone="neutral" />
          {config.lastSavedAtMs ? (
            <AdminBadge label={`Last save ${formatUtcLabelFromMs(config.lastSavedAtMs)}`} tone="success" />
          ) : null}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Widget status</Text>
          <AdminButton
            label={draft?.enabled ? 'Disable widget' : 'Enable widget'}
            tone={draft?.enabled ? 'warning' : 'success'}
            disabled={!draft || !canEditEventConfig}
            disabledReason={!canEditEventConfig ? getPermissionLabel('EDIT_EVENT_CONFIG') : undefined}
            onPress={() => {
              if (!draft) return;
              updateDraft({ enabled: !draft.enabled });
            }}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Entry amount ({EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN} to {EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX})
          </Text>
          <AdminTextInput
            value={draft?.entryAmountCashInput ?? ''}
            onChangeText={(value) => updateDraft({ entryAmountCashInput: value })}
            placeholder={String(EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN)}
            keyboardType="number-pad"
          />
          {submitPlan?.fieldErrors.entryAmountCash ? (
            <Text style={styles.fieldError}>{submitPlan.fieldErrors.entryAmountCash}</Text>
          ) : (
            <Text style={styles.inputHint}>Whole number cash amount required to enter an event.</Text>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Timer limit minutes ({EVENT_WIDGET_TIMER_LIMIT_MINUTES_MIN} to {EVENT_WIDGET_TIMER_LIMIT_MINUTES_MAX})
          </Text>
          <AdminTextInput
            value={draft?.drawDurationMinutesInput ?? ''}
            onChangeText={(value) => updateDraft({ drawDurationMinutesInput: value })}
            placeholder={String(EVENT_WIDGET_TIMER_LIMIT_MINUTES_MIN)}
            keyboardType="number-pad"
          />
          {submitPlan?.fieldErrors.drawDurationMinutes ? (
            <Text style={styles.fieldError}>{submitPlan.fieldErrors.drawDurationMinutes}</Text>
          ) : (
            <Text style={styles.inputHint}>Event rounds auto-close when timer limit is reached.</Text>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Autoplay frequency minutes ({EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MIN} to {EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MAX})
          </Text>
          <AdminTextInput
            value={draft?.drawIntervalMinutesInput ?? ''}
            onChangeText={(value) => updateDraft({ drawIntervalMinutesInput: value })}
            placeholder={String(EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MIN)}
            keyboardType="number-pad"
          />
          {submitPlan?.fieldErrors.drawIntervalMinutes ? (
            <Text style={styles.fieldError}>{submitPlan.fieldErrors.drawIntervalMinutes}</Text>
          ) : (
            <Text style={styles.inputHint}>
              Autoplay cadence is capped to the timer limit on submit.
            </Text>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Autoplay status</Text>
          <AdminButton
            label={draft?.autoplayEnabled ? 'Autoplay on' : 'Autoplay off'}
            tone={draft?.autoplayEnabled ? 'primary' : 'neutral'}
            disabled={!draft || !canEditEventConfig}
            disabledReason={!canEditEventConfig ? getPermissionLabel('EDIT_EVENT_CONFIG') : undefined}
            onPress={() => {
              if (!draft) return;
              updateDraft({ autoplayEnabled: !draft.autoplayEnabled });
            }}
          />
        </View>

        {config.saveError ? (
          <AdminActionBanner tone="danger" message={config.saveError} />
        ) : null}

        <View style={styles.buttonRow}>
          <AdminButton
            label="Save event configuration"
            tone="primary"
            loading={config.saving}
            disabled={!canSubmit}
            disabledReason={saveDisabledReason}
            onPress={() => {
              void handleSaveConfig();
            }}
          />
          <AdminButton
            label="Reload from server"
            tone="neutral"
            loading={config.loading}
            onPress={() => {
              void handleRefreshConfig();
            }}
          />
          {config.hasRetryableSave ? (
            <AdminButton
              label="Retry failed save"
              tone="warning"
              loading={config.saving}
              onPress={() => {
                void handleRetrySave();
              }}
            />
          ) : null}
        </View>

        <AdminButton
          label="Reset draft to live config"
          tone="neutral"
          disabled={!config.snapshot}
          onPress={() => {
            if (!config.snapshot) return;
            setDraft(toEventWidgetControlDraft(config.snapshot));
            setActionMessage(null);
            config.clearSaveError();
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
  metricList: {
    gap: adminTokens.spacing.gapSm,
  },
  metricText: {
    ...adminTokens.typography.body,
    color: adminTokens.colors.textSecondary,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: adminTokens.spacing.gapSm,
  },
  metricCard: {
    borderWidth: adminTokens.border.width,
    borderColor: adminTokens.colors.border,
    borderRadius: adminTokens.radius.input,
    backgroundColor: adminTokens.colors.surfaceAlt,
    padding: adminTokens.spacing.gapMd,
    minWidth: 148,
    flexGrow: 1,
    gap: 4,
  },
  metricLabel: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  metricValue: {
    ...adminTokens.typography.sectionTitle,
    color: adminTokens.colors.textPrimary,
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
  inputGroup: {
    gap: adminTokens.spacing.gapSm,
  },
  label: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  inputHint: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.textSecondary,
  },
  fieldError: {
    ...adminTokens.typography.caption,
    color: adminTokens.colors.danger,
  },
  buttonRow: {
    gap: adminTokens.spacing.gapSm,
  },
});
