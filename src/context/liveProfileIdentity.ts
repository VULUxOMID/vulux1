export type ProfileIdentity = {
  displayName?: string;
  username?: string;
  avatarUrl?: string;
};

type UnknownRecord = Record<string, unknown>;

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const cast = Number(value);
    return Number.isFinite(cast) ? cast : null;
  }
  return null;
}

function readTimestampMs(value: unknown): number {
  const direct = asFiniteNumber(value);
  if (direct !== null) return direct;

  if (value && typeof value === 'object') {
    const asObject = value as {
      toMillis?: () => unknown;
      microsSinceUnixEpoch?: unknown;
      __timestamp_micros_since_unix_epoch__?: unknown;
    };

    if (typeof asObject.toMillis === 'function') {
      const millis = asFiniteNumber(asObject.toMillis());
      if (millis !== null) return millis;
    }

    const micros = asObject.microsSinceUnixEpoch ?? asObject.__timestamp_micros_since_unix_epoch__;
    const microsAsNumber = asFiniteNumber(micros);
    if (microsAsNumber !== null) {
      return Math.floor(microsAsNumber / 1000);
    }
  }

  return 0;
}

function parseJsonRecord(value: unknown): UnknownRecord {
  if (value && typeof value === 'object') {
    return value as UnknownRecord;
  }
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as UnknownRecord) : {};
  } catch {
    return {};
  }
}

function firstPhotoUri(photos: unknown): string | undefined {
  if (!Array.isArray(photos)) return undefined;
  for (const item of photos) {
    if (!item || typeof item !== 'object') continue;
    const uri = asTrimmedString((item as { uri?: unknown }).uri);
    if (uri) return uri;
  }
  return undefined;
}

export function buildProfileIdentityMap(options: {
  queriesEnabled: boolean;
  globalRows: any[];
  myProfileRows: any[];
  currentUserId?: string | null;
  authoritativeUserIds?: Iterable<string>;
}): Map<string, ProfileIdentity> {
  const identities = new Map<string, ProfileIdentity>();
  if (!options.queriesEnabled) {
    return identities;
  }

  const authoritativeUserIds = new Set(
    Array.from(options.authoritativeUserIds ?? []).filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    ),
  );

  options.globalRows
    .slice()
    .sort(
      (a, b) =>
        readTimestampMs(a?.createdAt ?? a?.created_at) -
        readTimestampMs(b?.createdAt ?? b?.created_at),
    )
    .forEach((row) => {
      const item = parseJsonRecord(row?.item);
      if (asTrimmedString(item.eventType) !== 'user_profile') return;
      const profileUserId = asTrimmedString(item.userId);
      if (!profileUserId || authoritativeUserIds.has(profileUserId)) return;

      const current = identities.get(profileUserId) ?? {};
      identities.set(profileUserId, {
        displayName: asTrimmedString(item.displayName) ?? current.displayName,
        username: asTrimmedString(item.username) ?? current.username,
        avatarUrl: asTrimmedString(item.avatarUrl) ?? current.avatarUrl,
      });
    });

  const myProfileRow = options.myProfileRows[0];
  if (!myProfileRow) {
    return identities;
  }

  const profile = parseJsonRecord(myProfileRow?.profile);
  const profileUserId =
    asTrimmedString(myProfileRow?.userId ?? myProfileRow?.user_id) ??
    asTrimmedString(profile.userId) ??
    asTrimmedString(options.currentUserId) ??
    null;
  if (!profileUserId) {
    return identities;
  }

  const current = identities.get(profileUserId) ?? {};
  identities.set(profileUserId, {
    displayName:
      asTrimmedString(profile.displayName) ??
      asTrimmedString(profile.name) ??
      current.displayName,
    username: asTrimmedString(profile.username) ?? current.username,
    avatarUrl:
      asTrimmedString(profile.avatarUrl) ??
      firstPhotoUri(profile.photos) ??
      current.avatarUrl,
  });

  return identities;
}
