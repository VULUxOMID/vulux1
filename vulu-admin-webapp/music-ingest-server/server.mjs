/**
 * Local / deployable admin helper:
 * Spotify track metadata search + automatic YouTube lookup via yt-dlp + upload to Cloudflare R2.
 *
 * Setup:
 *   cd vulu-admin-webapp/music-ingest-server && cp .env.example .env
 *   npm install
 *   brew install yt-dlp ffmpeg
 *   npm start
 *
 * Admin UI expects this API at http://127.0.0.1:3001 by default
 * (override with window.VULU_MUSIC_API_BASE or a meta tag in the static admin page).
 *
 * Security:
 * - Do not expose this service publicly without auth/rate limiting.
 * - It can download arbitrary YouTube content and mutate/delete objects in R2.
 */

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

dotenv.config();

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || (process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1');
const R2_BUCKET = (process.env.R2_BUCKET_NAME ?? '').trim();
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
const R2_MUSIC_PREFIX =
  process.env.R2_MUSIC_PREFIX === undefined
    ? ''
    : normalizePrefix(String(process.env.R2_MUSIC_PREFIX));
const MUSIC_ANALYTICS_PREFIX = `${R2_MUSIC_PREFIX}_music_analytics/`;
const MUSIC_ANALYTICS_MAX_EVENTS_PER_DAY = 5000;

let spotifyCache = { token: '', expiresAtMs: 0 };

function normalizePrefix(prefix) {
  const raw = String(prefix ?? '').trim().replace(/^\/+/, '');
  if (!raw) return '';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function createR2Client() {
  const accountId = (process.env.R2_ACCOUNT_ID ?? '').trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID ?? '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY ?? '').trim();
  const endpoint =
    (process.env.R2_ENDPOINT ?? '').trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const r2Client = createR2Client();

function publicUrlForKey(objectKey) {
  if (!R2_PUBLIC_BASE_URL || !objectKey) return null;
  const key = String(objectKey).replace(/^\/+/, '');
  return `${R2_PUBLIC_BASE_URL}/${key}`;
}

function assertStorageConfigured() {
  if (!r2Client || !R2_BUCKET) {
    throw new Error('R2 not configured (set R2_* env vars)');
  }
}

function assertStorageKeyAllowed(key) {
  const k = String(key ?? '').trim();
  if (!k || k.includes('..') || k.startsWith('/')) {
    throw new Error('Invalid object key');
  }
  if (R2_MUSIC_PREFIX && !k.startsWith(R2_MUSIC_PREFIX)) {
    throw new Error('Object key is outside the configured R2_MUSIC_PREFIX');
  }
}

function isMusicAnalyticsKey(key) {
  return String(key || '').startsWith(MUSIC_ANALYTICS_PREFIX);
}

function isLibraryObjectKey(key) {
  return Boolean(key) && !isMusicAnalyticsKey(key);
}

async function bodyToString(body) {
  if (!body) return '';
  if (typeof body.transformToString === 'function') return body.transformToString();
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonObject(key, fallback) {
  try {
    const res = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const text = await bodyToString(res.Body);
    return text ? JSON.parse(text) : fallback;
  } catch (err) {
    const code = err?.name || err?.Code || err?.$metadata?.httpStatusCode;
    if (code === 'NoSuchKey' || code === 404) return fallback;
    return fallback;
  }
}

async function putJsonObject(key, value) {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: JSON.stringify(value, null, 2),
      ContentType: 'application/json',
    }),
  );
}

function copySourceForR2(key) {
  const segments = String(key).split('/').map((s) => encodeURIComponent(s));
  return `${R2_BUCKET}/${segments.join('/')}`;
}

function slugPart(value) {
  return String(value ?? '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function normalizeUserMetadata(meta) {
  const out = {};
  if (!meta || typeof meta !== 'object') return out;
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null) continue;
    const s = String(value).replace(/[^\x20-\x7E]/g, '').slice(0, 1024);
    if (s) out[String(key).toLowerCase()] = s;
  }
  return out;
}

