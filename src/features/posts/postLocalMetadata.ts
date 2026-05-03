import AsyncStorage from '@react-native-async-storage/async-storage';

type ReportedPostRecord = {
  postId: string;
  reason: string;
  details: string;
  reportedAt: number;
};

const SAVED_POSTS_STORAGE_KEY = '@vulu_posts_saved_post_ids';
const REPORTED_POSTS_STORAGE_KEY = '@vulu_posts_reported_posts';

let savedPostIdsCache: Set<string> | null = null;

function normalizeSavedIds(value: unknown): Set<string> {
  if (!Array.isArray(value)) {
    return new Set<string>();
  }

  return new Set(
    value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
  );
}

async function persistSavedPostIds(ids: Set<string>) {
  savedPostIdsCache = new Set(ids);
  await AsyncStorage.setItem(SAVED_POSTS_STORAGE_KEY, JSON.stringify([...ids]));
}

export async function loadSavedPostIds(): Promise<Set<string>> {
  if (savedPostIdsCache) {
    return new Set(savedPostIdsCache);
  }

  try {
    const raw = await AsyncStorage.getItem(SAVED_POSTS_STORAGE_KEY);
    if (!raw) {
      savedPostIdsCache = new Set<string>();
      return new Set<string>();
    }

    const parsed = JSON.parse(raw) as unknown;
    const next = normalizeSavedIds(parsed);
    savedPostIdsCache = next;
    return new Set(next);
  } catch {
    savedPostIdsCache = new Set<string>();
    return new Set<string>();
  }
}

export async function toggleSavedPostId(postId: string) {
  const current = await loadSavedPostIds();
  if (current.has(postId)) {
    current.delete(postId);
  } else {
    current.add(postId);
  }
  await persistSavedPostIds(current);
  return current.has(postId);
}

export function readCachedSavedPostIds() {
  return new Set(savedPostIdsCache ?? []);
}

export async function recordReportedPostStub(input: {
  postId: string;
  reason: string;
  details?: string;
}) {
  const nextRecord: ReportedPostRecord = {
    postId: input.postId,
    reason: input.reason.trim(),
    details: input.details?.trim() ?? '',
    reportedAt: Date.now(),
  };

  try {
    const raw = await AsyncStorage.getItem(REPORTED_POSTS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(parsed) ? (parsed as ReportedPostRecord[]) : [];
    list.push(nextRecord);
    await AsyncStorage.setItem(REPORTED_POSTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Reporting is a temporary local stub; failure should not break the post flow.
  }
}
