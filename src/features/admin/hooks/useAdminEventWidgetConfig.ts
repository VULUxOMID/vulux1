import { useCallback, useEffect, useState } from 'react';

import { subscribeSpacetimeDataChanges, spacetimeDb } from '../../../lib/spacetime';
import {
  buildEventWidgetConfigSubmitPlan,
  EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MAX,
  EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MIN,
  EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX,
  EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
  EVENT_WIDGET_TIMER_LIMIT_MINUTES_MAX,
  EVENT_WIDGET_TIMER_LIMIT_MINUTES_MIN,
  type EventWidgetConfigSnapshot,
  type EventWidgetConfigSubmitPlan,
  type EventWidgetControlDraft,
} from '../tabs/eventWidgetControlModel';

const DEFAULT_REFRESH_INTERVAL_MS = 10_000;

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : fallback;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function toTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? Math.floor(asNumber) : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const fromDate = Date.parse(value);
    if (Number.isFinite(fromDate)) {
      return Math.floor(fromDate);
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  }
  if (value && typeof value === 'object') {
    const withToMillis = value as { toMillis?: () => unknown };
    if (typeof withToMillis.toMillis === 'function') {
      const fromToMillis = toFiniteNumber(withToMillis.toMillis(), Number.NaN);
      if (Number.isFinite(fromToMillis)) {
        return Math.floor(fromToMillis);
      }
    }
    const withMicros = value as {
      microsSinceUnixEpoch?: unknown;
      __timestamp_micros_since_unix_epoch__?: unknown;
    };
    const micros = toFiniteNumber(
      withMicros.microsSinceUnixEpoch ?? withMicros.__timestamp_micros_since_unix_epoch__,
      Number.NaN,
    );
    if (Number.isFinite(micros)) {
      return Math.floor(micros / 1000);
    }
  }
  return null;
}

