import AsyncStorage from '@react-native-async-storage/async-storage';

const ADMIN_IDLE_TIMEOUT_STORAGE_KEY = 'vulu.admin.idle-timeout-minutes';

export const DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES = 15;
export const MIN_ADMIN_IDLE_TIMEOUT_MINUTES = 2;
export const MAX_ADMIN_IDLE_TIMEOUT_MINUTES = 120;
export const ADMIN_IDLE_WARNING_MS = 60 * 1000;

function normalizeTimeoutMinutes(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES;
  }

  const rounded = Math.round(parsed);
  if (rounded < MIN_ADMIN_IDLE_TIMEOUT_MINUTES) {
    return MIN_ADMIN_IDLE_TIMEOUT_MINUTES;
  }
  if (rounded > MAX_ADMIN_IDLE_TIMEOUT_MINUTES) {
    return MAX_ADMIN_IDLE_TIMEOUT_MINUTES;
  }
  return rounded;
}

export async function getAdminSessionTimeoutMinutes(): Promise<number> {
  try {
    const storedValue = await AsyncStorage.getItem(ADMIN_IDLE_TIMEOUT_STORAGE_KEY);
    return normalizeTimeoutMinutes(storedValue);
  } catch {
    return DEFAULT_ADMIN_IDLE_TIMEOUT_MINUTES;
  }
}

export async function setAdminSessionTimeoutMinutes(minutes: number): Promise<number> {
  const normalized = normalizeTimeoutMinutes(minutes);
  await AsyncStorage.setItem(ADMIN_IDLE_TIMEOUT_STORAGE_KEY, String(normalized));
  return normalized;
}

export function getAdminSessionTimeoutMs(minutes: number): number {
  return normalizeTimeoutMinutes(minutes) * 60 * 1000;
}

export function formatAdminSessionTimeout(minutes: number): string {
  const normalized = normalizeTimeoutMinutes(minutes);
  return `${normalized} minute${normalized === 1 ? '' : 's'}`;
}
