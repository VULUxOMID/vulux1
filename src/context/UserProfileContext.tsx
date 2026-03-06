import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { UserRole } from '../features/liveroom/types';
import { useUser as useSessionUser } from '../auth/spacetimeSession';
import { spacetimeDb, subscribeSpacetimeDataChanges } from '../lib/spacetime';
import { useAuth as useAppAuth } from './AuthContext';

export type PresenceStatus = 'online' | 'busy' | 'offline';

export type UserProfilePhoto = {
  id: string;
  uri: string;
  isVideo?: boolean;
  isVerified?: boolean;
};

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  age: number;
  country: string;
  bio: string;
  avatarUrl: string;
  photos: UserProfilePhoto[];
  roles?: UserRole[];
  isFriend?: boolean;
  presenceStatus: PresenceStatus;
  statusMessage?: string;
}

interface UserProfileContextType {
  userProfile: UserProfile;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  updateAvatar: (newAvatarUrl: string) => void;
}

const defaultPhotos: UserProfilePhoto[] = [];

const defaultProfile: UserProfile = {
  id: 'me',
  name: '',
  username: '',
  age: 0,
  country: '',
  bio: '',
  avatarUrl: '',
  photos: defaultPhotos,
  roles: [],
  isFriend: false,
  presenceStatus: 'offline',
};
const PROFILE_PERSIST_RETRY_MS = 2_000;
const PROFILE_LOCAL_CACHE_KEY_PREFIX = '@vulu.profile.snapshot:';
const PROFILE_DIAGNOSTIC_THROTTLE_MS = 15_000;
const profileDiagnosticLastLogAt: Record<string, number> = {};

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (!isRecord(value)) {
    return null;
  }

  const toMillis = value.toMillis;
  if (typeof toMillis === 'function') {
    try {
      const millis = toMillis();
      if (typeof millis === 'number' && Number.isFinite(millis)) {
        return millis;
      }
    } catch {
      // Ignore malformed timestamp accessors.
    }
  }

  const microsRaw =
    value.microsSinceUnixEpoch ??
    value.__timestamp_micros_since_unix_epoch__;

  if (typeof microsRaw === 'number' && Number.isFinite(microsRaw)) {
    return Math.floor(microsRaw / 1_000);
  }

  return null;
}

function normalizePresenceStatus(
  value: unknown,
): PresenceStatus | null {
  if (value === 'online' || value === 'busy' || value === 'offline') {
    return value;
  }
  if (value === 'live' || value === 'recent') {
    return value === 'live' ? 'online' : 'offline';
  }
  return null;
}

function hasMeaningfulProfileData(profile: UserProfile): boolean {
  return Boolean(
    profile.name.trim() ||
    profile.username.trim() ||
    profile.avatarUrl.trim() ||
    profile.photos.length > 0 ||
    (profile.statusMessage?.trim() ?? '').length > 0,
  );
}

function normalizePhotos(value: unknown): UserProfilePhoto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<UserProfilePhoto[]>((photos, entry, index) => {
    if (!isRecord(entry)) {
      return photos;
    }

    const uri = asString(entry.uri);
    if (!uri) {
      return photos;
    }

    const photo: UserProfilePhoto = {
      id: asString(entry.id) ?? `photo-${index}-${uri}`,
      uri,
    };

    if (entry.isVideo === true) {
      photo.isVideo = true;
    }

    if (entry.isVerified === true) {
      photo.isVerified = true;
    }

    photos.push(photo);
    return photos;
  }, []);
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown profile persistence error';
  }
}

// Logging policy: diagnostics stay dev-only, throttled, and without user identifiers.
function warnProfileDiagnosticThrottled(key: string, details?: Record<string, unknown>): void {
  if (!__DEV__) {
    return;
  }

  const now = Date.now();
  const lastLoggedAt = profileDiagnosticLastLogAt[key] ?? 0;
  if (now - lastLoggedAt < PROFILE_DIAGNOSTIC_THROTTLE_MS) {
    return;
  }
  profileDiagnosticLastLogAt[key] = now;

  console.warn(`[profile][diag] ${key}`, details);
}

