import type { VideoRepository } from '../../contracts';
import { applyCursorPage, filterByQuery } from './query';
import type { BackendSnapshot } from './snapshot';
import { spacetimeDb } from '../../../lib/spacetime';

type UnknownRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const asFinite = Number(value);
    if (Number.isFinite(asFinite)) return asFinite;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
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

function normalizeVideoRecord(raw: UnknownRecord, fallbackId?: string) {
  const id = asString(raw.id) ?? fallbackId;
  if (!id) return null;

  const createdAt = Math.max(0, Math.floor(asNumber(raw.createdAt, Date.now())));
  const durationSeconds = Math.max(0, Math.floor(asNumber(raw.durationSeconds, 0)));
  const durationMinutes = durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : 0;
  const currency: 'cash' | 'gems' = raw.currency === 'gems' ? 'gems' : 'cash';

  return {
    id,
    creatorId: asString(raw.creatorId) ?? 'unknown',
    creatorName: asString(raw.creatorName) ?? 'Unknown Creator',
    creatorAvatar: asString(raw.creatorAvatar) ?? '',
    title: asString(raw.title) ?? 'Untitled video',
    description: asString(raw.description) ?? '',
    thumbnailUrl: asString(raw.thumbnailUrl) ?? '',
    videoUrl: asString(raw.videoUrl) ?? '',
    price: Math.max(0, Math.floor(asNumber(raw.price, 0))),
    currency,
    contentType: (asString(raw.contentType) as any) ?? 'movie',
    category: (asString(raw.category) as any) ?? 'Gaming',
    tags: asStringArray(raw.tags),
    duration: durationMinutes > 0 ? `${durationMinutes}m` : undefined,
    seasons: undefined,
    episodes: undefined,
    views: Math.max(0, Math.floor(asNumber(raw.views, 0))),
    likes: Math.max(0, Math.floor(asNumber(raw.likes, 0))),
    createdAt,
    isLocked: Math.max(0, Math.floor(asNumber(raw.price, 0))) > 0,
  };
}

function getSpacetimeVideoRows() {
  const dbView = spacetimeDb.db as any;
  const byId = new Map<string, ReturnType<typeof normalizeVideoRecord>>();

  const tableRows: any[] = Array.from(dbView?.videoItem?.iter?.() ?? dbView?.video_item?.iter?.() ?? []);
  for (const row of tableRows) {
    const record = normalizeVideoRecord(parseJsonRecord(row?.item), asString(row?.id) ?? undefined);
    if (record) {
      byId.set(record.id, record);
    }
  }

  const globalRows: any[] = Array.from(dbView?.globalMessageItem?.iter?.() ?? dbView?.global_message_item?.iter?.() ?? []);
  for (const row of globalRows) {
    const payload = parseJsonRecord(row?.item);
    if (asString(payload.eventType) !== 'video_catalog_item') {
      continue;
    }
    const record = normalizeVideoRecord(payload, asString(row?.id) ?? undefined);
    if (record) {
      byId.set(record.id, record);
    }
  }

  return Array.from(byId.values()).filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function createBackendVideoRepository(snapshot: BackendSnapshot): VideoRepository {
  return {
    listVideos(request) {
      const byId = new Map<string, (typeof snapshot.videos)[number]>();

      for (const video of snapshot.videos) {
        if (!video?.id) continue;
        byId.set(video.id, video);
      }

      for (const video of getSpacetimeVideoRows()) {
        byId.set(video.id, video);
      }

      let videos = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);

      if (request?.categories?.length) {
        videos = videos.filter((video) => request.categories?.includes(video.category));
      }
      if (request?.includeLocked === false) {
        videos = videos.filter((video) => !video.isLocked);
      }

      const searched = filterByQuery(videos, request?.query, [
        (video) => video.title,
        (video) => video.description,
        (video) => video.creatorName,
        (video) => video.tags,
      ]);

      return applyCursorPage(searched, request);
    },
  };
}