function readEventWidgetConfigSnapshot(): EventWidgetConfigSnapshot {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(
    dbView?.eventWidgetConfigItem?.iter?.() ?? dbView?.event_widget_config_item?.iter?.() ?? [],
  );
  const row = rows[0];

  if (!row) {
    return {
      enabled: true,
      entryAmountCash: EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
      drawDurationMinutes: 15,
      drawIntervalMinutes: 15,
      autoplayEnabled: true,
      updatedBy: '',
      updatedAtMs: null,
    };
  }

  const drawDurationMinutes = clampInt(
    toFiniteNumber(
      row.drawDurationMinutes ?? row.draw_duration_minutes,
      EVENT_WIDGET_TIMER_LIMIT_MINUTES_MIN,
    ),
    EVENT_WIDGET_TIMER_LIMIT_MINUTES_MIN,
    EVENT_WIDGET_TIMER_LIMIT_MINUTES_MAX,
  );

  const drawIntervalMinutes = Math.min(
    drawDurationMinutes,
    clampInt(
      toFiniteNumber(
        row.drawIntervalMinutes ?? row.draw_interval_minutes,
        EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MIN,
      ),
      EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MIN,
      EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MAX,
    ),
  );

  return {
    enabled: (row.enabled ?? true) !== false,
    entryAmountCash: clampInt(
      toFiniteNumber(
        row.entryAmountCash ?? row.entry_amount_cash,
        EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
      ),
      EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
      EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX,
    ),
    drawDurationMinutes,
    drawIntervalMinutes,
    autoplayEnabled: (row.autoplayEnabled ?? row.autoplay_enabled ?? true) !== false,
    updatedBy: toText(row.updatedBy ?? row.updated_by),
    updatedAtMs: toTimestampMs(row.updatedAt ?? row.updated_at),
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return 'Failed to save event widget config.';
}

type SaveResult = {
  ok: boolean;
  changed: boolean;
  error?: string;
  validationErrors?: EventWidgetConfigSubmitPlan['fieldErrors'];
  snapshot?: EventWidgetConfigSnapshot;
};

function sanitizePatch(
  patch: EventWidgetConfigSubmitPlan['configPatch'],
): EventWidgetConfigSubmitPlan['configPatch'] {
  const nextPatch: EventWidgetConfigSubmitPlan['configPatch'] = {};

  if (typeof patch.entryAmountCash === 'number' && Number.isFinite(patch.entryAmountCash)) {
    nextPatch.entryAmountCash = clampInt(
      patch.entryAmountCash,
      EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
      EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX,
    );
  }
  if (typeof patch.drawDurationMinutes === 'number' && Number.isFinite(patch.drawDurationMinutes)) {
    nextPatch.drawDurationMinutes = clampInt(
      patch.drawDurationMinutes,
      EVENT_WIDGET_TIMER_LIMIT_MINUTES_MIN,
      EVENT_WIDGET_TIMER_LIMIT_MINUTES_MAX,
    );
  }
  if (typeof patch.drawIntervalMinutes === 'number' && Number.isFinite(patch.drawIntervalMinutes)) {
    nextPatch.drawIntervalMinutes = clampInt(
      patch.drawIntervalMinutes,
      EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MIN,
      EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MAX,
    );
  }
  if (typeof patch.autoplayEnabled === 'boolean') {
    nextPatch.autoplayEnabled = patch.autoplayEnabled;
  }

  if (
    typeof nextPatch.drawDurationMinutes === 'number' &&
    typeof nextPatch.drawIntervalMinutes === 'number'
  ) {
    nextPatch.drawIntervalMinutes = Math.min(
      nextPatch.drawDurationMinutes,
      nextPatch.drawIntervalMinutes,
    );
  }

  return nextPatch;
}

async function executeSubmitPlan(plan: EventWidgetConfigSubmitPlan): Promise<void> {
  const reducers = spacetimeDb.reducers as any;
  const setConfigReducer = reducers?.setEventWidgetConfig;
  const setEnabledReducer = reducers?.setEventWidgetEnabled;

  if (typeof setConfigReducer !== 'function' || typeof setEnabledReducer !== 'function') {
    throw new Error('Event config reducers are unavailable.');
  }

  const configPatch = sanitizePatch(plan.configPatch);
  const hasConfigPatch = Object.keys(configPatch).length > 0;

  if (hasConfigPatch) {
    await setConfigReducer(configPatch);
  }

  if (plan.enabledChanged) {
    await setEnabledReducer({ enabled: plan.nextEnabled });
  }
}

export function useAdminEventWidgetConfig(
  refreshIntervalMs: number = DEFAULT_REFRESH_INTERVAL_MS,
) {
  const [snapshot, setSnapshot] = useState<EventWidgetConfigSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAtMs, setLastSavedAtMs] = useState<number | null>(null);
  const [lastFailedPlan, setLastFailedPlan] = useState<EventWidgetConfigSubmitPlan | null>(null);

  const refetch = useCallback(async () => {
    try {
      const nextSnapshot = readEventWidgetConfigSnapshot();
      setSnapshot(nextSnapshot);
      setError(null);
      setLoading(false);
      return nextSnapshot;
    } catch (nextError) {
      setError(describeError(nextError));
      setLoading(false);
      return null;
    }
  }, []);

  const runPlan = useCallback(
    async (plan: EventWidgetConfigSubmitPlan): Promise<SaveResult> => {
      if (!plan.canSubmit) {
        return {
          ok: false,
          changed: false,
          error: 'Fix validation errors before saving.',
          validationErrors: plan.fieldErrors,
        };
      }
      if (!plan.hasChanges) {
        return {
          ok: true,
          changed: false,
          snapshot: snapshot ?? undefined,
        };
      }

      setSaving(true);
      setSaveError(null);
      try {
        await executeSubmitPlan(plan);
        setLastFailedPlan(null);
        const nextSnapshot = await refetch();
        setLastSavedAtMs(Date.now());
        return {
          ok: true,
          changed: true,
          snapshot: nextSnapshot ?? undefined,
        };
      } catch (nextError) {
        const message = describeError(nextError);
        setSaveError(message);
        setLastFailedPlan(plan);
        return {
          ok: false,
          changed: true,
          error: message,
        };
      } finally {
        setSaving(false);
      }
    },
    [refetch, snapshot],
  );

  const saveDraft = useCallback(
    async (draft: EventWidgetControlDraft): Promise<SaveResult> => {
      if (!snapshot) {
        return {
          ok: false,
          changed: false,
          error: 'Event config not loaded yet.',
        };
      }

      const plan = buildEventWidgetConfigSubmitPlan(snapshot, draft);
      return runPlan(plan);
    },
    [runPlan, snapshot],
  );

  const retryLastFailedSave = useCallback(async (): Promise<SaveResult> => {
    if (!lastFailedPlan) {
      return {
        ok: false,
        changed: false,
        error: 'No failed config update to retry.',
      };
    }

    return runPlan(lastFailedPlan);
  }, [lastFailedPlan, runPlan]);

  useEffect(() => {
    void refetch();

    const unsubscribe = subscribeSpacetimeDataChanges((event) => {
      if (event.scopes.includes('events')) {
        void refetch();
      }
    });

    if (refreshIntervalMs <= 0) {
      return () => {
        unsubscribe();
      };
    }

    const interval = setInterval(() => {
      void refetch();
    }, refreshIntervalMs);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [refetch, refreshIntervalMs]);

  return {
    snapshot,
    loading,
    error,
    refetch,
    saving,
    saveError,
    clearSaveError: () => setSaveError(null),
    lastSavedAtMs,
    hasRetryableSave: Boolean(lastFailedPlan),
    saveDraft,
    retryLastFailedSave,
  };
}