async function headWithMeta(key) {
  const head = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const m = head.Metadata || {};
  const lm = head.LastModified;
  return {
    contentType: head.ContentType || '',
    metadata: {
      title: m.title || m.Title || '',
      artist: m.artist || m.Artist || '',
      album: m.album || m.Album || '',
      spotifyId: m.spotifyid || m.spotifyId || '',
      youtubeQuery: m.youtubequery || m.youtubeQuery || '',
      source: m.source || '',
      identityKey: m.identitykey || m.identityKey || '',
      contentSha256: m.contentsha256 || m.contentSha256 || '',
    },
    lastModified: lm?.toISOString?.() || null,
    lastModifiedMs: lm ? lm.getTime() : 0,
    contentLength: head.ContentLength ?? null,
  };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

async function getSpotifyAccessToken() {
  const clientId = (process.env.SPOTIFY_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.SPOTIFY_CLIENT_SECRET ?? '').trim();
  if (!clientId || !clientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set');
  }

  if (spotifyCache.token && Date.now() < spotifyCache.expiresAtMs - 30_000) {
    return spotifyCache.token;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Spotify token failed (${res.status}): ${text}`);

  const body = JSON.parse(text);
  const expiresIn = Number(body.expires_in) || 3600;
  spotifyCache = {
    token: body.access_token,
    expiresAtMs: Date.now() + expiresIn * 1000,
  };
  return spotifyCache.token;
}

function mapSpotifyTracks(payload) {
  const items = payload?.tracks?.items ?? [];
  return items.map((track) => {
    const artists = (track.artists || []).map((a) => a.name).filter(Boolean).join(', ');
    const albumArt = track.album?.images?.[0]?.url ?? '';
    const youtubeSearchHint = `${track.name || ''} ${artists}`.replace(/\s+/g, ' ').trim();

    return {
      id: track.id,
      name: track.name,
      artists,
      album: track.album?.name ?? '',
      albumArt,
      durationMs: track.duration_ms ?? null,
      spotifyUrl: track.external_urls?.spotify ?? '',
      youtubeSearchHint,
    };
  });
}

function mapSpotifyArtists(payload) {
  const items = payload?.artists?.items ?? [];
  return items.map((a) => ({
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url ?? '',
    genres: Array.isArray(a.genres) ? a.genres.slice(0, 4) : [],
    popularity: typeof a.popularity === 'number' ? a.popularity : null,
    spotifyUrl: a.external_urls?.spotify ?? '',
  }));
}

function spotifyMarket() {
  return (process.env.SPOTIFY_MARKET ?? 'US').trim() || 'US';
}

async function spotifyFetchJson(url) {
  const token = await getSpotifyAccessToken();
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Spotify API failed (${r.status}): ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function fetchArtistAlbumsForCatalog(artistId, includeGroupsRaw) {
  const market = spotifyMarket();
  const allowed = new Set(['album', 'single', 'appears_on', 'compilation']);
  const groups = String(includeGroupsRaw || 'album,single')
    .split(',')
    .map((s) => s.trim())
    .filter((g) => allowed.has(g));
  const include_groups = groups.length ? groups.join(',') : 'album,single';

  const u = new URL(`https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/albums`);
  u.searchParams.set('include_groups', include_groups);
  u.searchParams.set('market', market);
  u.searchParams.set('limit', '50');

  const albumsRaw = [];
  let nextUrl = u.toString();
  while (nextUrl) {
    const body = await spotifyFetchJson(nextUrl);
    albumsRaw.push(...(body.items || []));
    nextUrl = body.next || null;
  }

  const seenAlbumIds = new Set();
  const albums = [];
  for (const a of albumsRaw) {
    if (!a?.id || seenAlbumIds.has(a.id)) continue;
    seenAlbumIds.add(a.id);
    albums.push(a);
  }
  albums.sort((x, y) => String(y.release_date || '').localeCompare(String(x.release_date || '')));

  return { albums, market };
}

async function buildArtistCatalogTracks(artistId, includeGroupsRaw) {
  const { albums, market } = await fetchArtistAlbumsForCatalog(artistId, includeGroupsRaw);
  const seenTrackIds = new Set();
  const catalogTracks = [];

  for (const album of albums) {
    let tu = `https://api.spotify.com/v1/albums/${encodeURIComponent(album.id)}/tracks?market=${encodeURIComponent(market)}&limit=50`;
    while (tu) {
      const tb = await spotifyFetchJson(tu);
      for (const t of tb.items || []) {
        const tid = sanitizeSpotifyTrackId(t.id);
        if (!tid || seenTrackIds.has(tid)) continue;
        seenTrackIds.add(tid);
        const artists = (t.artists || []).map((x) => x.name).filter(Boolean).join(', ');
        catalogTracks.push({
          id: tid,
          name: t.name,
          artists,
          album: album.name,
          albumArt: album.images?.[0]?.url ?? '',
          durationMs: t.duration_ms ?? null,
          spotifyUrl: t.external_urls?.spotify ?? '',
          youtubeSearchHint: `${t.name || ''} ${artists}`.replace(/\s+/g, ' ').trim(),
          albumReleaseDate: album.release_date || '',
        });
      }
      tu = tb.next || null;
    }
  }

  return {
    albumsCount: albums.length,
    catalogTrackCount: catalogTracks.length,
    tracks: catalogTracks,
  };
}

async function fetchSpotifyTrackPopularityMap(tracks) {
  const ids = tracks.map((t) => sanitizeSpotifyTrackId(t.id)).filter(Boolean);
  const out = new Map();

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const u = new URL('https://api.spotify.com/v1/tracks');
    u.searchParams.set('ids', chunk.join(','));
    u.searchParams.set('market', spotifyMarket());
    const body = await spotifyFetchJson(u.toString());
    for (const t of body.tracks || []) {
      const id = sanitizeSpotifyTrackId(t?.id);
      if (id && typeof t.popularity === 'number') out.set(id, t.popularity);
    }
  }

  return out;
}

function summarizeArtistSyncTrack(track, owned, popularityMap) {
  const spotifyId = sanitizeSpotifyTrackId(track?.id);
  return {
    ...track,
    id: spotifyId || track?.id || '',
    inLibrary: Boolean(spotifyId && owned.has(spotifyId)),
    spotifyPopularity: popularityMap.has(spotifyId) ? popularityMap.get(spotifyId) : null,
    // Spotify does not expose public stream counts through the Web API.
    spotifyStreams: null,
    youtubeViews: null,
  };
}

async function collectOwnedSpotifyIdsFromLibrary() {
  assertStorageConfigured();
  const keys = (await listAllKeysWithPrefix(R2_MUSIC_PREFIX)).filter(isLibraryObjectKey);
  const ids = new Set();

  await mapWithConcurrency(keys, 16, async (key) => {
    try {
      const head = await headWithMeta(key);
      const metaId = sanitizeSpotifyTrackId(head.metadata?.spotifyId);
      if (metaId) ids.add(metaId);
    } catch {
      /* fall through */
    }
    const keyId = sanitizeSpotifyTrackId(spotifyIdFromObjectKey(key));
    if (keyId) ids.add(keyId);
  });

  return ids;
}

async function fetchSpotifyArtistProfile(artistId) {
  const body = await spotifyFetchJson(
    `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}`,
  );
  return {
    id: body.id,
    name: body.name,
    image: body.images?.[0]?.url ?? '',
    genres: Array.isArray(body.genres) ? body.genres.slice(0, 6) : [],
    popularity: typeof body.popularity === 'number' ? body.popularity : null,
    spotifyUrl: body.external_urls?.spotify ?? '',
  };
}

function parseYoutubeVideoId(raw) {
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }

  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') return u.pathname.replace(/^\//, '').split('/')[0] || null;
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v');
    if (v) return v;
    const shorts = u.pathname.match(/^\/shorts\/([^/?]+)/);
    if (shorts) return shorts[1];
  }
  return null;
}

