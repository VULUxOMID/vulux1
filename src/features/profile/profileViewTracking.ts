export const PROFILE_VIEW_CLIENT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;
export const PROFILE_VIEW_CLIENT_STORAGE_KEY = '@vulu.profileView.cooldowns.v1';

export type ProfileViewCooldownStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type TrackProfileViewWithCooldownRequest = {
  viewerUserId: string;
  profileUserId: string;
  occurredAtMs?: number;
  dedupeWindowMs?: number;
  storage: ProfileViewCooldownStorage;
  emit: () => Promise<void>;
};

export type ProfileViewTrackOutcome = 'tracked' | 'duplicate' | 'self_view' | 'invalid';

type ProfileViewCooldownSnapshot = Record<string, number>;

let profileViewTrackQueue: Promise<void> = Promise.resolve();
let profileViewCooldownFallbackSnapshot: ProfileViewCooldownSnapshot = {};

function normalizeUserId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeProfileViewDedupeWindowMs(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return PROFILE_VIEW_CLIENT_DEDUPE_WINDOW_MS;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeOccurredAtMs(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Date.now();
  }

  return Math.max(0, Math.floor(value));
}

export function buildProfileViewCooldownKey(viewerUserId: string, profileUserId: string): string {
  return `${viewerUserId}::${profileUserId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeProfileViewCooldownSnapshot(value: unknown): ProfileViewCooldownSnapshot {
  if (!isRecord(value)) {
    return {};
  }

  const snapshot: ProfileViewCooldownSnapshot = {};
  for (const [key, expiresAtMs] of Object.entries(value)) {
    if (typeof key !== 'string' || key.length === 0) {
      continue;
    }
    if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) {
      continue;
    }

    snapshot[key] = Math.max(0, Math.floor(expiresAtMs));
  }

  return snapshot;
}

export function pruneExpiredProfileViewCooldowns(
  snapshot: ProfileViewCooldownSnapshot,
  nowMs: number,
): ProfileViewCooldownSnapshot {
  const pruned: ProfileViewCooldownSnapshot = {};

  for (const [key, expiresAtMs] of Object.entries(snapshot)) {
    if (expiresAtMs > nowMs) {
      pruned[key] = expiresAtMs;
    }
  }

  return pruned;
}

async function readProfileViewCooldownSnapshot(
  storage: ProfileViewCooldownStorage,
): Promise<ProfileViewCooldownSnapshot> {
  try {
    const raw = await storage.getItem(PROFILE_VIEW_CLIENT_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    const snapshot = normalizeProfileViewCooldownSnapshot(parsed);
    profileViewCooldownFallbackSnapshot = snapshot;
    return snapshot;
  } catch {
    return { ...profileViewCooldownFallbackSnapshot };
  }
}

async function writeProfileViewCooldownSnapshot(
  storage: ProfileViewCooldownStorage,
  snapshot: ProfileViewCooldownSnapshot,
): Promise<void> {
  profileViewCooldownFallbackSnapshot = { ...snapshot };

  try {
    await storage.setItem(PROFILE_VIEW_CLIENT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Keep the in-memory fallback snapshot for the current session.
  }
}

function enqueueProfileViewTrack<T>(work: () => Promise<T>): Promise<T> {
  const next = profileViewTrackQueue.then(work, work);
  profileViewTrackQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function trackProfileViewWithCooldown(
  request: TrackProfileViewWithCooldownRequest,
): Promise<ProfileViewTrackOutcome> {
  return enqueueProfileViewTrack(async () => {
    const viewerUserId = normalizeUserId(request.viewerUserId);
    const profileUserId = normalizeUserId(request.profileUserId);
    if (!viewerUserId || !profileUserId) {
      return 'invalid';
    }
    if (viewerUserId === profileUserId) {
      return 'self_view';
    }

    const occurredAtMs = normalizeOccurredAtMs(request.occurredAtMs);
    const dedupeWindowMs = normalizeProfileViewDedupeWindowMs(request.dedupeWindowMs);
    const cooldownKey = buildProfileViewCooldownKey(viewerUserId, profileUserId);
    const existingSnapshot = await readProfileViewCooldownSnapshot(request.storage);
    const prunedSnapshot = pruneExpiredProfileViewCooldowns(existingSnapshot, occurredAtMs);
    const didPruneSnapshot =
      Object.keys(prunedSnapshot).length !== Object.keys(existingSnapshot).length;
    const activeCooldownExpiresAtMs = prunedSnapshot[cooldownKey] ?? 0;

    if (activeCooldownExpiresAtMs > occurredAtMs) {
      if (didPruneSnapshot) {
        await writeProfileViewCooldownSnapshot(request.storage, prunedSnapshot);
      }
      return 'duplicate';
    }

    await request.emit();

    const nextSnapshot =
      dedupeWindowMs > 0
        ? {
            ...prunedSnapshot,
            [cooldownKey]: occurredAtMs + dedupeWindowMs,
          }
        : prunedSnapshot;

    await writeProfileViewCooldownSnapshot(request.storage, nextSnapshot);
    return 'tracked';
  });
}

export function resetProfileViewTrackingStateForTests(): void {
  profileViewTrackQueue = Promise.resolve();
  profileViewCooldownFallbackSnapshot = {};
}
