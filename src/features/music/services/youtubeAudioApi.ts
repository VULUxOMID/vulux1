import type { Track } from '../types';
import {
  getExtraAllowlistFromEnv,
  getExtraBlocklistFromEnv,
  YOUTUBE_ALLOWLIST_SUBSTRINGS,
  YOUTUBE_BLOCKLIST_SUBSTRINGS,
} from '../../../config/youtubeRanking';

type YoutubeAudioTrack = Track & {
  source: 'youtube-audio';
  videoId: string;
};

/** youtube-audio-api returns `{ job: serializeJob(job) }` — track lives under `job`. */
type SerializedTrack = {
  id?: string;
  videoId?: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  durationSeconds?: number;
  streamUrl?: string;
};

type SerializedJob = {
  id?: string;
  status?: string;
  errorMessage?: string;
  streamUrl?: string;
  track?: SerializedTrack | null;
};

type CreateJobResponse = {
  job?: SerializedJob;
};

type JobStatusResponse = {
  job?: SerializedJob;
};

/** How often we ask the server for job status while the worker downloads/transcodes (lower = snappier UI, more requests). */
const DEFAULT_JOB_POLL_INTERVAL_MS = 750;

function getJobPollIntervalMs(): number {
  const raw = process.env.EXPO_PUBLIC_YOUTUBE_JOB_POLL_MS?.trim();
  if (raw && Number.isFinite(Number(raw))) {
    return Math.max(200, Math.min(5000, Math.floor(Number(raw))));
  }
  return DEFAULT_JOB_POLL_INTERVAL_MS;
}

function getJobPollTimeoutMs(): number {
  const raw = process.env.EXPO_PUBLIC_YOUTUBE_JOB_TIMEOUT_MS?.trim();
  if (raw && Number.isFinite(Number(raw))) {
    return Math.max(60_000, Math.min(900_000, Math.floor(Number(raw))));
  }
  return 300_000;
}
/** Request extra candidates; duration / blocklist filters shrink the list. */
const DEFAULT_YT_MAX_RESULTS = 28;
const YT_FALLBACK_IMAGE = 'https://i.ytimg.com/vi/default/hqdefault.jpg';
const YOUTUBE_MUSIC_CATEGORY_ID = '10';

export const YOUTUBE_SEARCH_HELP_TITLE = 'How search works';

export const YOUTUBE_SEARCH_HELP_MESSAGE =
  '• Searches use best match, “official audio”, roughly 1–7 minute tracks, then most-viewed first.\n' +
  '• Results use your region; videos YouTube marks as blocked may show with a label.\n' +
  '• Some videos can still fail to play (licensing, age limits, or blocks the API does not expose). If that happens, try another result.\n\n' +
  'Advanced: set EXPO_PUBLIC_YOUTUBE_SEARCH_STRICT_MUSIC=0 for broader search, or EXPO_PUBLIC_YOUTUBE_FILTER_REGION=0 to skip region filtering.';

export type YoutubeSearchMode = 'title' | 'artist_title';
export type YoutubeOrder = 'relevance' | 'viewCount';
export type YoutubeDurationBucket = 'any' | 'short' | 'medium' | 'long';
export type YoutubeSearchSuffix = 'none' | 'official_audio' | 'lyrics' | 'topic';

export type YoutubeSearchOptions = {
  mode?: YoutubeSearchMode;
  artistHint?: string;
  suffix?: YoutubeSearchSuffix;
  order?: YoutubeOrder;
  durationBucket?: YoutubeDurationBucket;
  /** Seconds; 0 = disabled. Default from env EXPO_PUBLIC_YOUTUBE_MIN_DURATION_SECONDS or 60. */
  minDurationSeconds?: number;
  /** Seconds; 0 = disabled. Default 419 (6:59) or EXPO_PUBLIC_YOUTUBE_MAX_DURATION_SECONDS. */
  maxDurationSeconds?: number;
  /** Fired when moving from search.list to videos.list enrichment. */
  onPhase?: (phase: 'search' | 'details') => void;
};