function assertYoutubeHttpUrl(raw) {
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Invalid URL protocol');
  }
  const host = u.hostname.replace(/^www\./, '');
  const ok =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtu.be';
  if (!ok) throw new Error('URL must be a YouTube link');
}

function buildYoutubeSearchQuery(track) {
  const title = String(track?.name ?? track?.title ?? '').trim();
  const artists = String(track?.artists ?? track?.artist ?? '').trim();
  const hint = String(track?.youtubeSearchHint ?? '').trim();
  if (hint) return `${hint} official audio`;
  return `${artists ? `${artists} ` : ''}${title} official audio`.trim();
}

/** Spotify track IDs are URL-safe; keep strict so object keys stay stable. */
function sanitizeSpotifyTrackId(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '');
  return s.length >= 12 && s.length <= 32 ? s : '';
}

function canonicalSpotifyObjectKey(spotifyId) {
  const id = sanitizeSpotifyTrackId(spotifyId);
  if (!id) return null;
  return `${R2_MUSIC_PREFIX}spotify/${id}.mp3`;
}

/** Derive Spotify id from path .../spotify/{id}.mp3 when metadata is missing (legacy). */
function spotifyIdFromObjectKey(objectKey) {
  const k = String(objectKey ?? '');
  const prefix = R2_MUSIC_PREFIX;
  const rel = prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k;
  const m = rel.match(/^spotify\/([a-zA-Z0-9]{12,32})\.mp3$/i);
  return m ? m[1] : '';
}

const MUSIC_IDENTITY_STOP_WORDS = new Set([
  'audio',
  'clip',
  'download',
  'extended',
  'full',
  'hd',
  'hq',
  'lyrics',
  'lyric',
  'music',
  'official',
  'original',
  'remaster',
  'remastered',
  'search',
  'video',
  'visualizer',
]);

function musicIdentityTokens(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/^[0-9]{10,}_/, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => {
      if (!t || t.length <= 1) return false;
      if (/^[0-9]+$/.test(t)) return false;
      if (/^[a-f0-9]{7,}$/i.test(t)) return false;
      return !MUSIC_IDENTITY_STOP_WORDS.has(t);
    });
}

function musicIdentityFromParts(parts) {
  const tokens = [...new Set(parts.flatMap((p) => musicIdentityTokens(p)))].sort();
  if (tokens.length < 2) return '';
  return `tokens:${tokens.join('|')}`;
}

function musicIdentityFromMetadata(metadata) {
  const title = metadata?.title || metadata?.name || '';
  const artist = metadata?.artist || metadata?.artists || '';
  return musicIdentityFromParts([artist, title]);
}

function musicIdentityFromObjectKey(objectKey) {
  const k = String(objectKey ?? '');
  const prefix = R2_MUSIC_PREFIX;
  const rel = prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k;
  const parts = rel.split('/').filter(Boolean);
  const file = parts.at(-1) || rel;
  const titlePart = file.replace(/\[[^\]]+\]/g, ' ');
  if (parts.length >= 3 && parts[0].toLowerCase() === 'audio') {
    return musicIdentityFromParts([parts[parts.length - 3], titlePart]);
  }
  return musicIdentityFromParts([titlePart]);
}

function musicIdentityGroupId(objectKey, metadata) {
  const stored = String(metadata?.identityKey || '').trim();
  if (stored) return stored;
  return musicIdentityFromMetadata(metadata) || musicIdentityFromObjectKey(objectKey);
}

function canonicalNormalizedObjectKey(trackMeta) {
  const identity = musicIdentityFromMetadata({
    title: trackMeta?.name || trackMeta?.title || '',
    artist: trackMeta?.artists || trackMeta?.artist || '',
  });
  if (!identity) return null;
  const slug = slugPart(identity.replace(/^tokens:/, '').replace(/\|/g, '_')).slice(0, 120);
  return slug ? `${R2_MUSIC_PREFIX}normalized/${slug}.mp3` : null;
}

function trackMetadataInput(trackMeta = {}) {
  return {
    title: trackMeta.name || trackMeta.title || '',
    artist: trackMeta.artists || trackMeta.artist || '',
    album: trackMeta.album || '',
    spotifyId: sanitizeSpotifyTrackId(trackMeta.id) || sanitizeSpotifyTrackId(trackMeta.spotifyId),
  };
}

function trackIdentityKey(trackMeta = {}) {
  const t = trackMetadataInput(trackMeta);
  return musicIdentityFromMetadata({ title: t.title, artist: t.artist });
}

function trackFromResolvedObject(key, head) {
  const m = head?.metadata || {};
  return {
    title: m.title || '',
    artist: m.artist || '',
    album: m.album || '',
    spotifyId: m.spotifyId || '',
    objectKey: key,
  };
}

async function safeHead(key) {
  try {
    assertStorageKeyAllowed(key);
    return await headWithMeta(key);
  } catch {
    return null;
  }
}

function scoreResolvedObject(item) {
  let score = 0;
  if (item.reason === 'spotifyKey') score += 1000;
  if (item.reason === 'spotifyMetadata') score += 750;
  if (item.reason === 'identityMetadata') score += 500;
  if (item.hasUserMetadata) score += 200;
  if (String(item.contentType || '').startsWith('audio/')) score += 100;
  if (/\.mp3$/i.test(item.key)) score += 50;
  return score;
}

