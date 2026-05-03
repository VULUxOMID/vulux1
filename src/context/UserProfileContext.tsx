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

import { useAuth as useSessionAuth } from '../auth/clerkSession';
import {
  fetchAccountState as fetchBackendAccountState,
  upsertAccountState as upsertBackendAccountState,
} from '../data/adapters/backend/accountState';
import { UserRole } from '../features/liveroom/types';
import { railwayDb, subscribeRailwayDataChanges } from '../lib/railwayRuntime';
import { deriveAgeFromBirthDate, formatBirthDate, parseBirthDate } from '../utils/birthDate';
import { useAuth as useAppAuth } from './AuthContext';

export type PresenceStatus = 'online' | 'busy' | 'offline';
export type UserProfileGender = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say';

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
  birthDate: string;
  genderIdentity?: UserProfileGender;
  country: string;
  bio: string;
  avatarUrl: string;
  photos: UserProfilePhoto[];
  verificationPhotoUri?: string;
  roles?: UserRole[];
  isFriend?: boolean;
  presenceStatus: PresenceStatus;
  statusMessage?: string;
}

interface UserProfileContextType {
  isProfileReady: boolean;
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
  birthDate: '',
  genderIdentity: undefined,
  country: '',
  bio: '',
  avatarUrl: '',
  photos: defaultPhotos,
  verificationPhotoUri: '',
  roles: [],
  isFriend: false,
  presenceStatus: 'offline',
};
const PROFILE_PERSIST_RETRY_MS = 2_000;
const PROFILE_READY_FALLBACK_MS = 2_250;
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

function normalizeGenderIdentity(value: unknown): UserProfileGender | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'male' ||
    normalized === 'female' ||
    normalized === 'non_binary' ||
    normalized === 'prefer_not_to_say'
  ) {
    return normalized;
  }

  if (normalized === 'non-binary') {
    return 'non_binary';
  }

  if (normalized === 'prefer-not-to-say') {
    return 'prefer_not_to_say';
  }

  return undefined;
}

function hasMeaningfulProfileData(profile: UserProfile): boolean {
  return Boolean(
    profile.name.trim() ||
    profile.username.trim() ||
    profile.avatarUrl.trim() ||
    profile.photos.length > 0 ||
    (profile.statusMessage?.trim() ?? '').length > 0 ||
    profile.presenceStatus !== 'offline',
  );
}

export function createResolvedUserProfile(resolvedUserId: string): UserProfile {
  return {
    ...defaultProfile,
    id: resolvedUserId,
  };
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
      birthDate: profile.birthDate,
      genderIdentity: profile.genderIdentity ?? '',
      country: profile.country,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      photos: profile.photos,
      verificationPhotoUri: profile.verificationPhotoUri ?? '',
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
    const birthDate =
      (() => {
        const parsed =
          parseBirthDate(asString(source.birthDate)) ??
          parseBirthDate(asString(source.dateOfBirth)) ??
          parseBirthDate(asString(source.birthday));
        return parsed ? formatBirthDate(parsed) : '';
      })();
    const derivedAge = deriveAgeFromBirthDate(birthDate);

    const profile: Partial<UserProfile> = {
      name: asString(source.name) ?? '',
      username: asString(source.username) ?? '',
      age:
        derivedAge ??
        (typeof source.age === 'number' && Number.isFinite(source.age)
          ? source.age
          : 0),
      birthDate,
      genderIdentity:
        normalizeGenderIdentity(source.genderIdentity) ?? normalizeGenderIdentity(source.gender),
      country: asString(source.country) ?? '',
      bio: asString(source.bio) ?? '',
      avatarUrl: asString(source.avatarUrl) ?? photos[0]?.uri ?? '',
      photos,
      verificationPhotoUri: asString(source.verificationPhotoUri) ?? '',
      presenceStatus: presenceStatus ?? 'offline',
      statusMessage: asString(source.statusMessage) ?? '',
    };

    return { profile, updatedAtMs };
  } catch {
    return null;
  }
}

