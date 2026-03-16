export const PROFILE_VIEW_CLIENT_DEFAULT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;
export const PROFILE_VIEW_CLIENT_MAX_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ProfileViewClientDropReason =
  | 'invalid_payload'
  | 'self_view_excluded'
  | 'within_dedupe_window';

export type ProfileViewClientDecision =
  | {
      shouldTrack: true;
      dropReason: null;
      openedAtMs: number;
      dedupeWindowMs: number;
      viewerUserId: string;
      profileUserId: string;
      pairKey: string;
    }
  | {
      shouldTrack: false;
      dropReason: ProfileViewClientDropReason;
      openedAtMs: number;
      dedupeWindowMs: number;
      viewerUserId: string;
      profileUserId: string;
      pairKey: string | null;
    };

function normalizeProfileViewValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function normalizeProfileViewOpenedAtMs(value: unknown, fallbackNowMs = Date.now()): number {
  return toNonNegativeInt(value, Math.max(0, Math.floor(fallbackNowMs)));
}

export function normalizeProfileViewClientDedupeWindowMs(rawValue: unknown): number {
  const parsed = toNonNegativeInt(rawValue, PROFILE_VIEW_CLIENT_DEFAULT_DEDUPE_WINDOW_MS);
  if (parsed <= 0) return PROFILE_VIEW_CLIENT_DEFAULT_DEDUPE_WINDOW_MS;
  return Math.min(parsed, PROFILE_VIEW_CLIENT_MAX_DEDUPE_WINDOW_MS);
}

export function buildProfileViewPairKey(viewerUserId: string, profileUserId: string): string | null {
  const normalizedViewerUserId = normalizeProfileViewValue(viewerUserId);
  const normalizedProfileUserId = normalizeProfileViewValue(profileUserId);
  if (!normalizedViewerUserId || !normalizedProfileUserId) {
    return null;
  }
  return `${normalizedViewerUserId}::${normalizedProfileUserId}`;
}

export function buildProfileViewEventId(params: {
  viewerUserId: string;
  profileUserId: string;
  openedAtMs: number;
}): string | null {
  const pairKey = buildProfileViewPairKey(params.viewerUserId, params.profileUserId);
  if (!pairKey) {
    return null;
  }

  return [
    'profile-view-v2',
    encodeURIComponent(params.viewerUserId.trim()),
    encodeURIComponent(params.profileUserId.trim()),
    String(normalizeProfileViewOpenedAtMs(params.openedAtMs)),
  ].join('::');
}

export function evaluateProfileViewClientDecision(params: {
  viewerUserId: unknown;
  profileUserId: unknown;
  openedAtMs?: unknown;
  dedupeWindowMs?: unknown;
  lastTrackedAtMs?: unknown;
  nowMs?: number;
}): ProfileViewClientDecision {
  const nowMs = Math.max(0, Math.floor(params.nowMs ?? Date.now()));
  const openedAtMs = normalizeProfileViewOpenedAtMs(params.openedAtMs, nowMs);
  const dedupeWindowMs = normalizeProfileViewClientDedupeWindowMs(params.dedupeWindowMs);
  const viewerUserId = normalizeProfileViewValue(params.viewerUserId);
  const profileUserId = normalizeProfileViewValue(params.profileUserId);
  const pairKey = buildProfileViewPairKey(viewerUserId, profileUserId);

  if (!viewerUserId || !profileUserId || !pairKey) {
    return {
      shouldTrack: false,
      dropReason: 'invalid_payload',
      openedAtMs,
      dedupeWindowMs,
      viewerUserId,
      profileUserId,
      pairKey: null,
    };
  }

  if (viewerUserId === profileUserId) {
    return {
      shouldTrack: false,
      dropReason: 'self_view_excluded',
      openedAtMs,
      dedupeWindowMs,
      viewerUserId,
      profileUserId,
      pairKey,
    };
  }

  const lastTrackedAtMs = toNonNegativeInt(params.lastTrackedAtMs, -1);
  if (lastTrackedAtMs >= 0 && openedAtMs - lastTrackedAtMs < dedupeWindowMs) {
    return {
      shouldTrack: false,
      dropReason: 'within_dedupe_window',
      openedAtMs,
      dedupeWindowMs,
      viewerUserId,
      profileUserId,
      pairKey,
    };
  }

  return {
    shouldTrack: true,
    dropReason: null,
    openedAtMs,
    dedupeWindowMs,
    viewerUserId,
    profileUserId,
    pairKey,
  };
}
