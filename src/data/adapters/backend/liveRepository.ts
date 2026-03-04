import type { LiveRepository } from '../../contracts';
import { applyCursorPage, filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';
import {
  isSpacetimeViewActive,
  isSpacetimeViewRequested,
  spacetimeDb,
} from '../../../lib/spacetime';
import type { LiveItem } from '../../../features/home/LiveSection';
import type { LiveUser } from '../../../features/liveroom/types';

type UnknownRecord = Record<string, unknown>;

type ExtendedLiveItem = LiveItem & {
  ownerUserId?: string;
  inviteOnly?: boolean;
  bannedUserIds?: string[];
  invitedUserIds?: string[];
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
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

  return Date.now();
}

function parseJsonRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as UnknownRecord) : {};
  } catch {
    return {};
  }
}

function parseHost(entry: unknown): ExtendedLiveItem['hosts'][number] | null {
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry as UnknownRecord;
  const name = asString(raw.name);
  const avatar = asString(raw.avatar);
  if (!name || !avatar) return null;

  return {
    id: asString(raw.id) ?? undefined,
    username: asString(raw.username) ?? undefined,
    name,
    age: Math.max(0, Math.floor(asFiniteNumber(raw.age) ?? 0)),
    country: asString(raw.country) ?? '',
    bio: asString(raw.bio) ?? '',
    verified: asBoolean(raw.verified) ?? false,
    avatar,
  };
}

function parseHosts(value: unknown): ExtendedLiveItem['hosts'] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => parseHost(entry)).filter((entry): entry is ExtendedLiveItem['hosts'][number] => Boolean(entry));
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function parseLiveRow(row: any): ExtendedLiveItem | null {
  const item = parseJsonRecord(row?.item);
  const id = asString(row?.id) ?? asString(item.id);
  if (!id) return null;

  const hosts = parseHosts(item.hosts);
  const images = parseStringArray(item.images);

  return {
    id,
    title: asString(item.title) ?? 'Live',
    viewers: Math.max(0, Math.floor(asFiniteNumber(item.viewers) ?? 0)),
    boosted: asBoolean(item.boosted) ?? false,
    images: images.length > 0 ? images : hosts.map((host) => host.avatar).filter(Boolean),
    hosts,
    ownerUserId: asString(item.ownerUserId) ?? undefined,
    inviteOnly: asBoolean(item.inviteOnly) ?? false,
    bannedUserIds: parseStringArray(item.bannedUserIds),
    invitedUserIds: parseStringArray(item.invitedUserIds),
  };
}

function parseKnownLiveUserRow(row: any): LiveUser | null {
  const item = parseJsonRecord(row?.item);
  const id = asString(row?.id) ?? asString(item.id);
  if (!id) return null;

  const username = asString(item.username) ?? id;
  const name = asString(item.name) ?? username;

  return {
    id,
    username,
    name,
    age: Math.max(0, Math.floor(asFiniteNumber(item.age) ?? 0)),
    country: asString(item.country) ?? '',
    bio: asString(item.bio) ?? '',
    verified: asBoolean(item.verified) ?? false,
    avatarUrl: asString(item.avatarUrl) ?? asString(item.avatar) ?? '',
  };
}

const LIVE_PRESENCE_FRESHNESS_WINDOW_MS = (() => {
  const raw = process.env.EXPO_PUBLIC_LIVE_PRESENCE_TTL_MS?.trim();
  if (!raw) return 30_000;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
})();

type PresenceItem = {
  userId: string;
  liveId: string;
  activity: 'hosting' | 'watching';
  liveTitle?: string;
  updatedAt: number;
};

function normalizePresenceRow(
  entry: Partial<PresenceItem> & {
    userId?: unknown;
    liveId?: unknown;
    activity?: unknown;
    liveTitle?: unknown;
    updatedAt?: unknown;
  },
): PresenceItem | null {
  const userId = asString(entry.userId);
  const liveId = asString(entry.liveId);
  const activityRaw = asString(entry.activity);
  const activity = activityRaw === 'hosting' ? 'hosting' : activityRaw === 'watching' ? 'watching' : null;
  if (!userId || !liveId || !activity) {
    return null;
  }

  return {
    userId,
    liveId,
    activity,
    liveTitle: asString(entry.liveTitle) ?? undefined,
    updatedAt: readTimestampMs(entry.updatedAt),
  };
}