/** Hidden defaults (no UI): best match, title query, official audio, ~1–7 min, popularity sort after fetch. */
export const DEFAULT_YOUTUBE_SEARCH_OPTIONS: YoutubeSearchOptions = {
  mode: 'title',
  suffix: 'official_audio',
  order: 'relevance',
  durationBucket: 'any',
  minDurationSeconds: 60,
  maxDurationSeconds: 419,
};

export type YoutubeSearchResult = {
  tracks: YoutubeAudioTrack[];
  meta: {
    searchResultCount: number;
    afterDetailFilterCount: number;
    droppedByBlocklist: number;
    droppedByMinDuration: number;
    droppedByMaxDuration: number;
    droppedByCategory: number;
    regionBlockedKept: number;
  };
};

function isStrictMusicCategorySearch(): boolean {
  return process.env.EXPO_PUBLIC_YOUTUBE_SEARCH_STRICT_MUSIC?.trim() !== '0';
}

function isRegionRestrictionFilterEnabled(): boolean {
  return process.env.EXPO_PUBLIC_YOUTUBE_FILTER_REGION?.trim() !== '0';
}

function getDefaultMinDurationSeconds(): number {
  const raw = process.env.EXPO_PUBLIC_YOUTUBE_MIN_DURATION_SECONDS?.trim();
  if (raw === '0') return 0;
  if (raw && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)));
  }
  return 60;
}

function getDefaultMaxDurationSeconds(): number {
  const raw = process.env.EXPO_PUBLIC_YOUTUBE_MAX_DURATION_SECONDS?.trim();
  if (raw === '0') return 0;
  if (raw && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)));
  }
  return 419;
}

export function getViewerRegionCode(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions() as {
      region?: string;
      locale?: string;
    };
    const r = resolved.region;
    if (r && typeof r === 'string' && /^[A-Z]{2}$/i.test(r)) {
      return r.toUpperCase();
    }
  } catch {
    // ignore
  }
  const env = process.env.EXPO_PUBLIC_VIEWER_REGION_CODE?.trim();
  if (env && /^[A-Z]{2}$/i.test(env)) {
    return env.toUpperCase();
  }
  return 'US';
}

function getRelevanceLanguageCode(): string {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
    const two = loc.split(/[-_]/)[0];
    if (two && /^[a-z]{2}$/i.test(two)) {
      return two.toLowerCase();
    }
  } catch {
    // ignore
  }
  return 'en';
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

/**
 * Normalize env bases so we always build `origin + /api/youtube/...` once.
 * Handles `https://host`, `https://host/api`, and mistaken `https://host/api/youtube`.
 */
function normalizeYoutubeServiceRoot(raw: string | undefined): string {
  let base = normalizeBaseUrl(raw);
  if (!base) return '';
  base = base.replace(/\/api\/youtube\/?$/i, '');
  base = base.replace(/\/api\/?$/i, '');
  return base.replace(/\/+$/, '');
}

function getMusicApiBaseUrl(): string {
  const explicit = normalizeYoutubeServiceRoot(process.env.EXPO_PUBLIC_YOUTUBE_AUDIO_API_BASE_URL);
  if (explicit) return explicit;
  return normalizeYoutubeServiceRoot(process.env.EXPO_PUBLIC_RAILWAY_API_BASE_URL);
}

function getYouTubeApiKey(): string {
  return (process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ?? '').trim();
}

/** Prefer Railway proxy when base URL is set and proxy is not explicitly disabled. */
export function useYoutubeProxy(): boolean {
  if (!getMusicApiBaseUrl()) return false;
  if (process.env.EXPO_PUBLIC_USE_YOUTUBE_PROXY?.trim() === '0') return false;
  return true;
}

export function parseIso8601DurationToSeconds(iso: string | undefined): number {
  if (!iso?.trim()) return 0;
  const m = iso.trim().match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return h * 3600 + min * 60 + s;
}