type AccountStateProfileSnapshot = {
  profile: Partial<UserProfile>;
  updatedAtMs: number;
};

type HydratedProfilePatch = Partial<UserProfile> & {
  __updatedAtMs?: number;
};

function buildProfileLocalCacheKey(userId: string): string {
  return `${PROFILE_LOCAL_CACHE_KEY_PREFIX}${userId}`;
}

function toCachedProfilePayload(profile: UserProfile, updatedAtMs: number): string {
  return JSON.stringify({
    updatedAt: updatedAtMs,
    profile: {
      name: profile.name,
      username: profile.username,
      age: profile.age,
      country: profile.country,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      photos: profile.photos,
      presenceStatus: profile.presenceStatus,
      statusMessage: profile.statusMessage ?? '',
    },
  });
}

function parseCachedProfilePayload(raw: string | null): { profile: Partial<UserProfile>; updatedAtMs: number } | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    const updatedAtMs = readTimestampMs(parsed.updatedAt) ?? 0;
    const source = isRecord(parsed.profile) ? parsed.profile : {};
    const photos = normalizePhotos(source.photos);
    const presenceStatus = normalizePresenceStatus(source.presenceStatus);

    const profile: Partial<UserProfile> = {
      name: asString(source.name) ?? '',
      username: asString(source.username) ?? '',
      age:
        typeof source.age === 'number' && Number.isFinite(source.age)
          ? source.age
          : 0,
      country: asString(source.country) ?? '',
      bio: asString(source.bio) ?? '',
      avatarUrl: asString(source.avatarUrl) ?? photos[0]?.uri ?? '',
      photos,
      presenceStatus: presenceStatus ?? 'offline',
      statusMessage: asString(source.statusMessage) ?? '',
    };

    return { profile, updatedAtMs };
  } catch {
    return null;
  }
}

