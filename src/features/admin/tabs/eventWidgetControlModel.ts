export const EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN = 0;
export const EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX = 1_000_000;
export const EVENT_WIDGET_TIMER_LIMIT_MINUTES_MIN = 1;
export const EVENT_WIDGET_TIMER_LIMIT_MINUTES_MAX = 1_440;
export const EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MIN = 1;
export const EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MAX = 1_440;

export type EventWidgetConfigSnapshot = {
  enabled: boolean;
  entryAmountCash: number;
  drawDurationMinutes: number;
  drawIntervalMinutes: number;
  autoplayEnabled: boolean;
  updatedBy: string;
  updatedAtMs: number | null;
};

export type EventWidgetControlDraft = {
  enabled: boolean;
  entryAmountCashInput: string;
  drawDurationMinutesInput: string;
  drawIntervalMinutesInput: string;
  autoplayEnabled: boolean;
};

export type EventWidgetControlFieldErrorMap = Partial<{
  entryAmountCash: string;
  drawDurationMinutes: string;
  drawIntervalMinutes: string;
}>;

export type EventWidgetConfigSubmitPlan = {
  canSubmit: boolean;
  hasChanges: boolean;
  fieldErrors: EventWidgetControlFieldErrorMap;
  enabledChanged: boolean;
  nextEnabled: boolean;
  configPatch: Partial<{
    entryAmountCash: number;
    drawDurationMinutes: number;
    drawIntervalMinutes: number;
    autoplayEnabled: boolean;
  }>;
};

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseIntegerInput(raw: string): number | null {
  const normalized = raw.trim();
  if (!normalized) return null;
  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function validateBoundedIntegerInput(
  raw: string,
  min: number,
  max: number,
  label: string,
): { value: number; error?: string } {
  const parsed = parseIntegerInput(raw);
  if (parsed === null) {
    return {
      value: min,
      error: `${label} must be a whole number.`,
    };
  }
  if (parsed < min || parsed > max) {
    return {
      value: clampInt(parsed, min, max),
      error: `${label} must be between ${min} and ${max}.`,
    };
  }
  return { value: parsed };
}

export function toEventWidgetControlDraft(
  config: Pick<
    EventWidgetConfigSnapshot,
    'enabled' | 'entryAmountCash' | 'drawDurationMinutes' | 'drawIntervalMinutes' | 'autoplayEnabled'
  >,
): EventWidgetControlDraft {
  return {
    enabled: config.enabled,
    entryAmountCashInput: String(config.entryAmountCash),
    drawDurationMinutesInput: String(config.drawDurationMinutes),
    drawIntervalMinutesInput: String(config.drawIntervalMinutes),
    autoplayEnabled: config.autoplayEnabled,
  };
}

export function buildEventWidgetConfigSubmitPlan(
  currentConfig: Pick<
    EventWidgetConfigSnapshot,
    'enabled' | 'entryAmountCash' | 'drawDurationMinutes' | 'drawIntervalMinutes' | 'autoplayEnabled'
  >,
  draft: EventWidgetControlDraft,
): EventWidgetConfigSubmitPlan {
  const fieldErrors: EventWidgetControlFieldErrorMap = {};

  const entryAmountResult = validateBoundedIntegerInput(
    draft.entryAmountCashInput,
    EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
    EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX,
    'Entry amount',
  );
  if (entryAmountResult.error) {
    fieldErrors.entryAmountCash = entryAmountResult.error;
  }

  const drawDurationResult = validateBoundedIntegerInput(
    draft.drawDurationMinutesInput,
    EVENT_WIDGET_TIMER_LIMIT_MINUTES_MIN,
    EVENT_WIDGET_TIMER_LIMIT_MINUTES_MAX,
    'Timer limit',
  );
  if (drawDurationResult.error) {
    fieldErrors.drawDurationMinutes = drawDurationResult.error;
  }

  const drawIntervalResult = validateBoundedIntegerInput(
    draft.drawIntervalMinutesInput,
    EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MIN,
    EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MAX,
    'Autoplay frequency',
  );
  if (drawIntervalResult.error) {
    fieldErrors.drawIntervalMinutes = drawIntervalResult.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      canSubmit: false,
      hasChanges: false,
      fieldErrors,
      enabledChanged: currentConfig.enabled !== draft.enabled,
      nextEnabled: draft.enabled,
      configPatch: {},
    };
  }

  const drawDurationMinutes = clampInt(
    drawDurationResult.value,
    EVENT_WIDGET_TIMER_LIMIT_MINUTES_MIN,
    EVENT_WIDGET_TIMER_LIMIT_MINUTES_MAX,
  );
  const drawIntervalMinutes = Math.min(
    drawDurationMinutes,
    clampInt(
      drawIntervalResult.value,
      EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MIN,
      EVENT_WIDGET_AUTOPLAY_FREQUENCY_MINUTES_MAX,
    ),
  );
  const entryAmountCash = clampInt(
    entryAmountResult.value,
    EVENT_WIDGET_ENTRY_AMOUNT_CASH_MIN,
    EVENT_WIDGET_ENTRY_AMOUNT_CASH_MAX,
  );

  const configPatch: EventWidgetConfigSubmitPlan['configPatch'] = {};
  if (currentConfig.entryAmountCash !== entryAmountCash) {
    configPatch.entryAmountCash = entryAmountCash;
  }
  if (currentConfig.drawDurationMinutes !== drawDurationMinutes) {
    configPatch.drawDurationMinutes = drawDurationMinutes;
  }
  if (currentConfig.drawIntervalMinutes !== drawIntervalMinutes) {
    configPatch.drawIntervalMinutes = drawIntervalMinutes;
  }
  if (currentConfig.autoplayEnabled !== draft.autoplayEnabled) {
    configPatch.autoplayEnabled = draft.autoplayEnabled;
  }

  const enabledChanged = currentConfig.enabled !== draft.enabled;
  const hasChanges = enabledChanged || Object.keys(configPatch).length > 0;

  return {
    canSubmit: true,
    hasChanges,
    fieldErrors: {},
    enabledChanged,
    nextEnabled: draft.enabled,
    configPatch,
  };
}