type VideoDetailsItem = {
  id?: string;
  snippet?: {
    categoryId?: string;
    channelTitle?: string;
    channelId?: string;
  };
  contentDetails?: {
    duration?: string;
    regionRestriction?: { allowed?: string[]; blocked?: string[] };
  };
  statistics?: {
    viewCount?: string;
  };
};

function isVideoBlockedInViewerRegion(
  restriction: { allowed?: string[]; blocked?: string[] } | undefined,
  region: string,
): boolean {
  if (!restriction) {
    return false;
  }
  if (restriction.blocked?.includes(region)) {
    return true;
  }
  if (restriction.allowed && restriction.allowed.length > 0 && !restriction.allowed.includes(region)) {
    return true;
  }
  return false;
}

function buildSearchQuery(raw: string, options: YoutubeSearchOptions): string {
  let q = raw.trim();
  if (options.mode === 'artist_title' && options.artistHint?.trim()) {
    q = `${options.artistHint.trim()} ${q}`.trim();
  }
  const suffix = options.suffix ?? 'none';
  if (suffix === 'official_audio') {
    q = `${q} official audio`.trim();
  } else if (suffix === 'lyrics') {
    q = `${q} lyrics`.trim();
  } else if (suffix === 'topic') {
    q = `${q} topic`.trim();
  }
  if (q.length > 200) {
    q = q.slice(0, 200);
  }
  return q;
}

function isBlocklisted(title: string, channelTitle: string, channelId: string): boolean {
  const hay = `${title} ${channelTitle} ${channelId}`.toLowerCase();
  const all = [...YOUTUBE_BLOCKLIST_SUBSTRINGS, ...getExtraBlocklistFromEnv()];
  return all.some((p) => p.length > 0 && hay.includes(p));
}

function rankScore(title: string, channelTitle: string, channelId: string): number {
  const hay = `${title} ${channelTitle} ${channelId}`.toLowerCase();
  let s = 0;
  for (const p of YOUTUBE_ALLOWLIST_SUBSTRINGS) {
    if (p && hay.includes(p.toLowerCase())) s += 2;
  }
  for (const p of getExtraAllowlistFromEnv()) {
    if (p && hay.includes(p)) s += 2;
  }
  return s;
}

async function fetchYoutubeSearchApi(searchParams: URLSearchParams): Promise<Response> {
  const key = getYouTubeApiKey();
  const proxy = useYoutubeProxy();
  const base = getMusicApiBaseUrl();
  if (proxy && base) {
    const url = `${base.replace(/\/+$/, '')}/api/youtube/search?${searchParams.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      return res;
    }
    const canFallbackDirect =
      Boolean(key) && (res.status === 404 || res.status === 502 || res.status === 503);
    if (canFallbackDirect) {
      if (__DEV__) {
        console.warn('[youtube] Proxy /api/youtube/search failed; using direct YouTube Data API.');
      }
      const p = new URLSearchParams(searchParams);
      p.set('key', key);
      return fetch(`https://www.googleapis.com/youtube/v3/search?${p.toString()}`, {
        headers: { Accept: 'application/json' },
      });
    }
    return res;
  }
  if (!key) {
    throw new Error('Set EXPO_PUBLIC_YOUTUBE_AUDIO_API_BASE_URL (proxy) or EXPO_PUBLIC_YOUTUBE_API_KEY (direct).');
  }
  const p = new URLSearchParams(searchParams);
  p.set('key', key);
  return fetch(`https://www.googleapis.com/youtube/v3/search?${p.toString()}`, {
    headers: { Accept: 'application/json' },
  });
}

