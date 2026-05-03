/**
 * Substrings matched case-insensitively against title + channel + channelId.
 * Tweak without redeploying the API proxy.
 */
export const YOUTUBE_ALLOWLIST_SUBSTRINGS: string[] = [
  'vevo',
  '- topic',
  ' topic',
  'official audio',
  'official music video',
];

/** Rows matching any of these are hidden from results (non-music / spam patterns). */
export const YOUTUBE_BLOCKLIST_SUBSTRINGS: string[] = [
  'reaction',
  'reacts',
  'gameplay',
  'minecraft',
  'fortnite',
  'podcast',
  'compilation',
  'hour loop',
  '10 hours',
];

function parseCommaList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Extra blocklist from EXPO_PUBLIC_YOUTUBE_BLOCKLIST (comma-separated). */
export function getExtraBlocklistFromEnv(): string[] {
  return parseCommaList(process.env.EXPO_PUBLIC_YOUTUBE_BLOCKLIST);
}

/** Extra allowlist boost from EXPO_PUBLIC_YOUTUBE_ALLOWLIST (comma-separated). */
export function getExtraAllowlistFromEnv(): string[] {
  return parseCommaList(process.env.EXPO_PUBLIC_YOUTUBE_ALLOWLIST);
}
