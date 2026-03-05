import { getSpacetimeAuthSnapshot, spacetimeDb } from '../lib/spacetime';

type VideoCatalogItemInput = {
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  category: string;
  contentType: string;
  tags?: string[];
  price?: number;
  currency?: 'cash' | 'gems';
  durationSeconds?: number;
  creatorId?: string | null;
  creatorName?: string | null;
  creatorAvatar?: string | null;
};

type MusicTrackCatalogItemInput = {
  title: string;
  artistName: string;
  audioUrl: string;
  durationSeconds?: number;
  artworkUrl?: string;
};

type UploadMetadataInput = {
  objectKey: string;
  publicUrl: string;
  contentType: string;
  mediaType: string;
  size?: number;
};

type LiveInviteInput = {
  liveId: string;
  targetUserId: string;
};

type LiveHostRequestInput = {
  liveId: string;
};

type LiveHostRequestResponseInput = {
  liveId: string;
  targetUserId: string;
  accepted: boolean;
};

type LiveInviteResponseInput = {
  liveId: string;
  accepted: boolean;
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }
  }
  return fallback;
}

function makeEventId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function sendGlobalEvent(
  id: string,
  roomId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const reducers = spacetimeDb.reducers as any;
  if (typeof reducers?.sendGlobalMessage !== 'function') {
    throw new Error('SpacetimeDB reducers are unavailable.');
  }

  await reducers.sendGlobalMessage({
    id,
    roomId,
    item: JSON.stringify(payload),
  });
}

export async function publishVideoCatalogItem(
  input: VideoCatalogItemInput,
): Promise<{ id: string }> {
  const id = makeEventId('video');
  const auth = getSpacetimeAuthSnapshot();
  const createdAt = Date.now();

  await sendGlobalEvent(id, 'catalog:videos', {
    eventType: 'video_catalog_item',
    id,
    title: normalizeString(input.title) ?? 'Untitled video',
    description: normalizeString(input.description) ?? '',
    videoUrl: normalizeString(input.videoUrl) ?? '',
    thumbnailUrl: normalizeString(input.thumbnailUrl) ?? '',
    category: normalizeString(input.category) ?? 'Gaming',
    contentType: normalizeString(input.contentType) ?? 'movie',
    tags: Array.isArray(input.tags)
      ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [],
    price: Math.max(0, Math.floor(normalizeNumber(input.price, 0))),
    currency: input.currency === 'gems' ? 'gems' : 'cash',
    durationSeconds: Math.max(0, Math.floor(normalizeNumber(input.durationSeconds, 0))),
    creatorId: normalizeString(input.creatorId) ?? auth.userId ?? 'unknown',
    creatorName: normalizeString(input.creatorName) ?? auth.userId ?? 'Unknown Creator',
    creatorAvatar: normalizeString(input.creatorAvatar) ?? '',
    views: 0,
    likes: 0,
    createdAt,
  });

  return { id };
}

export async function publishMusicTrackCatalogItem(
  input: MusicTrackCatalogItemInput,
): Promise<{ id: string }> {
  const id = makeEventId('track');
  const createdAt = Date.now();

  await sendGlobalEvent(id, 'catalog:music', {
    eventType: 'music_track_item',
    id,
    title: normalizeString(input.title) ?? 'Untitled track',
    artist: normalizeString(input.artistName) ?? 'Unknown Artist',
    audioUrl: normalizeString(input.audioUrl) ?? '',
    artworkUrl: normalizeString(input.artworkUrl) ?? '',
    durationSeconds: Math.max(0, Math.floor(normalizeNumber(input.durationSeconds, 0))),
    createdAt,
  });

  return { id };
}

export async function recordUploadedMediaAsset(input: UploadMetadataInput): Promise<void> {
  const auth = getSpacetimeAuthSnapshot();
  const objectKey = normalizeString(input.objectKey);
  const publicUrl = normalizeString(input.publicUrl);
  if (!objectKey || !publicUrl) {
    return;
  }

  await sendGlobalEvent(makeEventId('media-upload'), 'catalog:uploads', {
    eventType: 'media_upload',
    id: makeEventId('media-upload-row'),
    ownerUserId: auth.userId,
    objectKey,
    publicUrl,
    contentType: normalizeString(input.contentType) ?? 'application/octet-stream',
    mediaType: normalizeString(input.mediaType) ?? 'media',
    size: Math.max(0, Math.floor(normalizeNumber(input.size, 0))),
    createdAt: Date.now(),
  });
}

export async function publishLiveInvite(input: LiveInviteInput): Promise<void> {
  const liveId = normalizeString(input.liveId);
  const targetUserId = normalizeString(input.targetUserId);

  if (!liveId || !targetUserId) {
    throw new Error('A live id and target user are required.');
  }

  await sendGlobalEvent(makeEventId('live-invite'), liveId, {
    eventType: 'live_invite',
    liveId,
    targetUserId,
    createdAt: Date.now(),
  });
}

export async function publishLiveHostRequest(input: LiveHostRequestInput): Promise<void> {
  const liveId = normalizeString(input.liveId);
  if (!liveId) {
    throw new Error('A live id is required.');
  }

  await sendGlobalEvent(makeEventId('live-host-request'), liveId, {
    eventType: 'live_host_request',
    liveId,
    createdAt: Date.now(),
  });
}

export async function publishLiveHostRequestResponse(
  input: LiveHostRequestResponseInput,
): Promise<void> {
  const liveId = normalizeString(input.liveId);
  const targetUserId = normalizeString(input.targetUserId);
  if (!liveId || !targetUserId) {
    throw new Error('A live id and target user id are required.');
  }

  await sendGlobalEvent(makeEventId('live-host-request-response'), liveId, {
    eventType: 'live_host_request_response',
    liveId,
    targetUserId,
    accepted: input.accepted === true,
    createdAt: Date.now(),
  });
}

export async function publishLiveInviteResponse(input: LiveInviteResponseInput): Promise<void> {
  const liveId = normalizeString(input.liveId);
  if (!liveId) {
    throw new Error('A live id is required.');
  }

  await sendGlobalEvent(makeEventId('live-invite-response'), liveId, {
    eventType: 'live_invite_response',
    liveId,
    accepted: input.accepted === true,
    createdAt: Date.now(),
  });
}
