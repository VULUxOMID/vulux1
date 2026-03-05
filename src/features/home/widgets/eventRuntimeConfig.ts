import type { LivePresence } from '../../../data/contracts';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function parseEnvNumber(name: string, min: number, max: number, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < min || normalized > max) return fallback;
  return normalized;
}

function parseEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (value === 0) return false;
    if (value === 1) return true;
    return null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return null;
}

function readNumberByKeys(
  source: UnknownRecord | null,
  keys: readonly string[],
  min: number,
  max: number,
): number | null {
  if (!source) return null;
  for (const key of keys) {
    const candidate = readNumber(source[key]);
    if (candidate === null) continue;
    const normalized = Math.floor(candidate);
    if (normalized < min || normalized > max) continue;
    return normalized;
  }
  return null;
}

function readBooleanByKeys(source: UnknownRecord | null, keys: readonly string[]): boolean | null {
  if (!source) return null;
  for (const key of keys) {
    const candidate = readBoolean(source[key]);
    if (candidate === null) continue;
    return candidate;
  }
  return null;
}

export type EventWidgetRuntimeConfig = {
  enabled: boolean;
  entryAmount: number;
  drawDurationMinutes: number;
  drawIntervalMinutes: number;
  autoplayFrequencySeconds: number;
};

export const EVENT_WIDGET_DEFAULT_RUNTIME_CONFIG: EventWidgetRuntimeConfig = {
  enabled: parseEnvBoolean('EXPO_PUBLIC_EVENT_ENABLED', true),
  entryAmount: parseEnvNumber('EXPO_PUBLIC_EVENT_ENTRY_COST', 0, 1_000_000, 0),
  drawDurationMinutes: parseEnvNumber('EXPO_PUBLIC_EVENT_DRAW_MINUTES', 1, 1_440, 15),
  drawIntervalMinutes: parseEnvNumber('EXPO_PUBLIC_EVENT_DRAW_INTERVAL_MINUTES', 1, 1_440, 15),
  autoplayFrequencySeconds: parseEnvNumber('EXPO_PUBLIC_EVENT_AUTOPLAY_FREQUENCY_SECONDS', 0, 3_600, 0),
};

function pickRuntimeSource(accountState: UnknownRecord | null | undefined): UnknownRecord | null {
  const state = asRecord(accountState);
  if (!state) return null;

  const eventWidget = asRecord(state.eventWidget);
  const candidates = [
    asRecord(state.eventWidgetRuntime),
    asRecord(state.eventWidgetConfig),
    asRecord(state.eventConfig),
    asRecord(state.liveEventConfig),
    asRecord(eventWidget?.runtime),
    asRecord(eventWidget?.config),
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function resolveEventWidgetRuntimeConfig(
  accountState: UnknownRecord | null | undefined,
): EventWidgetRuntimeConfig {
  const source = pickRuntimeSource(accountState);

  const enabled =
    readBooleanByKeys(source, ['enabled', 'isEnabled']) ??
    EVENT_WIDGET_DEFAULT_RUNTIME_CONFIG.enabled;

  const entryAmount =
    readNumberByKeys(
      source,
      ['entryAmount', 'entryCost', 'ticketCost', 'entryFee', 'amount'],
      0,
      1_000_000,
    ) ?? EVENT_WIDGET_DEFAULT_RUNTIME_CONFIG.entryAmount;

  const drawDurationMinutes =
    readNumberByKeys(
      source,
      ['drawDurationMinutes', 'drawDuration', 'drawMinutes', 'timerMinutes'],
      1,
      1_440,
    ) ?? EVENT_WIDGET_DEFAULT_RUNTIME_CONFIG.drawDurationMinutes;

  const drawIntervalMinutes =
    readNumberByKeys(
      source,
      ['drawIntervalMinutes', 'drawInterval', 'intervalMinutes', 'resultIntervalMinutes'],
      1,
      1_440,
    ) ??
    drawDurationMinutes ??
    EVENT_WIDGET_DEFAULT_RUNTIME_CONFIG.drawIntervalMinutes;

  const autoplayFrequencySeconds =
    readNumberByKeys(
      source,
      ['autoplayFrequencySeconds', 'autoplaySeconds', 'autoplayIntervalSeconds'],
      0,
      3_600,
    ) ??
    (() => {
      const minutes =
        readNumberByKeys(source, ['autoplayFrequencyMinutes', 'autoplayMinutes'], 0, 60) ?? null;
      if (minutes !== null) return minutes * 60;
      const millis = readNumberByKeys(source, ['autoplayFrequencyMs', 'autoplayIntervalMs'], 0, 3_600_000);
      return millis !== null ? Math.floor(millis / 1000) : null;
    })() ??
    EVENT_WIDGET_DEFAULT_RUNTIME_CONFIG.autoplayFrequencySeconds;

  return {
    enabled,
    entryAmount,
    drawDurationMinutes,
    drawIntervalMinutes,
    autoplayFrequencySeconds,
  };
}

export function countDistinctActivePlayersNow(
  presence: LivePresence[],
  options?: {
    nowMs?: number;
    freshnessWindowMs?: number;
  },
): number {
  const nowMs = options?.nowMs ?? Date.now();
  const freshnessWindowMs = options?.freshnessWindowMs ?? 30_000;
  const cutoff = nowMs - Math.max(1_000, freshnessWindowMs);
  const activeUserIds = new Set<string>();

  for (const entry of presence) {
    if (!entry?.userId) continue;
    if (entry.activity !== 'hosting' && entry.activity !== 'watching') continue;
    if (!Number.isFinite(entry.updatedAt) || entry.updatedAt < cutoff) continue;
    activeUserIds.add(entry.userId);
  }

  return activeUserIds.size;
}