async function fetchYoutubeVideosApi(ids: string[]): Promise<Response> {
  const params = new URLSearchParams({
    part: 'contentDetails,snippet,statistics',
    id: ids.join(','),
  });
  const key = getYouTubeApiKey();
  const proxy = useYoutubeProxy();
  const base = getMusicApiBaseUrl();
  if (proxy && base) {
    const url = `${base.replace(/\/+$/, '')}/api/youtube/videos?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      return res;
    }
    const canFallbackDirect =
      Boolean(key) && (res.status === 404 || res.status === 502 || res.status === 503);
    if (canFallbackDirect) {
      if (__DEV__) {
        console.warn('[youtube] Proxy /api/youtube/videos failed; using direct YouTube Data API.');
      }
      const p = new URLSearchParams(params);
      p.set('key', key);
      return fetch(`https://www.googleapis.com/youtube/v3/videos?${p.toString()}`, {
        headers: { Accept: 'application/json' },
      });
    }
    return res;
  }
  if (!key) {
    throw new Error('Set EXPO_PUBLIC_YOUTUBE_AUDIO_API_BASE_URL (proxy) or EXPO_PUBLIC_YOUTUBE_API_KEY (direct).');
  }
  const p = new URLSearchParams(params);
  p.set('key', key);
  return fetch(`https://www.googleapis.com/youtube/v3/videos?${p.toString()}`, {
    headers: { Accept: 'application/json' },
  });
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sanitizeWorkerErrorMessage(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return 'Could not play this track.';
  }

  if (/video is not available|not made this video available in your country|not available in your country/i.test(collapsed)) {
    return "This video isn't available (removed, private, or blocked in your region). Try another.";
  }

  if (/No supported JavaScript runtime|--js-runtimes/i.test(collapsed)) {
    return 'The download server needs a JavaScript runtime for YouTube (yt-dlp). Try another track, or configure yt-dlp on the worker (see yt-dlp EJS wiki).';
  }

  if (/Sign in to confirm/i.test(collapsed)) {
    return 'YouTube blocked this download. The worker may need browser cookies configured.';
  }

  const errLine = raw.split('\n').find((line) => /^ERROR:\s/i.test(line.trim()));
  if (errLine) {
    const cleaned = errLine.replace(/^ERROR:\s*/i, '').trim();
    if (cleaned.length <= 140) {
      return cleaned;
    }
  }

  if (collapsed.length <= 160) {
    return collapsed;
  }
  return `${collapsed.slice(0, 157)}…`;
}

export function formatPlaybackErrorForUser(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeWorkerErrorMessage(error.message);
  }
  if (typeof error === 'string') {
    return sanitizeWorkerErrorMessage(error);
  }
  return 'Could not play this track.';
}

function buildTrackFromSerializedTrack(track: SerializedTrack | null | undefined): YoutubeAudioTrack | null {
  if (!track?.id) return null;
  const base = getMusicApiBaseUrl();
  const relativeStream = toText(track.streamUrl);
  const streamUrl =
    relativeStream && base
      ? `${base}${relativeStream.startsWith('/') ? '' : '/'}${relativeStream}`
      : relativeStream ||
        (base ? `${base}/api/tracks/${encodeURIComponent(track.id)}/stream` : '');

  if (!streamUrl) return null;

  const durationSec = toNumber(track.durationSeconds, toNumber(track.duration, 0));

  return {
    id: `yt:${toText(track.videoId, track.id)}`,
    title: toText(track.title, 'Unknown title'),
    artist: toText(track.artist, 'Unknown artist'),
    artwork: toText(track.artwork, YT_FALLBACK_IMAGE),
    duration: durationSec * 1000,
    url: streamUrl,
    source: 'youtube-audio',
    videoId: toText(track.videoId, track.id),
  };
}

/**
 * expo-audio often fails on our `/api/tracks/:id/stream` handler because it HTTP-redirects to R2.
 * Resolve the final signed HTTPS URL via `/api/tracks/:id/url` so the player gets a direct MP3 URL.
 */