async function resolveExistingMusicObject(trackMeta = {}) {
  assertStorageConfigured();
  const input = trackMetadataInput(trackMeta);
  const candidates = [];

  if (input.spotifyId) {
    const canonicalKey = canonicalSpotifyObjectKey(input.spotifyId);
    const head = canonicalKey ? await safeHead(canonicalKey) : null;
    if (head) {
      return {
        found: true,
        reason: 'spotifyKey',
        key: canonicalKey,
        bytes: head.contentLength ?? 0,
        metadata: head.metadata,
        contentType: head.contentType,
        lastModified: head.lastModified,
        track: trackFromResolvedObject(canonicalKey, head),
      };
    }
  }

  const identity = trackIdentityKey(trackMeta);
  const keys = (await listAllKeysWithPrefix(R2_MUSIC_PREFIX)).filter(isLibraryObjectKey);
  await mapWithConcurrency(keys.filter(isLibraryObjectKey), 8, async (key) => {
    try {
      const head = await headWithMeta(key);
      const metaSpotifyId = sanitizeSpotifyTrackId(head.metadata?.spotifyId);
      const metaIdentity = String(head.metadata?.identityKey || '').trim() || musicIdentityFromMetadata(head.metadata);
      let reason = '';
      if (input.spotifyId && metaSpotifyId === input.spotifyId) reason = 'spotifyMetadata';
      else if (identity && metaIdentity === identity) reason = 'identityMetadata';
      if (!reason) return;
      candidates.push({
        reason,
        key,
        bytes: head.contentLength ?? 0,
        metadata: head.metadata,
        contentType: head.contentType,
        lastModified: head.lastModified,
        lastModifiedMs: head.lastModifiedMs,
        hasUserMetadata: Boolean(head.metadata?.title || head.metadata?.artist || head.metadata?.album),
        track: trackFromResolvedObject(key, head),
      });
    } catch {
      // Ignore individual unreadable objects.
    }
  });

  if (!candidates.length) return { found: false, reason: 'miss' };
  candidates.sort((a, b) => {
    const scoreDiff = scoreResolvedObject(b) - scoreResolvedObject(a);
    if (scoreDiff) return scoreDiff;
    return (b.lastModifiedMs || 0) - (a.lastModifiedMs || 0);
  });
  return { found: true, ...candidates[0] };
}

function isoDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function analyticsEventsKey(day = isoDay()) {
  return `${MUSIC_ANALYTICS_PREFIX}events/${day}.json`;
}

function compactTrackPayload(track = {}) {
  return {
    title: String(track.title || track.name || '').slice(0, 200),
    artist: String(track.artist || track.artists || '').slice(0, 200),
    album: String(track.album || '').slice(0, 200),
    spotifyId: sanitizeSpotifyTrackId(track.spotifyId || track.id),
    objectKey: String(track.objectKey || '').slice(0, 512),
  };
}

async function appendMusicEvent(input) {
  if (!r2Client || !R2_BUCKET) return;
  const now = new Date();
  const key = analyticsEventsKey(isoDay(now));
  const doc = await readJsonObject(key, { events: [] });
  const events = Array.isArray(doc.events) ? doc.events : [];
  events.push({
    id: crypto.randomUUID(),
    at: now.toISOString(),
    type: String(input?.type || 'event'),
    ...input,
  });
  const trimmed = events.slice(-MUSIC_ANALYTICS_MAX_EVENTS_PER_DAY);
  await putJsonObject(key, { updatedAt: now.toISOString(), events: trimmed });
}

async function appendMusicEventSafe(input) {
  try {
    await appendMusicEvent(input);
  } catch {
    // Analytics should never break playback or ingest.
  }
}

async function listAnalyticsEvents() {
  const keys = await listAllKeysWithPrefix(`${MUSIC_ANALYTICS_PREFIX}events/`);
  const docs = await mapWithConcurrency(keys, 8, (key) => readJsonObject(key, { events: [] }));
  return docs.flatMap((doc) => (Array.isArray(doc.events) ? doc.events : []));
}

function startOfUtcDay(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function periodStartMs(period, now = new Date()) {
  const day = startOfUtcDay(now);
  if (period === '24h') return now.getTime() - 24 * 60 * 60 * 1000;
  if (period === 'today') return day;
  if (period === 'week') return day - 6 * 24 * 60 * 60 * 1000;
  if (period === 'month') return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  if (period === 'year') return Date.UTC(now.getUTCFullYear(), 0, 1);
  return 0;
}

function eventTimeMs(event) {
  return Date.parse(event?.at || '') || 0;
}

function countSince(items, period, timeFn) {
  const start = periodStartMs(period);
  return items.filter((item) => timeFn(item) >= start).length;
}

function bytesSince(objects, period) {
  const start = periodStartMs(period);
  return objects
    .filter((o) => (Date.parse(o.lastModified || '') || 0) >= start)
    .reduce((sum, o) => sum + (Number(o.size) || 0), 0);
}

function incrementMap(map, key, amount = 1) {
  const k = String(key || '').trim() || 'Unknown';
  map.set(k, (map.get(k) || 0) + amount);
}

function topMap(map, limit = 8) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

async function buildMusicStats() {
  assertStorageConfigured();
  const keys = (await listAllKeysWithPrefix(R2_MUSIC_PREFIX)).filter(isLibraryObjectKey);
  const objects = (
    await mapWithConcurrency(keys, 8, async (key) => {
      try {
        const h = await headWithMeta(key);
        return {
          key,
          size: h.contentLength ?? 0,
          lastModified: h.lastModified,
          metadata: h.metadata,
          contentType: h.contentType,
        };
      } catch {
        return null;
      }
    })
  ).filter(Boolean);
  const events = await listAnalyticsEvents();
  const plays = events.filter((e) => e.type === 'play');
  const installs = events.filter((e) => e.type === 'install');
  const searches = events.filter((e) => e.type === 'search');
  const reuse = events.filter((e) => e.type === 'reuse');
  const totalBytes = objects.reduce((sum, o) => sum + (Number(o.size) || 0), 0);

  const playMap = new Map();
  const searchArtistMap = new Map();
  const storageArtistMap = new Map();
  const installSeriesMap = new Map();
  const playSeriesMap = new Map();

  for (const o of objects) {
    incrementMap(storageArtistMap, o.metadata?.artist || 'Unknown', Number(o.size) || 0);
  }
  for (const e of plays) {
    const label = e.title || e.track?.title || e.objectKey || 'Unknown';
    incrementMap(playMap, label);
    incrementMap(playSeriesMap, isoDay(new Date(eventTimeMs(e) || Date.now())));
  }
  for (const e of searches) {
    for (const artist of e.artists || []) incrementMap(searchArtistMap, artist);
  }
  for (const e of installs) {
    incrementMap(installSeriesMap, isoDay(new Date(eventTimeMs(e) || Date.now())));
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      tracks: objects.length,
      totalBytes,
      installs: {
        today: countSince(objects, 'today', (o) => Date.parse(o.lastModified || '') || 0),
        week: countSince(objects, 'week', (o) => Date.parse(o.lastModified || '') || 0),
        month: countSince(objects, 'month', (o) => Date.parse(o.lastModified || '') || 0),
        year: countSince(objects, 'year', (o) => Date.parse(o.lastModified || '') || 0),
        allTime: objects.length,
      },
      installedBytes: {
        today: bytesSince(objects, 'today'),
        week: bytesSince(objects, 'week'),
        month: bytesSince(objects, 'month'),
        year: bytesSince(objects, 'year'),
        allTime: totalBytes,
      },
      plays: {
        last24h: countSince(plays, '24h', eventTimeMs),
        week: countSince(plays, 'week', eventTimeMs),
        month: countSince(plays, 'month', eventTimeMs),
        year: countSince(plays, 'year', eventTimeMs),
        allTime: plays.length,
      },
      searches: {
        last24h: countSince(searches, '24h', eventTimeMs),
        week: countSince(searches, 'week', eventTimeMs),
        month: countSince(searches, 'month', eventTimeMs),
        allTime: searches.length,
      },
      reuses: reuse.length,
    },
    charts: {
      installsByDay: topMap(installSeriesMap, 30).sort((a, b) => a.label.localeCompare(b.label)),
      playsByDay: topMap(playSeriesMap, 30).sort((a, b) => a.label.localeCompare(b.label)),
      storageByArtist: topMap(storageArtistMap, 8),
      topPlayedSongs: topMap(playMap, 10),
      mostSearchedArtists: topMap(searchArtistMap, 10),
    },
  };
}

