import { getRailwayAuthSnapshot, railwayDb } from '../lib/railwayRuntime';
import { readCurrentAuthAccessToken } from '../auth/currentAuthAccessToken';
import { getConfiguredBackendBaseUrl } from '../config/backendBaseUrl';
import { resolveLiveInviteActorName } from './liveInviteIdentity';

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
  authToken?: string | null;
};

type LiveInviteInput = {
  liveId: string;
  targetUserId: string;
  fromUserName?: string | null;
  fromUsername?: string | null;
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
  const reducers = railwayDb.reducers as any;
  if (typeof reducers?.sendGlobalMessage !== 'function') {
    throw new Error('Railway reducers are unavailable.');
  }

  await reducers.sendGlobalMessage({
    id,
    roomId,
    item: JSON.stringify(payload),
  });
}

async function persistMediaRecordToBackend(
  path: string,
  payload: Record<string, unknown>,
  authToken?: string | null,
): Promise<boolean> {
  const baseUrl = getConfiguredBackendBaseUrl().trim();
  const auth = getRailwayAuthSnapshot();
  const token =
    normalizeString(authToken) ??
    normalizeString(await readCurrentAuthAccessToken());
  if (!baseUrl || !token) {
    if (__DEV__) {
      console.warn('[media] backend persistence unavailable, using Railway compatibility projection only', {
        path,
        hasBaseUrl: Boolean(baseUrl),
        hasToken: Boolean(token),
      });
    }
    return false;
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(auth.userId ? { 'X-Vulu-User-Id': auth.userId } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Media backend write failed (${response.status})`);
  }

  return true;
}

async function persistSocialRecordToBackend(
  path: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const baseUrl = getConfiguredBackendBaseUrl().trim();
  const token = normalizeString(await readCurrentAuthAccessToken());
  const auth = getRailwayAuthSnapshot();
  if (!baseUrl || !token) {
    if (__DEV__) {
      console.warn('[social] backend persistence unavailable, keeping realtime projection only', {
        path,
        hasBaseUrl: Boolean(baseUrl),
        hasToken: Boolean(token),
      });
    }
    return false;
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(auth.userId ? { 'X-Vulu-User-Id': auth.userId } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Social backend write failed (${response.status})`);
  }

  return true;
}

export async function publishVideoCatalogItem(
  input: VideoCatalogItemInput,
): Promise<{ id: string }> {
  const id = makeEventId('video');
  const auth = getRailwayAuthSnapshot();
  const createdAt = Date.now();
  const payload = {
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
  };

  await persistMediaRecordToBackend('/api/media/catalog/video', payload);

  return { id };
}

export async function publishMusicTrackCatalogItem(
  input: MusicTrackCatalogItemInput,
): Promise<{ id: string }> {
  const id = makeEventId('track');
  const createdAt = Date.now();
  const payload = {
    eventType: 'music_track_item',
    id,
    title: normalizeString(input.title) ?? 'Untitled track',
    artistName: normalizeString(input.artistName) ?? 'Unknown Artist',
    artist: normalizeString(input.artistName) ?? 'Unknown Artist',
    audioUrl: normalizeString(input.audioUrl) ?? '',
    artworkUrl: normalizeString(input.artworkUrl) ?? '',
    durationSeconds: Math.max(0, Math.floor(normalizeNumber(input.durationSeconds, 0))),
    createdAt,
  };

  await persistMediaRecordToBackend('/api/media/catalog/track', payload);

  return { id };
}

export async function recordUploadedMediaAsset(input: UploadMetadataInput): Promise<void> {
  const auth = getRailwayAuthSnapshot();
  const objectKey = normalizeString(input.objectKey);
  const publicUrl = normalizeString(input.publicUrl);
  if (!objectKey || !publicUrl) {
    return;
  }

  const payload = {
    eventType: 'media_upload',
    id: makeEventId('media-upload-row'),
    ownerUserId: auth.userId,
    objectKey,
    publicUrl,
    contentType: normalizeString(input.contentType) ?? 'application/octet-stream',
    mediaType: normalizeString(input.mediaType) ?? 'media',
    size: Math.max(0, Math.floor(normalizeNumber(input.size, 0))),
    createdAt: Date.now(),
  };

  await persistMediaRecordToBackend('/api/media/uploads', payload, input.authToken ?? null);
}

export async function publishLiveInvite(input: LiveInviteInput): Promise<void> {
  const liveId = normalizeString(input.liveId);
  const targetUserId = normalizeString(input.targetUserId);
  const auth = getRailwayAuthSnapshot();
  const id = makeEventId('live-invite');
  const createdAt = Date.now();
  const actorDisplayName = resolveLiveInviteActorName(
    input.fromUserName,
    input.fromUsername,
    auth.userId ?? '',
  );

  if (!liveId || !targetUserId) {
    throw new Error('A live id and target user are required.');
  }

  await persistSocialRecordToBackend('/api/social/live-invite', {
    id,
    liveId,
    targetUserId,
    fromUserName: actorDisplayName,
    createdAt,
  });

  await sendGlobalEvent(id, liveId, {
    eventType: 'live_invite',
    liveId,
    targetUserId,
    createdAt,
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