function extractProfileFromAccountState(dbView: any): AccountStateProfileSnapshot | null {
  const rows: any[] = Array.from(
    dbView?.myAccountState?.iter?.() ?? dbView?.my_account_state?.iter?.() ?? [],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  const state = parseJsonRecord(row.state);
  const profileSource = isRecord(state.profile) ? state.profile : null;
  if (!profileSource) {
    return null;
  }

  const photos = normalizePhotos(profileSource.photos);
  const profilePatch: Partial<UserProfile> = {};

  const name = asString(profileSource.displayName) ?? asString(profileSource.name);
  if (name !== null) {
    profilePatch.name = name;
  }

  const username = asString(profileSource.username);
  if (username !== null) {
    profilePatch.username = username;
  }

  if (typeof profileSource.age === 'number' && Number.isFinite(profileSource.age)) {
    profilePatch.age = profileSource.age;
  }

  const country = asString(profileSource.country);
  if (country !== null) {
    profilePatch.country = country;
  }

  const bio = asString(profileSource.bio);
  if (bio !== null) {
    profilePatch.bio = bio;
  }

  const avatarUrl = asString(profileSource.avatarUrl) ?? photos[0]?.uri ?? null;
  if (avatarUrl !== null) {
    profilePatch.avatarUrl = avatarUrl;
  }
  if (photos.length > 0) {
    profilePatch.photos = photos;
  }

  const presenceStatus =
    normalizePresenceStatus(profileSource.presenceStatus) ??
    normalizePresenceStatus(profileSource.status);
  if (presenceStatus !== null) {
    profilePatch.presenceStatus = presenceStatus;
  }

  const statusMessage =
    asString(profileSource.statusMessage) ??
    asString(profileSource.statusText);
  if (statusMessage !== null) {
    profilePatch.statusMessage = statusMessage;
  }

  return {
    profile: profilePatch,
    // Important: use only profile-level updatedAt. Account-state row updatedAt
    // changes for unrelated state writes (wallet/session), which can otherwise
    // make stale profile snapshots override fresher my_profile data.
    updatedAtMs: readTimestampMs(profileSource.updatedAt) ?? 0,
  };
}

function readCurrentProfileRow(): HydratedProfilePatch | null {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.myProfile?.iter?.() ?? dbView?.my_profile?.iter?.() ?? []);
  const row = rows[0];
  const accountStateSnapshot = extractProfileFromAccountState(dbView);
  const accountStateProfile = accountStateSnapshot?.profile;
  if (!row) {
    return accountStateProfile
      ? {
        ...accountStateProfile,
        __updatedAtMs: accountStateSnapshot?.updatedAtMs ?? 0,
      }
      : null;
  }

  const profile = parseJsonRecord(row.profile);
  const profileUpdatedAtMs =
    readTimestampMs(profile.updatedAt) ??
    readTimestampMs(row.updatedAt) ??
    0;
  const preferAccountStateProfile =
    Boolean(accountStateSnapshot) &&
    (accountStateSnapshot?.updatedAtMs ?? 0) > 0 &&
    (accountStateSnapshot?.updatedAtMs ?? -1) >= profileUpdatedAtMs;
  const latestProfilePatch = preferAccountStateProfile ? accountStateProfile ?? null : null;
  const staleProfilePatch = preferAccountStateProfile ? null : accountStateProfile ?? null;
  const userId = asString(row.userId ?? row.user_id) ?? asString(profile.userId) ?? undefined;
  const socialRow = userId ? dbView?.socialUserItem?.userId?.find?.(userId) : null;
  const social = parseJsonRecord(socialRow?.item);
  const profilePhotos = normalizePhotos(profile.photos);
  const latestPhotos = latestProfilePatch?.photos;
  const stalePhotos = staleProfilePatch?.photos;
  const photos =
    (latestPhotos?.length ?? 0) > 0
      ? latestPhotos ?? []
      : (profilePhotos.length > 0
        ? profilePhotos
        : stalePhotos ?? []);
  const avatarUrl =
    latestProfilePatch?.avatarUrl ??
    asString(profile.avatarUrl) ??
    photos[0]?.uri ??
    staleProfilePatch?.avatarUrl ??
    '';
  const presenceStatus =
    latestProfilePatch?.presenceStatus ??
    normalizePresenceStatus(profile.presenceStatus) ??
    normalizePresenceStatus(social.status) ??
    normalizePresenceStatus(social.presenceStatus) ??
    normalizePresenceStatus(social.accountStatus) ??
    staleProfilePatch?.presenceStatus ??
    'online';

  const mergedUpdatedAtMs = Math.max(
    profileUpdatedAtMs,
    accountStateSnapshot?.updatedAtMs ?? 0,
  );

  return {
    id: userId,
    name:
      latestProfilePatch?.name ??
      asString(profile.displayName) ??
      asString(profile.name) ??
      staleProfilePatch?.name ??
      '',
    username:
      latestProfilePatch?.username ??
      asString(profile.username) ??
      staleProfilePatch?.username ??
      '',
    age:
      latestProfilePatch?.age ??
      (typeof profile.age === 'number' && Number.isFinite(profile.age)
        ? profile.age
        : staleProfilePatch?.age ?? 0),
    country:
      latestProfilePatch?.country ??
      asString(profile.country) ??
      staleProfilePatch?.country ??
      '',
    bio:
      latestProfilePatch?.bio ??
      asString(profile.bio) ??
      staleProfilePatch?.bio ??
      '',
    avatarUrl,
    photos,
    presenceStatus,
    statusMessage:
      latestProfilePatch?.statusMessage ??
      asString(profile.statusMessage) ??
      asString(profile.statusText) ??
      asString(social.statusMessage) ??
      asString(social.statusText) ??
      staleProfilePatch?.statusMessage ??
      '',
    __updatedAtMs: mergedUpdatedAtMs,
  };
}