/**
 * One stable object per Spotify track: re-ingesting overwrites the same key.
 * Uploads without a Spotify id but with title/artist metadata use a normalized
 * title+artist key. Metadata-free manual URL uploads remain unique.
 */
function buildObjectKey(trackMeta, fallbackSeed) {
  const prefix = R2_MUSIC_PREFIX;
  const sid =
    sanitizeSpotifyTrackId(trackMeta?.id) || sanitizeSpotifyTrackId(trackMeta?.spotifyId);
  if (sid) {
    return `${prefix}spotify/${sid}.mp3`;
  }

  const normalizedKey = canonicalNormalizedObjectKey(trackMeta);
  if (normalizedKey) return normalizedKey;

  const title = slugPart(trackMeta?.name ?? trackMeta?.title ?? '');
  const artist = slugPart(trackMeta?.artists ?? trackMeta?.artist ?? '');
  const seed = slugPart(fallbackSeed ?? '') || crypto.randomBytes(4).toString('hex');
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}${stamp}_${artist || 'artist'}_${title || 'track'}_${seed}_${rand}.mp3`;
}

function runCommandCapture(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `${binary} exited with ${code}`));
    });
  });
}

async function runYtDlpCapture(args) {
  const configured = (process.env.YT_DLP_PATH ?? '').trim();
  const candidates = [
    configured ? { binary: configured, args } : null,
    { binary: 'yt-dlp', args },
    { binary: '/usr/local/bin/yt-dlp', args },
    { binary: '/usr/bin/yt-dlp', args },
    { binary: 'python3', args: ['-m', 'yt_dlp', ...args] },
  ].filter(Boolean);

  const seen = new Set();
  let lastError = null;

  for (const candidate of candidates) {
    const key = `${candidate.binary} ${candidate.args[0] || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      return await runCommandCapture(candidate.binary, candidate.args);
    } catch (err) {
      lastError = err;
      const message = err?.message ? String(err.message) : String(err);
      if (err?.code === 'ENOENT' || /ENOENT/.test(message)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('yt-dlp is not available in this environment');
}

async function locateDownloadedMp3(workDir) {
  const files = await fs.readdir(workDir);
  const mp3 = files.find((f) => f.endsWith('.mp3'));
  if (!mp3) {
    throw new Error('yt-dlp finished but no mp3 was produced (is ffmpeg installed?)');
  }
  return path.join(workDir, mp3);
}

async function createPlaybackUrl(key, expiresIn = 3600) {
  const publicUrl = publicUrlForKey(key);
  if (publicUrl) return publicUrl;
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return getSignedUrl(r2Client, cmd, { expiresIn });
}

async function downloadAndUploadAudio({ sourceSpec, trackMeta = {}, wantPlaybackUrl = false, sourceKind = 'query' }) {
  assertStorageConfigured();

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vulu-music-'));
  const outTpl = path.join(workDir, 'audio.%(ext)s');

  try {
    await runYtDlpCapture([
      '-x',
      '--audio-format',
      'mp3',
      '--no-playlist',
      '--no-warnings',
      '--ignore-errors',
      '-o',
      outTpl,
      sourceSpec,
    ]);

    const filePath = await locateDownloadedMp3(workDir);
    const buf = await fs.readFile(filePath);
    const bytes = buf.length;
    const contentSha256 = crypto.createHash('sha256').update(buf).digest('hex');

    const fallbackSeed = sourceKind === 'url' ? parseYoutubeVideoId(sourceSpec) || 'youtube' : 'search';
    const objectKey = buildObjectKey(trackMeta, fallbackSeed);
    const metadata = normalizeUserMetadata({
      title: trackMeta.name || trackMeta.title || '',
      artist: trackMeta.artists || trackMeta.artist || '',
      album: trackMeta.album || '',
      spotifyId: trackMeta.id || '',
      youtubeQuery: sourceKind === 'query' ? sourceSpec.replace(/^ytsearch1:/, '') : '',
      source: sourceKind,
      identityKey:
        musicIdentityFromMetadata({
          title: trackMeta.name || trackMeta.title || '',
          artist: trackMeta.artists || trackMeta.artist || '',
        }) || musicIdentityFromObjectKey(objectKey),
      contentSha256,
    });

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
        Body: buf,
        ContentType: 'audio/mpeg',
        Metadata: metadata,
      }),
    );

    const dedupedKeys = await pruneDuplicatesForKeeper(objectKey, metadata).catch(() => []);

    return {
      ok: true,
      objectKey,
      bytes,
      dedupedKeys,
      publicUrl: publicUrlForKey(objectKey),
      playbackUrl: wantPlaybackUrl ? await createPlaybackUrl(objectKey) : null,
      track: {
        title: metadata.title || '',
        artist: metadata.artist || '',
        album: metadata.album || '',
      },
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '128kb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    spotify: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
    r2: !!(r2Client && R2_BUCKET),
    prefix: R2_MUSIC_PREFIX,
    ytDlpPath: (process.env.YT_DLP_PATH ?? '').trim() || 'auto-detect',
  });
});