async function resolveDirectR2PlaybackUrl(apiBase: string, playbackUrl: string): Promise<string> {
  const base = apiBase.replace(/\/+$/, '');
  let pathname: string;
  try {
    pathname = new URL(playbackUrl).pathname;
  } catch {
    return playbackUrl;
  }
  const match = pathname.match(/^\/api\/tracks\/([^/]+)\/stream$/);
  if (!match) {
    return playbackUrl;
  }
  const trackId = match[1];
  try {
    const res = await fetch(`${base}/api/tracks/${encodeURIComponent(trackId)}/url`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return playbackUrl;
    }
    const data = (await res.json()) as { url?: string };
    if (typeof data.url === 'string' && /^https?:\/\//i.test(data.url)) {
      return data.url;
    }
  } catch {
    // Fall back to stream redirect URL.
  }
  return playbackUrl;
}

async function enrichFilterRankYoutubeResults(
  tracks: YoutubeAudioTrack[],
  options: YoutubeSearchOptions,
): Promise<YoutubeSearchResult> {
  options.onPhase?.('details');
  const searchResultCount = tracks.length;
  if (tracks.length === 0) {
    return {
      tracks: [],
      meta: {
        searchResultCount: 0,
        afterDetailFilterCount: 0,
        droppedByBlocklist: 0,
        droppedByMinDuration: 0,
        droppedByMaxDuration: 0,
        droppedByCategory: 0,
        regionBlockedKept: 0,
      },
    };
  }

  let droppedByBlocklist = 0;
  let droppedByMinDuration = 0;
  let droppedByMaxDuration = 0;
  let droppedByCategory = 0;
  let regionBlockedKept = 0;

  const minDur =
    options.minDurationSeconds !== undefined ? options.minDurationSeconds : getDefaultMinDurationSeconds();
  const maxDur =
    options.maxDurationSeconds !== undefined ? options.maxDurationSeconds : getDefaultMaxDurationSeconds();

  const ids = tracks.map((t) => t.videoId);
  const detailsById = new Map<string, VideoDetailsItem>();

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await fetchYoutubeVideosApi(chunk);
    if (!res.ok) {
      if (__DEV__) {
        console.warn('[youtube] videos.list failed; returning search results without enrichment');
      }
      return {
        tracks,
        meta: {
          searchResultCount,
          afterDetailFilterCount: tracks.length,
          droppedByBlocklist: 0,
          droppedByMinDuration: 0,
          droppedByMaxDuration: 0,
          droppedByCategory: 0,
          regionBlockedKept: 0,
        },
      };
    }
    const data = (await res.json()) as { items?: VideoDetailsItem[] };
    for (const item of data.items ?? []) {
      if (item.id) {
        detailsById.set(item.id, item);
      }
    }
  }

  const region = getViewerRegionCode();
  const strict = isStrictMusicCategorySearch();
  const regionFilter = isRegionRestrictionFilterEnabled();

  type Row = {
    track: YoutubeAudioTrack;
    origIdx: number;
    score: number;
    viewCount: number;
    availability: 'ok' | 'region_blocked' | 'unknown';
  };

  const rows: Row[] = [];

  tracks.forEach((t, origIdx) => {
    const detail = detailsById.get(t.videoId);
    const title = t.title;
    const channelTitle = detail?.snippet?.channelTitle ?? t.artist;
    const channelId = detail?.snippet?.channelId ?? '';

    if (isBlocklisted(title, channelTitle, channelId)) {
      droppedByBlocklist += 1;
      return;
    }

    if (strict && detail?.snippet?.categoryId && detail.snippet.categoryId !== YOUTUBE_MUSIC_CATEGORY_ID) {
      droppedByCategory += 1;
      return;
    }

    const seconds = parseIso8601DurationToSeconds(detail?.contentDetails?.duration);
    const durMs = seconds > 0 ? seconds * 1000 : t.duration;
    const viewCount = toNumber(detail?.statistics?.viewCount, 0);

    let availability: 'ok' | 'region_blocked' | 'unknown' = 'unknown';
    if (detail?.contentDetails?.regionRestriction && regionFilter) {
      availability = isVideoBlockedInViewerRegion(detail.contentDetails.regionRestriction, region)
        ? 'region_blocked'
        : 'ok';
    } else if (detail) {
      availability = 'ok';
    }

    if ((minDur > 0 || maxDur > 0) && seconds <= 0) {
      droppedByMinDuration += 1;
      return;
    }

    if (minDur > 0 && seconds < minDur) {
      droppedByMinDuration += 1;
      return;
    }

    if (maxDur > 0 && seconds > maxDur) {
      droppedByMaxDuration += 1;
      return;
    }

    if (availability === 'region_blocked') {
      regionBlockedKept += 1;
    }

    const score = rankScore(title, channelTitle, channelId);
    const merged: YoutubeAudioTrack = {
      ...t,
      duration: durMs,
      availability,
    };
    rows.push({ track: merged, origIdx, score, viewCount, availability });
  });

  rows.sort((a, b) => {
    const aBlocked = a.availability === 'region_blocked' ? 1 : 0;
    const bBlocked = b.availability === 'region_blocked' ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
    if (b.score !== a.score) return b.score - a.score;
    return a.origIdx - b.origIdx;
  });

  return {
    tracks: rows.map((r) => r.track),
    meta: {
      searchResultCount,
      afterDetailFilterCount: rows.length,
      droppedByBlocklist,
      droppedByMinDuration,
      droppedByMaxDuration,
      droppedByCategory,
      regionBlockedKept,
    },
  };
}