export function extractProfileFromStateRecord(
  state: Record<string, unknown> | null | undefined,
): AccountStateProfileSnapshot | null {
  if (!isRecord(state)) {
    return null;
  }

  const profileSource = isRecord(state.profile) ? state.profile : null;
  if (!profileSource) {
    return null;
  }

  const photos = normalizePhotos(profileSource.photos);
  const profilePatch: Partial<UserProfile> = {};
  const birthDate =
    (() => {
      const parsed =
        parseBirthDate(asString(profileSource.birthDate)) ??
        parseBirthDate(asString(profileSource.dateOfBirth)) ??
        parseBirthDate(asString(profileSource.birthday));
      return parsed ? formatBirthDate(parsed) : '';
    })();
  const derivedAge = deriveAgeFromBirthDate(birthDate);

  const name = asString(profileSource.displayName) ?? asString(profileSource.name);
  if (name !== null) {
    profilePatch.name = name;
  }

  const username = asString(profileSource.username);
  if (username !== null) {
    profilePatch.username = username;
  }

  if (birthDate) {
    profilePatch.birthDate = birthDate;
  }

  if (derivedAge !== null) {
    profilePatch.age = derivedAge;
  } else if (typeof profileSource.age === 'number' && Number.isFinite(profileSource.age)) {
    profilePatch.age = profileSource.age;
  }

  const genderIdentity =
    normalizeGenderIdentity(profileSource.genderIdentity) ?? normalizeGenderIdentity(profileSource.gender);
  if (genderIdentity !== undefined) {
    profilePatch.genderIdentity = genderIdentity;
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
  if ('photos' in profileSource) {
    profilePatch.photos = photos;
  }

  const verificationPhotoUri = asString(profileSource.verificationPhotoUri);
  if (verificationPhotoUri !== null) {
    profilePatch.verificationPhotoUri = verificationPhotoUri;
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
  const dbView = railwayDb.db as any;
  const rows: any[] = Array.from(dbView?.myProfile?.iter?.() ?? dbView?.my_profile?.iter?.() ?? []);
  const row = rows[0];
  if (!row) {
    return null;
  }

  const profile = parseJsonRecord(row.profile);
  const profileUpdatedAtMs =
    readTimestampMs(profile.updatedAt) ??
    readTimestampMs(row.updatedAt) ??
    0;
  const userId = asString(row.userId ?? row.user_id) ?? asString(profile.userId) ?? undefined;
  const socialRow = userId ? dbView?.socialUserItem?.userId?.find?.(userId) : null;
  const social = parseJsonRecord(socialRow?.item);
  const profilePhotos = normalizePhotos(profile.photos);
  const photos = profilePhotos.length > 0 ? profilePhotos : [];
  const birthDate =
    (() => {
      const parsed =
        parseBirthDate(asString(profile.birthDate)) ??
        parseBirthDate(asString(profile.dateOfBirth)) ??
        parseBirthDate(asString(profile.birthday));
      return parsed ? formatBirthDate(parsed) : '';
    })();
  const derivedAge = deriveAgeFromBirthDate(birthDate);
  const avatarUrl =
    asString(profile.avatarUrl) ??
    photos[0]?.uri ??
    '';
  const presenceStatus =
    normalizePresenceStatus(profile.presenceStatus) ??
    normalizePresenceStatus(social.status) ??
    normalizePresenceStatus(social.presenceStatus) ??
    normalizePresenceStatus(social.accountStatus) ??
    'online';

  return {
    id: userId,
    name:
      asString(profile.displayName) ??
      asString(profile.name) ??
      '',
    username:
      asString(profile.username) ??
      '',
    age:
      derivedAge ??
      (typeof profile.age === 'number' && Number.isFinite(profile.age)
        ? profile.age
        : 0),
    birthDate,
    genderIdentity:
      normalizeGenderIdentity(profile.genderIdentity) ?? normalizeGenderIdentity(profile.gender),
    country:
      asString(profile.country) ??
      '',
    bio:
      asString(profile.bio) ??
      '',
    avatarUrl,
    photos,
    verificationPhotoUri:
      asString(profile.verificationPhotoUri) ??
      '',
    presenceStatus,
    statusMessage:
      asString(profile.statusMessage) ??
      asString(profile.statusText) ??
      asString(social.statusMessage) ??
      asString(social.statusText) ??
      '',
    __updatedAtMs: profileUpdatedAtMs,
  };
}

export function mergeUserProfile(prev: UserProfile, updates: Partial<UserProfile>): UserProfile {
  const next = { ...prev, ...updates };
  if ('birthDate' in updates) {
    const parsedBirthDate = parseBirthDate(updates.birthDate);
    next.birthDate = parsedBirthDate ? formatBirthDate(parsedBirthDate) : '';
  }

  const derivedAge = deriveAgeFromBirthDate(next.birthDate);
  if (derivedAge !== null) {
    next.age = derivedAge;
  }

  if (updates.photos) {
    if (updates.photos.length === 0) {
      next.avatarUrl =
        typeof updates.avatarUrl === 'string' && updates.avatarUrl.trim().length > 0
          ? updates.avatarUrl.trim()
          : '';
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
  const {
    getToken,
    isLoaded: isAuthLoaded,
    isSignedIn,
    userId: sessionUserId,
  } = useSessionAuth();
  const resolvedUserId = sessionUserId ?? user?.uid ?? defaultProfile.id;
  const localMutationVersionRef = useRef(0);
  const latestProfileVersionMsRef = useRef(0);
  const pendingPersistRef = useRef<{ userId: string; profileJson: string } | null>(null);
  const persistInFlightRef = useRef(false);
  const persistRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushPendingPersistRef = useRef<() => void>(() => { });
  const getTokenRef = useRef(getToken);
  const userProfileRef = useRef<UserProfile>({
    ...defaultProfile,
    id: resolvedUserId,
  });
  const lastResolvedUserIdRef = useRef(resolvedUserId);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => ({
    ...defaultProfile,
    id: resolvedUserId,
  }));
  const [isProfileReady, setIsProfileReady] = useState(() => !isSignedIn || resolvedUserId === defaultProfile.id);

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

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

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
        const parsedProfile = parseJsonRecord(pending.profileJson);
        const wroteToBackend = await upsertBackendAccountState(
          null,
          getTokenRef.current,
          {
            profile: {
              ...parsedProfile,
              updatedAt: Date.now(),
            },
          },
          pending.userId,
        );

        if (!wroteToBackend) {
          throw new Error('Profile write did not reach authoritative Railway storage.');
        }

        if (
          pendingPersistRef.current?.userId === pending.userId &&
          pendingPersistRef.current?.profileJson === pending.profileJson
        ) {
          pendingPersistRef.current = null;
        }
      } catch (error) {
        warnProfileDiagnosticThrottled('persist_profile_via_railway_failed', {
          error: describeError(error),
        });
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

  useEffect(() => {
    if (lastResolvedUserIdRef.current === resolvedUserId) {
      return;
    }

    clearPersistRetryTimer();
    pendingPersistRef.current = null;
    lastResolvedUserIdRef.current = resolvedUserId;
  }, [clearPersistRetryTimer, resolvedUserId]);

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
        age: deriveAgeFromBirthDate(profile.birthDate) ?? profile.age,
        birthDate: profile.birthDate,
        genderIdentity: profile.genderIdentity ?? '',
        country: profile.country,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        photos: profile.photos,
        verificationPhotoUri: profile.verificationPhotoUri ?? '',
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
    setUserProfile(() => {
      const next = createResolvedUserProfile(resolvedUserId);
      userProfileRef.current = next;
      return next;
    });
  }, [resolvedUserId]);

  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn || !resolvedUserId || resolvedUserId === defaultProfile.id) {
      setIsProfileReady(true);
      return;
    }

    setIsProfileReady(false);
  }, [isAuthLoaded, isSignedIn, resolvedUserId]);

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
    let cancelled = false;
    const readyFallbackTimer = setTimeout(() => {
      if (!cancelled) {
        setIsProfileReady(true);
      }
    }, PROFILE_READY_FALLBACK_MS);

    const syncFromAuthoritativeProfile = async () => {
      const hydrateStartMutationVersion = localMutationVersionRef.current;
      let nextProfile: HydratedProfilePatch | null = null;

      if (isAuthLoaded && isSignedIn && resolvedUserId && resolvedUserId !== defaultProfile.id) {
        try {
          const backendState = await fetchBackendAccountState(
            null,
            getTokenRef.current,
            resolvedUserId,
          );
          if (!cancelled) {
            const backendSnapshot = extractProfileFromStateRecord(backendState);
            if (backendSnapshot) {
              nextProfile = {
                ...backendSnapshot.profile,
                __updatedAtMs: backendSnapshot.updatedAtMs,
              };
            }
          }
        } catch (error) {
          if (__DEV__) {
            console.warn('[profile][diag] backend_profile_hydration_failed', {
              error: describeError(error),
            });
          }
        }
      }

      if (!nextProfile) {
        nextProfile = readCurrentProfileRow();
      }

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
      if (!cancelled) {
        setIsProfileReady(true);
      }
    };

    void syncFromAuthoritativeProfile();
    const warmupTimers = [350, 1_000, 2_000].map((delayMs) =>
      setTimeout(() => {
        void syncFromAuthoritativeProfile();
      }, delayMs),
    );

    const unsubscribe = subscribeRailwayDataChanges((event) => {
      if (
        event.scopes.includes('profile') ||
        event.scopes.includes('social') ||
        event.scopes.includes('wallet') ||
        event.scopes.includes('identity')
      ) {
        void syncFromAuthoritativeProfile();
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(readyFallbackTimer);
      warmupTimers.forEach((timer) => clearTimeout(timer));
      unsubscribe();
    };
  }, [isAuthLoaded, isSignedIn, persistProfileLocally, resolvedUserId]);

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
    <UserProfileContext.Provider value={{ isProfileReady, userProfile, updateUserProfile, updateAvatar }}>
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
