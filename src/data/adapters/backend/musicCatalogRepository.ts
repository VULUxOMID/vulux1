import type { MusicCatalogRepository } from '../../contracts';
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

function parseJsonRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as UnknownRecord) : {};
  } catch {
    return {};
  }
}

function readTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const asFinite = Number(value);
    if (Number.isFinite(asFinite)) return asFinite;
  }
  if (value && typeof value === 'object') {
    const maybeToMillis = (value as { toMillis?: () => unknown }).toMillis;
    if (typeof maybeToMillis === 'function') {
      const millis = maybeToMillis.call(value);
      if (typeof millis === 'number' && Number.isFinite(millis)) {
        return millis;
      }
    }
  }
  return Date.now();
}

function getSpacetimeMusicCatalog(snapshot: BackendSnapshot) {
  const dbView = spacetimeDb.db as any;

  const artistsById = new Map<string, (typeof snapshot.artists)[number]>();
  for (const artist of snapshot.artists) {
    artistsById.set(artist.id, artist);
  }

  const artistRows: any[] = Array.from(dbView?.artist?.iter?.() ?? []);
  for (const row of artistRows) {
    const id = asString(row?.id);
    if (!id) continue;
    artistsById.set(id, {
      id,
      name: asString(row?.name) ?? 'Unknown Artist',
      bio: '',
      image: asString(row?.imageUrl ?? row?.image_url) ?? '',
    });
  }

  const tracksById = new Map<string, (typeof snapshot.tracks)[number]>();
  for (const track of snapshot.tracks) {
    tracksById.set(track.id, track);
  }

  const trackRows: any[] = Array.from(dbView?.track?.iter?.() ?? []);
  for (const row of trackRows) {
    const id = asString(row?.id);
    if (!id) continue;
    const artistId = asString(row?.artistId ?? row?.artist_id);
    const artistName = artistId ? artistsById.get(artistId)?.name : null;
    tracksById.set(id, {
      id,
      title: asString(row?.title) ?? 'Untitled Track',
      artist: artistName ?? 'Unknown Artist',
      artwork: asString(row?.artworkUrl ?? row?.artwork_url) ?? '',
      duration: Math.max(0, Math.floor(asNumber(row?.durationSeconds ?? row?.duration_seconds, 0))),
      url: asString(row?.audioUrl ?? row?.audio_url) ?? '',
    });
  }

  const playlistTracksByPlaylist = new Map<string, Array<{ trackId: string; position: number }>>();
  const playlistTrackRows: any[] = Array.from(dbView?.playlistTrack?.iter?.() ?? dbView?.playlist_track?.iter?.() ?? []);
  for (const row of playlistTrackRows) {
    const playlistId = asString(row?.playlistId ?? row?.playlist_id);
    const trackId = asString(row?.trackId ?? row?.track_id);
    if (!playlistId || !trackId) continue;
    const list = playlistTracksByPlaylist.get(playlistId) ?? [];
    list.push({
      trackId,
      position: Math.max(0, Math.floor(asNumber(row?.position, 0))),
    });
    playlistTracksByPlaylist.set(playlistId, list);
  }

  const playlistsById = new Map<string, (typeof snapshot.playlists)[number]>();
  for (const playlist of snapshot.playlists) {
    playlistsById.set(playlist.id, playlist);
  }

  const playlistRows: any[] = Array.from(dbView?.playlist?.iter?.() ?? []);
  for (const row of playlistRows) {
    const id = asString(row?.id);
    if (!id) continue;
    const trackIds = (playlistTracksByPlaylist.get(id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((entry) => entry.trackId);

    playlistsById.set(id, {
      id,
      title: asString(row?.title) ?? 'Untitled Playlist',
      description: asString(row?.description) ?? '',
      cover: asString(row?.coverUrl ?? row?.cover_url) ?? '',
      tracks: trackIds,
    });
  }

  const globalRows: any[] = Array.from(dbView?.globalMessageItem?.iter?.() ?? dbView?.global_message_item?.iter?.() ?? []);
  globalRows.sort(
    (a: any, b: any) =>
      readTimestampMs(a?.createdAt ?? a?.created_at) -
      readTimestampMs(b?.createdAt ?? b?.created_at),
  );

  for (const row of globalRows) {
    const payload = parseJsonRecord(row?.item);
    if (asString(payload.eventType) !== 'music_track_item') {
      continue;
    }

    const id = asString(payload.id) ?? asString(row?.id);
    if (!id) continue;

    const artistName = asString(payload.artist) ?? 'Unknown Artist';
    const artistId = `artist:${artistName.toLowerCase().replace(/\s+/g, '-')}`;
    if (!artistsById.has(artistId)) {
      artistsById.set(artistId, {
        id: artistId,
        name: artistName,
        bio: '',
        image: asString(payload.artworkUrl) ?? '',
      });
    }

    tracksById.set(id, {
      id,
      title: asString(payload.title) ?? 'Untitled Track',
      artist: artistName,
      artwork: asString(payload.artworkUrl) ?? '',
      duration: Math.max(0, Math.floor(asNumber(payload.durationSeconds, 0))),
      url: asString(payload.audioUrl) ?? '',
    });
  }

  return {
    artists: Array.from(artistsById.values()),
    tracks: Array.from(tracksById.values()),
    playlists: Array.from(playlistsById.values()),
  };
}

export function createBackendMusicCatalogRepository(
  snapshot: BackendSnapshot,
): MusicCatalogRepository {
  return {
    listTracks(request) {
      const catalog = getSpacetimeMusicCatalog(snapshot);
      const searched = filterByQuery(catalog.tracks, request?.query, [
        (track) => track.title,
        (track) => track.artist,
      ]);
      return applyCursorPage(searched, request);
    },
    listPlaylists(request) {
      const catalog = getSpacetimeMusicCatalog(snapshot);
      const searched = filterByQuery(catalog.playlists, request?.query, [
        (playlist) => playlist.title,
        (playlist) => playlist.description,
      ]);
      return applyCursorPage(searched, request);
    },
    listArtists(request) {
      const catalog = getSpacetimeMusicCatalog(snapshot);
      const searched = filterByQuery(catalog.artists, request?.query, [
        (artist) => artist.name,
        (artist) => artist.bio,
      ]);
      return applyCursorPage(searched, request);
    },
  };
}