app.get('/api/spotify/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.json({ tracks: [] });

  try {
    const token = await getSpotifyAccessToken();
    const params = new URLSearchParams({ q, type: 'track', limit: '15' });
    const r = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({ error: 'Spotify search failed', detail: text.slice(0, 500) });
    }
    const tracks = mapSpotifyTracks(JSON.parse(text));
    await appendMusicEventSafe({
      type: 'search',
      query: q,
      resultCount: tracks.length,
      artists: [...new Set(tracks.flatMap((t) => String(t.artists || '').split(',').map((a) => a.trim())).filter(Boolean))].slice(0, 12),
    });
    res.json({ tracks });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.get('/api/spotify/artists', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.json({ artists: [] });

  try {
    const token = await getSpotifyAccessToken();
    const params = new URLSearchParams({ q, type: 'artist', limit: '12' });
    const r = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({ error: 'Spotify artist search failed', detail: text.slice(0, 500) });
    }
    const artists = mapSpotifyArtists(JSON.parse(text));
    await appendMusicEventSafe({
      type: 'search',
      query: q,
      artistSearch: true,
      resultCount: artists.length,
    });
    res.json({ artists });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.get('/api/music/artist-sync/plan', async (req, res) => {
  const artistId = sanitizeSpotifyTrackId(String(req.query.artistId ?? '').trim());
  if (!artistId) return res.status(400).json({ error: 'Missing or invalid artistId' });
  const includeGroups = String(req.query.includeGroups ?? 'album,single').trim();

  try {
    assertStorageConfigured();
    const [profile, catalog, owned] = await Promise.all([
      fetchSpotifyArtistProfile(artistId),
      buildArtistCatalogTracks(artistId, includeGroups),
      collectOwnedSpotifyIdsFromLibrary(),
    ]);
    const popularityMap = await fetchSpotifyTrackPopularityMap(catalog.tracks).catch(() => new Map());
    const tracks = catalog.tracks.map((t) => summarizeArtistSyncTrack(t, owned, popularityMap));
    const ownedTracks = tracks.filter((t) => t.inLibrary);
    const missing = tracks.filter((t) => !t.inLibrary);
    const recentTracks = [...tracks]
      .sort((a, b) => String(b.albumReleaseDate || '').localeCompare(String(a.albumReleaseDate || '')))
      .slice(0, 24);
    res.json({
      artist: profile,
      albumsCount: catalog.albumsCount,
      catalogTrackCount: catalog.catalogTrackCount,
      ownedInLibraryCount: ownedTracks.length,
      missingCount: missing.length,
      tracks,
      ownedTracks: ownedTracks.slice(0, 100),
      missingTracks: missing,
      recentTracks,
      metricsAvailability: {
        spotifyPopularity: popularityMap.size > 0,
        spotifyStreams: false,
        youtubeViews: false,
        note: 'Spotify Web API exposes popularity scores, not stream/view counts. YouTube views require a YouTube Data API integration and exact video matching.',
      },
      includeGroups: includeGroups.split(',').map((s) => s.trim()).filter(Boolean),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.post('/api/music/resolve', async (req, res) => {
  try {
    const track = req.body?.track ?? {};
    const resolved = await resolveExistingMusicObject(track);
    if (!resolved.found) return res.json({ found: false });
    res.json({
      found: true,
      reused: true,
      reason: resolved.reason,
      objectKey: resolved.key,
      bytes: resolved.bytes,
      publicUrl: publicUrlForKey(resolved.key),
      playbackUrl: await createPlaybackUrl(resolved.key),
      track: resolved.track,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.post('/api/music/ingest', async (req, res) => {
  const track = req.body?.track ?? null;
  const wantPlaybackUrl = Boolean(req.body?.wantPlaybackUrl);
  const queryOverride = String(req.body?.query ?? '').trim();

  const title = String(track?.name ?? track?.title ?? '').trim();
  if (!title && !queryOverride) {
    return res.status(400).json({ error: 'Missing track metadata or query' });
  }

  try {
    const youtubeQuery = queryOverride || buildYoutubeSearchQuery(track);
    if (wantPlaybackUrl && !queryOverride) {
      const resolved = await resolveExistingMusicObject(track || { name: title });
      if (resolved.found) {
        const playbackUrl = await createPlaybackUrl(resolved.key);
        await appendMusicEventSafe({
          type: 'reuse',
          reason: resolved.reason,
          objectKey: resolved.key,
          bytes: resolved.bytes,
          ...compactTrackPayload({ ...(resolved.track || {}), ...(track || {}) }),
        });
        await appendMusicEventSafe({
          type: 'play',
          reused: true,
          objectKey: resolved.key,
          bytes: resolved.bytes,
          ...compactTrackPayload({ ...(resolved.track || {}), ...(track || {}) }),
        });
        return res.json({
          ok: true,
          reused: true,
          reuseReason: resolved.reason,
          objectKey: resolved.key,
          bytes: resolved.bytes,
          publicUrl: publicUrlForKey(resolved.key),
          playbackUrl,
          track: resolved.track,
          youtubeQuery,
        });
      }
    }

    const payload = await downloadAndUploadAudio({
      sourceSpec: `ytsearch1:${youtubeQuery}`,
      trackMeta: track || { name: title },
      wantPlaybackUrl,
      sourceKind: 'query',
    });
    await appendMusicEventSafe({
      type: 'install',
      objectKey: payload.objectKey,
      bytes: payload.bytes,
      source: 'spotify-search',
      ...compactTrackPayload({ ...(track || {}), objectKey: payload.objectKey }),
    });
    if (wantPlaybackUrl) {
      await appendMusicEventSafe({
        type: 'play',
        reused: false,
        objectKey: payload.objectKey,
        bytes: payload.bytes,
        ...compactTrackPayload({ ...(track || {}), objectKey: payload.objectKey }),
      });
    }

    res.json({
      ...payload,
      reused: false,
      youtubeQuery,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// Legacy/manual URL route kept for fallback debugging.
app.post('/api/youtube/upload', async (req, res) => {
  const url = String(req.body?.url ?? '').trim();
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    assertYoutubeHttpUrl(url);
    const payload = await downloadAndUploadAudio({
      sourceSpec: url,
      trackMeta: req.body?.track ?? {},
      wantPlaybackUrl: Boolean(req.body?.wantPlaybackUrl),
      sourceKind: 'url',
    });
    await appendMusicEventSafe({
      type: 'install',
      objectKey: payload.objectKey,
      bytes: payload.bytes,
      source: 'youtube-url',
      ...compactTrackPayload({ ...(req.body?.track || {}), objectKey: payload.objectKey }),
    });
    res.json({
      ...payload,
      videoId: parseYoutubeVideoId(url),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.get('/api/storage/music', async (req, res) => {
  try {
    assertStorageConfigured();
    const maxKeys = Math.min(500, Math.max(1, Number(req.query.maxKeys) || 200));
    const continuationToken = req.query.continuationToken
      ? String(req.query.continuationToken)
      : undefined;

    const list = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: R2_MUSIC_PREFIX,
        MaxKeys: maxKeys,
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      }),
    );

    const contents = (list.Contents || []).filter((obj) => isLibraryObjectKey(obj.Key));
    const objects = await mapWithConcurrency(contents, 8, async (obj) => {
      const key = obj.Key;
      if (!key) return null;
      try {
        const head = await headWithMeta(key);
        return {
          key,
          size: obj.Size ?? head.contentLength ?? 0,
          lastModified: obj.LastModified?.toISOString?.() || head.lastModified,
          metadata: head.metadata,
          contentType: head.contentType,
          publicUrl: publicUrlForKey(key),
        };
      } catch {
        return {
          key,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified?.toISOString?.() ?? null,
          metadata: { title: '', artist: '', album: '' },
          contentType: '',
          publicUrl: publicUrlForKey(key),
        };
      }
    });

    res.json({
      prefix: R2_MUSIC_PREFIX,
      objects: objects.filter(Boolean),
      isTruncated: Boolean(list.IsTruncated),
      nextContinuationToken: list.NextContinuationToken || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.get('/api/storage/music/presign', async (req, res) => {
  try {
    assertStorageConfigured();
    const key = String(req.query.key ?? '').trim();
    assertStorageKeyAllowed(key);

    const expiresIn = Math.min(86_400, Math.max(60, Number(req.query.expiresIn) || 3600));
    const url = await createPlaybackUrl(key, expiresIn);
    if (String(req.query.event || '') === 'play') {
      const head = await safeHead(key);
      await appendMusicEventSafe({
        type: 'play',
        reused: true,
        objectKey: key,
        bytes: head?.contentLength ?? 0,
        ...compactTrackPayload({ ...(head?.metadata || {}), objectKey: key }),
      });
    }
    res.json({ url, expiresIn });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.post('/api/storage/music/delete', async (req, res) => {
  try {
    assertStorageConfigured();
    const key = String(req.body?.key ?? '').trim();
    assertStorageKeyAllowed(key);
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    await appendMusicEventSafe({ type: 'delete', objectKey: key });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.put('/api/storage/music/metadata', async (req, res) => {
  try {
    assertStorageConfigured();
    const key = String(req.body?.key ?? '').trim();
    assertStorageKeyAllowed(key);

    const title = req.body?.title != null ? String(req.body.title) : '';
    const artist = req.body?.artist != null ? String(req.body.artist) : '';
    const album = req.body?.album != null ? String(req.body.album) : '';
    const head = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const previous = head.Metadata || {};
    const meta = normalizeUserMetadata({
      title,
      artist,
      album,
      spotifyId: previous.spotifyid || previous.spotifyId || '',
      youtubeQuery: previous.youtubequery || previous.youtubeQuery || '',
      source: previous.source || '',
      identityKey: musicIdentityFromMetadata({ title, artist }) || previous.identitykey || previous.identityKey || '',
      contentSha256: previous.contentsha256 || previous.contentSha256 || '',
    });

    await r2Client.send(
      new CopyObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        CopySource: copySourceForR2(key),
        MetadataDirective: 'REPLACE',
        ContentType: head.ContentType || 'audio/mpeg',
        Metadata: meta,
      }),
    );

    const refreshed = await headWithMeta(key);
    res.json({ ok: true, key, metadata: refreshed.metadata });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

async function listAllKeysWithPrefix(prefix) {
  assertStorageConfigured();
  const keys = [];
  let token;
  do {
    const list = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const obj of list.Contents || []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

function musicDedupeGroupIds(key, metadata) {
  const ids = [];
  const fromMeta = sanitizeSpotifyTrackId(metadata?.spotifyId);
  if (fromMeta) ids.push(`spotify:${fromMeta}`);
  const fromKey = sanitizeSpotifyTrackId(spotifyIdFromObjectKey(key));
  if (fromKey) ids.push(`spotify:${fromKey}`);
  const identity = musicIdentityGroupId(key, metadata);
  if (identity) ids.push(`identity:${identity}`);
  const hash = String(metadata?.contentSha256 || '').trim();
  if (/^[a-f0-9]{64}$/i.test(hash)) ids.push(`sha256:${hash.toLowerCase()}`);
  return [...new Set(ids)];
}

function canonicalObjectKeyForDedupeGroup(groupId) {
  const s = String(groupId || '');
  if (s.startsWith('spotify:')) return canonicalSpotifyObjectKey(s.slice('spotify:'.length));
  if (s.startsWith('identity:tokens:')) {
    const slug = slugPart(s.slice('identity:tokens:'.length).replace(/\|/g, '_')).slice(0, 120);
    return slug ? `${R2_MUSIC_PREFIX}normalized/${slug}.mp3` : null;
  }
  return null;
}

async function pruneDuplicatesForKeeper(keeperKey, keeperMetadata) {
  const keeperGroupIds = new Set(musicDedupeGroupIds(keeperKey, keeperMetadata));
  if (!keeperGroupIds.size) return [];

  const keys = await listAllKeysWithPrefix(R2_MUSIC_PREFIX);
  const toDelete = [];

  await mapWithConcurrency(keys, 8, async (key) => {
    if (!key || key === keeperKey) return;
    try {
      const h = await headWithMeta(key);
      const overlaps = musicDedupeGroupIds(key, h.metadata).some((id) => keeperGroupIds.has(id));
      if (overlaps) toDelete.push(key);
    } catch {
      // Ignore unreadable objects; the explicit prune endpoint can report broader failures.
    }
  });

  for (const delKey of toDelete) {
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: delKey }));
  }
  return toDelete;
}

/**
 * Deletes extra R2 objects that represent the same track. We prefer strong IDs
 * (Spotify ID), then normalized artist/title/filename tokens, then exact content
 * hashes. Keeps the canonical key when present, otherwise the newest LastModified.
 */
app.post('/api/storage/music/prune-spotify-duplicates', async (req, res) => {
  try {
    assertStorageConfigured();
    const dryRun = Boolean(req.body?.dryRun);

    const keys = (await listAllKeysWithPrefix(R2_MUSIC_PREFIX)).filter(isLibraryObjectKey);
    const items = (
      await mapWithConcurrency(keys, 8, async (key) => {
        try {
          const h = await headWithMeta(key);
          const groupIds = musicDedupeGroupIds(key, h.metadata);
          if (!groupIds.length) return null;
          return {
            key,
            groupIds,
            contentType: h.contentType || '',
            hasUserMetadata: Boolean(h.metadata?.title || h.metadata?.artist || h.metadata?.album),
            lastModifiedMs: h.lastModifiedMs || 0,
          };
        } catch {
          return null;
        }
      })
    ).filter(Boolean);

    const grouped = new Map();
    for (const it of items) {
      for (const groupId of it.groupIds) {
        if (!grouped.has(groupId)) grouped.set(groupId, []);
        grouped.get(groupId).push(it);
      }
    }

    const toDelete = new Set();
    const kept = {};

    const scoreKeeper = (groupId, item) => {
      const canonicalKey = canonicalObjectKeyForDedupeGroup(groupId);
      let score = 0;
      if (canonicalKey && item.key === canonicalKey) score += 1000;
      if (item.hasUserMetadata) score += 250;
      if (String(item.contentType || '').startsWith('audio/')) score += 150;
      if (/\.mp3$/i.test(item.key)) score += 75;
      if (/\/(spotify|normalized)\//i.test(item.key) || /^(spotify|normalized)\//i.test(item.key)) {
        score += 50;
      }
      return score;
    };

    for (const [groupId, group] of grouped.entries()) {
      if (group.length < 2) continue;

      const canonicalKey = canonicalObjectKeyForDedupeGroup(groupId);
      const canonicalHit = canonicalKey && group.find((g) => g.key === canonicalKey);
      const keeper =
        canonicalHit ||
        group.reduce((best, cur) => {
          const bestScore = scoreKeeper(groupId, best);
          const curScore = scoreKeeper(groupId, cur);
          if (curScore !== bestScore) return curScore > bestScore ? cur : best;
          return cur.lastModifiedMs > best.lastModifiedMs ? cur : best;
        }, group[0]);

      kept[groupId] = keeper.key;
      for (const g of group) {
        if (g.key !== keeper.key) toDelete.add(g.key);
      }
    }

    const deletedKeys = [...toDelete];
    if (!dryRun) {
      for (const delKey of deletedKeys) {
        await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: delKey }));
      }
    }

    res.json({
      ok: true,
      dryRun,
      keysScanned: keys.length,
      spotifyIdsWithDuplicates: [...grouped.entries()].filter(
        ([id, g]) => id.startsWith('spotify:') && g.length >= 2,
      ).length,
      identityGroupsWithDuplicates: [...grouped.values()].filter((g) => g.length >= 2).length,
      removed: deletedKeys.length,
      deletedKeys,
      keptKeysByGroupId: kept,
      keptKeysBySpotifyId: Object.fromEntries(
        Object.entries(kept)
          .filter(([id]) => id.startsWith('spotify:'))
          .map(([id, key]) => [id.slice('spotify:'.length), key]),
      ),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.get('/api/music/stats', async (_req, res) => {
  try {
    res.json(await buildMusicStats());
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`vulu-admin music-ingest listening on http://${HOST}:${PORT}`);
  console.log(`R2 prefix: ${R2_MUSIC_PREFIX || '(entire bucket)'}`);
});