function mergeUserProfile(prev: UserProfile, updates: Partial<UserProfile>): UserProfile {
  const next = { ...prev, ...updates };

  if (updates.photos) {
    if (updates.photos.length === 0) {
      next.avatarUrl = '';
    } else {
      const requestedAvatar = updates.avatarUrl ?? next.avatarUrl;
      if (!requestedAvatar || !updates.photos.some((photo) => photo.uri === requestedAvatar)) {
        next.avatarUrl = updates.photos[0]?.uri ?? '';
      }
    }
  } else if (
    typeof updates.avatarUrl === 'string' &&
    next.photos.length > 0 &&
    !next.photos.some((photo) => photo.uri === updates.avatarUrl)
  ) {
    next.avatarUrl = next.photos[0]?.uri ?? '';
  }

  return next;
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAppAuth();
  const { user: sessionUser } = useSessionUser();
  const resolvedUserId = user?.uid ?? defaultProfile.id;
  const localMutationVersionRef = useRef(0);
  const latestProfileVersionMsRef = useRef(0);
  const pendingPersistRef = useRef<{ userId: string; profileJson: string } | null>(null);
  const persistInFlightRef = useRef(false);
  const persistRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushPendingPersistRef = useRef<() => void>(() => { });
  const userProfileRef = useRef<UserProfile>({
    ...defaultProfile,
    id: resolvedUserId,
  });
  const [userProfile, setUserProfile] = useState<UserProfile>(() => ({
    ...defaultProfile,
    id: resolvedUserId,
  }));

  const persistProfileLocally = useCallback((userId: string, profile: UserProfile, updatedAtMs: number) => {
    if (!userId || userId === defaultProfile.id) {
      return;
    }

    void AsyncStorage.setItem(
      buildProfileLocalCacheKey(userId),
      toCachedProfilePayload(profile, updatedAtMs),
    ).catch((error) => {
      void error;
      warnProfileDiagnosticThrottled('cache_profile_locally_failed');
    });
  }, []);

  const clearPersistRetryTimer = useCallback(() => {
    if (!persistRetryTimerRef.current) {
      return;
    }
    clearTimeout(persistRetryTimerRef.current);
    persistRetryTimerRef.current = null;
  }, []);

  const flushPendingPersist = useCallback(() => {
    const pending = pendingPersistRef.current;
    if (!pending || persistInFlightRef.current) {
      return;
    }

    persistInFlightRef.current = true;
    clearPersistRetryTimer();

    void (async () => {
      try {
        const reducers = spacetimeDb.reducers as any;
        const parsedProfile = parseJsonRecord(pending.profileJson);
        let persistedViaAnyReducer = false;
        const reducerErrors: string[] = [];

        if (typeof reducers?.createUserProfile === 'function') {
          try {
            await reducers.createUserProfile({
              userId: pending.userId,
              profile: pending.profileJson,
            });
            persistedViaAnyReducer = true;
          } catch (error) {
            reducerErrors.push(`createUserProfile: ${describeError(error)}`);
          }
        }

        if (typeof reducers?.upsertAccountState === 'function') {
          try {
            await reducers.upsertAccountState({
              userId: pending.userId,
              updates: JSON.stringify({
                profile: {
                  ...parsedProfile,
                  updatedAt: Date.now(),
                },
              }),
            });
            persistedViaAnyReducer = true;
          } catch (error) {
            reducerErrors.push(`upsertAccountState: ${describeError(error)}`);
          }
        }

        if (!persistedViaAnyReducer) {
          const fallbackMessage =
            reducerErrors.length > 0
              ? reducerErrors.join(' | ')
              : 'SpacetimeDB reducers are unavailable.';
          throw new Error(fallbackMessage);
        }
        if (reducerErrors.length > 0) {
          warnProfileDiagnosticThrottled('partial_profile_persistence_failure', {
            reducerErrorCount: reducerErrors.length,
          });
        }

        if (
          pendingPersistRef.current?.userId === pending.userId &&
          pendingPersistRef.current?.profileJson === pending.profileJson
        ) {
          pendingPersistRef.current = null;
        }
      } catch (error) {
        void error;
        warnProfileDiagnosticThrottled('persist_profile_via_spacetimedb_failed');
        if (!persistRetryTimerRef.current) {
          warnProfileDiagnosticThrottled('persist_profile_retry_scheduled');
          persistRetryTimerRef.current = setTimeout(() => {
            persistRetryTimerRef.current = null;
            flushPendingPersistRef.current();
          }, PROFILE_PERSIST_RETRY_MS);
        }
      } finally {
        const hasNewerPending =
          pendingPersistRef.current &&
          (pendingPersistRef.current.userId !== pending.userId ||
            pendingPersistRef.current.profileJson !== pending.profileJson);
        persistInFlightRef.current = false;
        if (hasNewerPending) {
          flushPendingPersistRef.current();
        }
      }
    })();
  }, [clearPersistRetryTimer]);

  useEffect(() => {
    flushPendingPersistRef.current = flushPendingPersist;
  }, [flushPendingPersist]);

  useEffect(() => () => {
    clearPersistRetryTimer();
    pendingPersistRef.current = null;
    persistInFlightRef.current = false;
  }, [clearPersistRetryTimer]);

  const queueProfilePersist = useCallback((userId: string, profile: UserProfile) => {
    if (!userId || userId === defaultProfile.id) {
      return;
    }

    const updatedAtMs = Date.now();
    latestProfileVersionMsRef.current = Math.max(latestProfileVersionMsRef.current, updatedAtMs);
    persistProfileLocally(userId, profile, updatedAtMs);

    pendingPersistRef.current = {
      userId,
      profileJson: JSON.stringify({
        userId,
        username: profile.username,
        displayName: profile.name,
        name: profile.name,
        age: profile.age,
        country: profile.country,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        photos: profile.photos,
        presenceStatus: profile.presenceStatus,
        statusMessage: profile.statusMessage ?? '',
        updatedAt: updatedAtMs,
      }),
    };

    flushPendingPersistRef.current();
  }, [persistProfileLocally]);

  const persistProfileSnapshot = useCallback(
    (userId: string, profile: UserProfile) => {
      queueProfilePersist(userId, profile);
    },
    [queueProfilePersist],
  );

  useEffect(() => {
    setUserProfile((prev) => {
      const next = mergeUserProfile(prev, { id: resolvedUserId });
      userProfileRef.current = next;
      return next;
    });
  }, [resolvedUserId]);

  useEffect(() => {
    if (!resolvedUserId || resolvedUserId === defaultProfile.id) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const cached = parseCachedProfilePayload(
        await AsyncStorage.getItem(buildProfileLocalCacheKey(resolvedUserId)),
      );
      if (!cached || cancelled) {
        return;
      }

      latestProfileVersionMsRef.current = Math.max(
        latestProfileVersionMsRef.current,
        cached.updatedAtMs,
      );
      setUserProfile((prev) => {
        const next = mergeUserProfile(prev, {
          ...cached.profile,
          id: resolvedUserId,
        });
        userProfileRef.current = next;
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedUserId]);

  useEffect(() => {
    if (!resolvedUserId || resolvedUserId === defaultProfile.id) {
      return;
    }

    const current = userProfileRef.current;
    if (!hasMeaningfulProfileData(current)) {
      return;
    }

    queueProfilePersist(resolvedUserId, {
      ...current,
      id: resolvedUserId,
    });
  }, [queueProfilePersist, resolvedUserId]);

  useEffect(() => {
    if (!resolvedUserId || resolvedUserId === defaultProfile.id) {
      return;
    }

    const sessionName = sessionUser?.fullName?.trim() ?? '';
    const sessionUsername = sessionUser?.username?.trim() ?? '';
    const sessionAvatarUrl = sessionUser?.imageUrl?.trim() ?? '';

    if (!sessionName && !sessionUsername && !sessionAvatarUrl) {
      return;
    }

    setUserProfile((prev) => {
      const updates: Partial<UserProfile> = { id: resolvedUserId };

      if (!prev.name.trim() && sessionName) {
        updates.name = sessionName;
      }
      if (!prev.username.trim() && sessionUsername) {
        updates.username = sessionUsername;
      }
      if (!prev.avatarUrl.trim() && sessionAvatarUrl) {
        updates.avatarUrl = sessionAvatarUrl;
      }

      if (Object.keys(updates).length === 1) {
        return prev;
      }

      localMutationVersionRef.current += 1;
      const next = mergeUserProfile(prev, updates);
      userProfileRef.current = next;
      persistProfileSnapshot(resolvedUserId, next);
      return next;
    });
  }, [
    persistProfileSnapshot,
    resolvedUserId,
    sessionUser?.fullName,
    sessionUser?.imageUrl,
    sessionUser?.username,
  ]);

  useEffect(() => {
    const syncFromSpacetime = () => {
      const hydrateStartMutationVersion = localMutationVersionRef.current;
      const nextProfile = readCurrentProfileRow();
      if (!nextProfile) {
        return;
      }
      const nextUpdatedAtMs = nextProfile.__updatedAtMs ?? 0;
      if (
        nextUpdatedAtMs > 0 &&
        latestProfileVersionMsRef.current > 0 &&
        nextUpdatedAtMs < latestProfileVersionMsRef.current
      ) {
        return;
      }
      if (localMutationVersionRef.current !== hydrateStartMutationVersion) {
        return;
      }
      const { __updatedAtMs: _ignoredUpdatedAt, ...profilePatch } = nextProfile;
      setUserProfile((prev) => {
        const merged = mergeUserProfile(prev, profilePatch);
        userProfileRef.current = merged;
        if (nextUpdatedAtMs > 0) {
          latestProfileVersionMsRef.current = Math.max(
            latestProfileVersionMsRef.current,
            nextUpdatedAtMs,
          );
          persistProfileLocally(resolvedUserId, merged, nextUpdatedAtMs);
        }
        return merged;
      });
    };

    syncFromSpacetime();
    const warmupTimers = [350, 1_000, 2_000].map((delayMs) =>
      setTimeout(syncFromSpacetime, delayMs),
    );

    const unsubscribe = subscribeSpacetimeDataChanges((event) => {
      if (
        event.scopes.includes('profile') ||
        event.scopes.includes('social') ||
        event.scopes.includes('wallet') ||
        event.scopes.includes('identity')
      ) {
        syncFromSpacetime();
      }
    });

    return () => {
      warmupTimers.forEach((timer) => clearTimeout(timer));
      unsubscribe();
    };
  }, [persistProfileLocally, resolvedUserId]);

  const updateUserProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      localMutationVersionRef.current += 1;
      setUserProfile((prev) => {
        const next = mergeUserProfile(prev, updates);
        userProfileRef.current = next;
        persistProfileSnapshot(resolvedUserId, next);
        return next;
      });
    },
    [persistProfileSnapshot, resolvedUserId],
  );

  const updateAvatar = useCallback(
    (newAvatarUrl: string) => {
      localMutationVersionRef.current += 1;
      setUserProfile((prev) => {
        const currentIndex = prev.photos.findIndex((photo) => photo.uri === newAvatarUrl);
        if (currentIndex < 0) {
          return prev;
        }

        if (currentIndex === 0) {
          const updated = { ...prev, avatarUrl: newAvatarUrl };
          userProfileRef.current = updated;
          persistProfileSnapshot(updated.id, updated);
          return updated;
        }

        const nextPhotos = [...prev.photos];
        const [selected] = nextPhotos.splice(currentIndex, 1);
        nextPhotos.unshift(selected);

        const updated = {
          ...prev,
          avatarUrl: newAvatarUrl,
          photos: nextPhotos,
        };
        userProfileRef.current = updated;
        persistProfileSnapshot(updated.id, updated);
        return updated;
      });
    },
    [persistProfileSnapshot],
  );

  return (
    <UserProfileContext.Provider value={{ userProfile, updateUserProfile, updateAvatar }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return context;
}