export async function searchYoutubeTracks(
  query: string,
  options: YoutubeSearchOptions = {},
): Promise<YoutubeSearchResult> {
  const merged: YoutubeSearchOptions = { ...DEFAULT_YOUTUBE_SEARCH_OPTIONS, ...options };
  const cleaned = buildSearchQuery(query, merged);
  if (!cleaned) {
    return {
      tracks: [],
      meta: {
        searchResultCount: 0,
        afterDetailFilterCount: 0,
        droppedByBlocklist: 0,
        droppedByMinDuration: 0,
        droppedByMaxDuration: 0,
        droppedByCategory: 0,
        regionBlockedKept: 0,
      },
    };
  }

  if (!useYoutubeProxy() && !getYouTubeApiKey()) {
    return {
      tracks: [],
      meta: {
        searchResultCount: 0,
        afterDetailFilterCount: 0,
        droppedByBlocklist: 0,
        droppedByMinDuration: 0,
        droppedByMaxDuration: 0,
        droppedByCategory: 0,
        regionBlockedKept: 0,
      },
    };
  }

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: String(DEFAULT_YT_MAX_RESULTS),
    q: cleaned,
    regionCode: getViewerRegionCode(),
    relevanceLanguage: getRelevanceLanguageCode(),
    order: merged.order === 'viewCount' ? 'viewCount' : 'relevance',
  });

  if (isStrictMusicCategorySearch()) {
    params.set('videoCategoryId', YOUTUBE_MUSIC_CATEGORY_ID);
  }

  const bucket = merged.durationBucket ?? 'any';
  if (bucket !== 'any') {
    params.set('videoDuration', bucket);
  }

  merged.onPhase?.('search');
  const response = await fetchYoutubeSearchApi(params);
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const friendly =
      errText.includes('<!DOCTYPE') || errText.includes('<html')
        ? `Check EXPO_PUBLIC_YOUTUBE_AUDIO_API_BASE_URL (use the site root, e.g. https://your-app.up.railway.app — not …/api).`
        : errText.slice(0, 160);
    throw new Error(`YouTube search failed (${response.status}) ${friendly}`);
  }

  const payload = (await response.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: {
          high?: { url?: string };
          medium?: { url?: string };
          default?: { url?: string };
        };
      };
    }>;
  };

  const items = (payload.items ?? [])
    .map((item): YoutubeAudioTrack | null => {
      const videoId = toText(item.id?.videoId);
      if (!videoId) return null;
      const title = toText(item.snippet?.title, 'Unknown title');
      const artist = toText(item.snippet?.channelTitle, 'YouTube');
      const artwork =
        toText(item.snippet?.thumbnails?.high?.url) ||
        toText(item.snippet?.thumbnails?.medium?.url) ||
        toText(item.snippet?.thumbnails?.default?.url) ||
        YT_FALLBACK_IMAGE;

      return {
        id: `yt:${videoId}`,
        title,
        artist,
        artwork,
        duration: 0,
        url: '',
        source: 'youtube-audio' as const,
        videoId,
      };
    });

  const mapped = items.filter((track): track is YoutubeAudioTrack => track !== null);
  return enrichFilterRankYoutubeResults(mapped, merged);
}

