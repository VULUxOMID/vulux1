export const PROFILE_VIEW_METRIC_NAME = 'profile_views';
export const PROFILE_VIEW_METRIC_VERSION_LEGACY = 'legacy';
export const PROFILE_VIEW_METRIC_VERSION_V2 = 'v2';

export const PROFILE_VIEW_DEFAULT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;
export const PROFILE_VIEW_MAX_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ProfileViewDropReason =
  | 'invalid_payload'
  | 'self_view_excluded'
  | 'before_metric_cutover'
  | 'within_dedupe_window';

export type ProfileViewDecision =
  | {
      counted: true;
      dropReason: null;
      occurredAtMs: number;
      dedupeWindowMs: number;
    }
  | {
      counted: false;
      dropReason: ProfileViewDropReason;
      occurredAtMs: number;
      dedupeWindowMs: number;
    };

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = readNumber(value);
  if (parsed === null) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function normalizeProfileViewDedupeWindowMs(rawValue: unknown): number {
  const parsed = toNonNegativeInt(rawValue, PROFILE_VIEW_DEFAULT_DEDUPE_WINDOW_MS);
  if (parsed <= 0) return PROFILE_VIEW_DEFAULT_DEDUPE_WINDOW_MS;
  return Math.min(parsed, PROFILE_VIEW_MAX_DEDUPE_WINDOW_MS);
}

export function evaluateProfileViewDecision(params: {
  viewerUserId: string | null | undefined;
  profileUserId: string | null | undefined;
  nowMs: number;
  occurredAtMs: unknown;
  cutoverAtMs: unknown;
  dedupeWindowMs: unknown;
  lastCountedAtMs: unknown;
}): ProfileViewDecision {
  const occurredAtMs = toNonNegativeInt(params.occurredAtMs, Math.max(0, Math.floor(params.nowMs)));
  const cutoverAtMs = toNonNegativeInt(params.cutoverAtMs, 0);
  const dedupeWindowMs = normalizeProfileViewDedupeWindowMs(params.dedupeWindowMs);
  const lastCountedAtMs = toNonNegativeInt(params.lastCountedAtMs, -1);

  const viewerUserId = typeof params.viewerUserId === 'string' ? params.viewerUserId.trim() : '';
  const profileUserId = typeof params.profileUserId === 'string' ? params.profileUserId.trim() : '';
  if (!viewerUserId || !profileUserId) {
    return {
      counted: false,
      dropReason: 'invalid_payload',
      occurredAtMs,
      dedupeWindowMs,
    };
  }

  if (viewerUserId === profileUserId) {
    return {
      counted: false,
      dropReason: 'self_view_excluded',
      occurredAtMs,
      dedupeWindowMs,
    };
  }

  if (occurredAtMs < cutoverAtMs) {
    return {
      counted: false,
      dropReason: 'before_metric_cutover',
      occurredAtMs,
      dedupeWindowMs,
    };
  }

  if (lastCountedAtMs >= 0 && occurredAtMs - lastCountedAtMs < dedupeWindowMs) {
    return {
      counted: false,
      dropReason: 'within_dedupe_window',
      occurredAtMs,
      dedupeWindowMs,
    };
  }

  return {
    counted: true,
    dropReason: null,
    occurredAtMs,
    dedupeWindowMs,
  };
}
