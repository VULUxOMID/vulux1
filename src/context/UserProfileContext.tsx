import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { UserRole } from '../features/liveroom/types';
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

function readCurrentProfileRow(): Partial<UserProfile> | null {
  const dbView = spacetimeDb.db as any;
  const rows: any[] = Array.from(dbView?.myProfile?.iter?.() ?? dbView?.my_profile?.iter?.() ?? []);
  const row = rows[0];
  if (!row) {
    return null;
  }

  const profile = parseJsonRecord(row.profile);
  const photos = normalizePhotos(profile.photos);
  const avatarUrl = asString(profile.avatarUrl) ?? photos[0]?.uri ?? '';

  return {
    id: asString(row.userId ?? row.user_id) ?? asString(profile.userId) ?? undefined,
    name: asString(profile.displayName) ?? asString(profile.name) ?? '',
    username: asString(profile.username) ?? '',
    age: typeof profile.age === 'number' && Number.isFinite(profile.age) ? profile.age : 0,
    country: asString(profile.country) ?? '',
    bio: asString(profile.bio) ?? '',
    avatarUrl,
    photos,
    presenceStatus:
      profile.presenceStatus === 'busy' || profile.presenceStatus === 'offline'
        ? profile.presenceStatus
        : 'online',
    statusMessage: asString(profile.statusMessage) ?? asString(profile.statusText) ?? '',
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
  const resolvedUserId = user?.uid ?? defaultProfile.id;
  const localMutationVersionRef = useRef(0);
  const userProfileRef = useRef<UserProfile>({
    ...defaultProfile,
    id: resolvedUserId,
  });
  const [userProfile, setUserProfile] = useState<UserProfile>(() => ({
    ...defaultProfile,
    id: resolvedUserId,
  }));

  const persistProfileUpdates = useCallback(
    (userId: string, updates: Partial<UserProfile>) => {
      void (async () => {
        const currentProfile = userProfileRef.current;
        const nextProfile = mergeUserProfile(currentProfile, updates);
        let persisted = false;

        try {
          const reducers = spacetimeDb.reducers as any;
          if (typeof reducers?.createUserProfile !== 'function') {
            throw new Error('SpacetimeDB reducers are unavailable.');
          }

          await reducers.createUserProfile({
            userId,
            profile: JSON.stringify({
              userId,
              username: nextProfile.username,
              displayName: nextProfile.name,
              name: nextProfile.name,
              age: nextProfile.age,
              country: nextProfile.country,
              bio: nextProfile.bio,
              avatarUrl: nextProfile.avatarUrl,
              photos: nextProfile.photos,
              presenceStatus: nextProfile.presenceStatus,
              statusMessage: nextProfile.statusMessage ?? '',
            }),
          });
          persisted = true;
        } catch (error) {
          if (__DEV__) {
            console.warn('[profile] Failed to persist profile via SpacetimeDB', error);
          }
        }

        if (__DEV__ && !persisted) {
          console.warn('[profile] Profile changes were not persisted to a durable backend.');
        }
      })();
    },
    [],
  );

  useEffect(() => {
    setUserProfile((prev) => {
      const next = mergeUserProfile(prev, { id: resolvedUserId });
      userProfileRef.current = next;
      return next;
    });
  }, [resolvedUserId]);

  useEffect(() => {
    const syncFromSpacetime = () => {
      const hydrateStartMutationVersion = localMutationVersionRef.current;
      const nextProfile = readCurrentProfileRow();
      if (!nextProfile) {
        return;
      }
      if (localMutationVersionRef.current !== hydrateStartMutationVersion) {
        return;
      }
      setUserProfile((prev) => {
        const merged = mergeUserProfile(prev, nextProfile);
        userProfileRef.current = merged;
        return merged;
      });
    };

    syncFromSpacetime();

    return subscribeSpacetimeDataChanges((event) => {
      if (event.scopes.includes('profile') || event.scopes.includes('social')) {
        syncFromSpacetime();
      }
    });
  }, [resolvedUserId]);

  const updateUserProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      localMutationVersionRef.current += 1;
      setUserProfile((prev) => {
        const next = mergeUserProfile(prev, updates);
        userProfileRef.current = next;
        return next;
      });
      persistProfileUpdates(resolvedUserId, updates);
    },
    [persistProfileUpdates, resolvedUserId],
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
          persistProfileUpdates(updated.id, {
            avatarUrl: updated.avatarUrl,
            photos: updated.photos,
          });
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
        persistProfileUpdates(updated.id, {
          avatarUrl: updated.avatarUrl,
          photos: updated.photos,
        });
        return updated;
      });
    },
    [persistProfileUpdates],
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
