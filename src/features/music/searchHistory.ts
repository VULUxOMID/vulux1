import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_SEARCHES_KEY = '@vulu_music_recent_youtube_searches';
const RECENT_PLAYS_KEY = '@vulu_music_recent_youtube_plays';
const MAX_RECENT_SEARCHES = 15;
const MAX_RECENT_PLAYS = 15;

export type RecentYoutubePlay = {
  videoId: string;
  title: string;
  artist: string;
  playedAt: number;
};

export async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  } catch {
    return [];
  }
}

export async function addRecentSearch(query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  try {
    const prev = await loadRecentSearches();
    const next = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export async function loadRecentPlays(): Promise<RecentYoutubePlay[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_PLAYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): RecentYoutubePlay | null => {
        if (!row || typeof row !== 'object') return null;
        const o = row as Record<string, unknown>;
        const videoId = typeof o.videoId === 'string' ? o.videoId : '';
        const title = typeof o.title === 'string' ? o.title : '';
        const artist = typeof o.artist === 'string' ? o.artist : '';
        const playedAt = typeof o.playedAt === 'number' ? o.playedAt : 0;
        if (!videoId || !title) return null;
        return { videoId, title, artist, playedAt };
      })
      .filter((x): x is RecentYoutubePlay => x !== null);
  } catch {
    return [];
  }
}

export async function recordRecentYoutubePlay(entry: Omit<RecentYoutubePlay, 'playedAt'>): Promise<void> {
  const videoId = entry.videoId.trim();
  if (!videoId) return;
  try {
    const prev = await loadRecentPlays();
    const playedAt = Date.now();
    const rest = prev.filter((p) => p.videoId !== videoId);
    const next = [{ ...entry, videoId, playedAt }, ...rest].slice(0, MAX_RECENT_PLAYS);
    await AsyncStorage.setItem(RECENT_PLAYS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