function applyFreshPresenceFilter<T extends { updatedAt: number }>(presence: T[]): T[] {
  const cutoffMs = Date.now() - LIVE_PRESENCE_FRESHNESS_WINDOW_MS;
  return presence.filter((entry) => entry.updatedAt >= cutoffMs);
}

function getSpacetimeLives(): ExtendedLiveItem[] {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.publicLiveDiscovery?.iter?.() ?? []);

  const parsedRows: Array<ExtendedLiveItem | null> = rows.map((row) => {
      const id = asString(row?.liveId ?? row?.live_id);
      if (!id) return null;

      const hostUserId = asString(row?.hostUserId ?? row?.host_user_id);
      const hostUsername = asString(row?.hostUsername ?? row?.host_username);
      const hostAvatar = asString(row?.hostAvatarUrl ?? row?.host_avatar_url);
      const hasHostIdentity = Boolean(hostUserId || hostUsername);

      const hosts = hasHostIdentity
        ? [{
          id: hostUserId ?? undefined,
          username: hostUsername ?? undefined,
          name: hostUsername ?? hostUserId ?? 'Host',
          age: 0,
          country: '',
          bio: '',
          verified: false,
          avatar: hostAvatar ?? '',
        }]
        : [];

      return {
        id,
        title: asString(row?.title) ?? 'Live',
        viewers: Math.max(0, Math.floor(asFiniteNumber(row?.viewerCount ?? row?.viewer_count) ?? 0)),
        boosted: false,
        images: hostAvatar ? [hostAvatar] : [],
        hosts,
      };
    });

  return parsedRows.filter((live): live is ExtendedLiveItem => live !== null);
}

function getSpacetimeLiveById(liveId: string): ExtendedLiveItem | null {
  const dbView = spacetimeDb.db as any;
  const normalizedLiveId = liveId.trim();
  if (!normalizedLiveId) return null;

  const row =
    dbView?.liveItem?.id?.find?.(normalizedLiveId) ??
    dbView?.live_item?.id?.find?.(normalizedLiveId);
  if (!row) return null;
  return parseLiveRow(row);
}