async function postCreateJob(videoId: string): Promise<CreateJobResponse> {
  const baseUrl = getMusicApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Set EXPO_PUBLIC_YOUTUBE_AUDIO_API_BASE_URL in your VULU env.');
  }

  const response = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ videoId }),
  });

  let payload: CreateJobResponse = {};
  try {
    payload = (await response.json()) as CreateJobResponse;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(`Could not queue track (${response.status})`);
  }

  return payload;
}

async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const baseUrl = getMusicApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  let payload: JobStatusResponse = {};
  try {
    payload = (await response.json()) as JobStatusResponse;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(`Could not read job status (${response.status})`);
  }
  return payload;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resolveYoutubeTrackPlaybackUrl(input: Track): Promise<YoutubeAudioTrack> {
  const track = input as YoutubeAudioTrack;
  if (track.url?.trim()) return track;
  const videoId = toText(track.videoId) || toText(track.id).replace(/^yt:/, '');
  if (!videoId) {
    throw new Error('Missing video id for YouTube track.');
  }

  const createResponse = await postCreateJob(videoId);
  const createdJob = createResponse.job;
  const relativeImmediate =
    toText(createdJob?.streamUrl) || toText(createdJob?.track?.streamUrl);
  const base = getMusicApiBaseUrl();
  const immediateStream =
    relativeImmediate && base
      ? `${base}${relativeImmediate.startsWith('/') ? '' : '/'}${relativeImmediate}`
      : relativeImmediate;
  if (immediateStream) {
    const directUrl = await resolveDirectR2PlaybackUrl(base, immediateStream);
    return {
      ...track,
      url: directUrl,
    };
  }

  const jobId = toText(createdJob?.id);
  if (!jobId) {
    throw new Error('Queue job did not return a job id.');
  }

  const startedAt = Date.now();
  const pollTimeoutMs = getJobPollTimeoutMs();
  let lastSeenStatus = '';

  while (Date.now() - startedAt < pollTimeoutMs) {
    const statusResponse = await getJobStatus(jobId);
    const jobPayload = statusResponse.job;
    if (!jobPayload) {
      throw new Error('Could not read job status from the server.');
    }
    const status = toText(jobPayload?.status).toLowerCase();
    lastSeenStatus = status;

    if (status === 'completed') {
      const completedTrack = buildTrackFromSerializedTrack(jobPayload?.track);
      if (!completedTrack?.url) {
        throw new Error('Track completed but no playable URL was returned.');
      }
      const directUrl = await resolveDirectR2PlaybackUrl(base, completedTrack.url);
      return {
        ...track,
        ...completedTrack,
        url: directUrl,
      };
    }
    if (status === 'failed') {
      const raw = toText(jobPayload?.errorMessage, 'Track processing failed.');
      throw new Error(sanitizeWorkerErrorMessage(raw));
    }
    await sleep(getJobPollIntervalMs());
  }

  if (lastSeenStatus === 'queued' || lastSeenStatus === 'processing') {
    throw new Error(
      'Download is taking too long. If this keeps happening, deploy the Railway worker with WORKER_SHARED_SECRET and RAILWAY_API_BASE_URL set to this API, or check worker logs. You can raise EXPO_PUBLIC_YOUTUBE_JOB_TIMEOUT_MS (default 300000).',
    );
  }

  throw new Error('Track processing timed out. Please try again.');
}