function getSpacetimeBoostLeaderboard() {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.liveBoostLeaderboardItem?.iter?.() ?? []);

  return rows
    .map((row) => {
      const item = parseJsonRecord(row?.item);
      const id = asString(row?.id) ?? asString(item.id);
      if (!id) return null;

      return {
        id,
        title: asString(item.title) ?? 'Live',
        boostCount: Math.max(0, Math.floor(asFiniteNumber(item.boostCount) ?? 0)),
        rank: Math.max(0, Math.floor(asFiniteNumber(item.rank) ?? 0)),
        hostAvatars: parseStringArray(item.hostAvatars),
        isYourLive: asBoolean(item.isYourLive) ?? false,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function getSpacetimeKnownLiveUsers(): LiveUser[] {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.knownLiveUserItem?.iter?.() ?? []);

  return rows
    .map((row) => parseKnownLiveUserRow(row))
    .filter((entry): entry is LiveUser => Boolean(entry));
}

function getSpacetimePresence() {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(
    dbView?.publicLivePresenceItem?.iter?.() ??
    dbView?.public_live_presence_item?.iter?.() ??
    [],
  );

  return rows
    .map((row) =>
      normalizePresenceRow({
        userId: row?.userId ?? row?.user_id,
        liveId: row?.liveId ?? row?.live_id,
        activity: row?.activity,
        updatedAt: row?.updatedAt ?? row?.updated_at,
      }),
    )
    .filter((entry): entry is PresenceItem => Boolean(entry));
}

export function createBackendLiveRepository(snapshot: BackendSnapshot): LiveRepository {
  return {
    listLives(request) {
      const spacetimeLives = getSpacetimeLives();
      const liveDiscoveryRequested = isSpacetimeViewRequested('public_live_discovery');
      const liveDiscoveryActive = isSpacetimeViewActive('public_live_discovery');
      const shouldUseSnapshotFallback =
        spacetimeLives.length === 0 && !liveDiscoveryRequested && !liveDiscoveryActive;
      const byId = new Map<string, ExtendedLiveItem>();

      if (!shouldUseSnapshotFallback) {
        for (const live of spacetimeLives) {
          byId.set(live.id, live);
        }
        for (const live of snapshot.lives) {
          if (!live?.id) continue;
          if (!byId.has(live.id)) continue;
          byId.set(live.id, {
            ...live,
            ...(byId.get(live.id) ?? {}),
          } as ExtendedLiveItem);
        }
      } else {
        for (const live of snapshot.lives) {
          if (!live?.id) continue;
          byId.set(live.id, live as ExtendedLiveItem);
        }
      }

      let mergedLives = Array.from(byId.values());
      if (request?.includeInviteOnly !== true) {
        mergedLives = mergedLives.filter((live) => live.inviteOnly !== true);
      }

      const filtered = filterByQuery(mergedLives, request?.query, [
        (live) => live.title,
        (live) => live.hosts.map((host) => host.name),
      ]);
      return applyCursorPage(filtered, request);
    },
    findLiveById(liveId) {
      if (!liveId) return undefined;
      const normalized = liveId.trim();
      if (!normalized) return undefined;

      const fromLiveItem = getSpacetimeLiveById(normalized);
      if (fromLiveItem) return fromLiveItem;
      const fromSnapshot = snapshot.lives.find((live) => live.id === normalized);
      if (fromSnapshot) return fromSnapshot;
      return getSpacetimeLives().find((live) => live.id === normalized);
    },
    listBoostLeaderboard(request) {
      const byId = new Map<string, (typeof snapshot.boostLeaderboard)[number]>();
      for (const row of snapshot.boostLeaderboard) {
        byId.set(row.id, row);
      }
      for (const row of getSpacetimeBoostLeaderboard()) {
        byId.set(row.id, row);
      }

      const merged = Array.from(byId.values()).sort((a, b) => b.boostCount - a.boostCount);
      return applyCursorPage(merged, request);
    },
    listKnownLiveUsers(request) {
      const byId = new Map<string, LiveUser>();
      for (const user of snapshot.knownLiveUsers) {
        if (!user?.id) continue;
        byId.set(user.id, user);
      }
      for (const user of getSpacetimeKnownLiveUsers()) {
        byId.set(user.id, user);
      }

      return applyCursorPage(Array.from(byId.values()), request);
    },
    listPresence(request) {
      const byUserId = new Map<string, PresenceItem>();
      for (const row of snapshot.livePresence) {
        const normalized = normalizePresenceRow(row);
        if (!normalized) continue;
        byUserId.set(normalized.userId, normalized);
      }
      for (const row of getSpacetimePresence()) {
        byUserId.set(row.userId, row);
      }

      let presence = applyFreshPresenceFilter(Array.from(byUserId.values()));

      if (Array.isArray(request?.userIds)) {
        const normalizedUserIds = new Set(
          request.userIds.map((userId) => userId.trim()).filter(Boolean),
        );
        if (normalizedUserIds.size === 0) {
          return [];
        }
        presence = presence.filter((entry) => normalizedUserIds.has(entry.userId));
      }

      if (request?.activities?.length) {
        const activitySet = new Set(request.activities);
        presence = presence.filter((entry) => activitySet.has(entry.activity));
      }

      const normalizedLiveId = request?.liveId?.trim();
      if (normalizedLiveId) {
        presence = presence.filter((entry) => entry.liveId === normalizedLiveId);
      }

      const sorted = [...presence].sort((a, b) => b.updatedAt - a.updatedAt);
      if (!request?.limit || !Number.isFinite(request.limit) || request.limit <= 0) {
        return sorted;
      }
      return sorted.slice(0, request.limit);
    },
  };
}
