import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { LiveUser } from '../features/liveroom/types';

interface ProfileContextType {
  selectedUser: LiveUser | null;
  showProfile: (user: LiveUser) => void;
  hideProfile: () => void;
  isPremiumUser: boolean;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

function isPremiumProfileViewsPreviewEnabled(): boolean {
  const value = process.env.EXPO_PUBLIC_QA_UNLOCK_PREMIUM_PROFILE_VIEWS?.trim().toLowerCase();
  return __DEV__ && (value === '1' || value === 'true' || value === 'yes' || value === 'on');
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [selectedUser, setSelectedUser] = useState<LiveUser | null>(null);
  const isPremiumUser = useMemo(() => isPremiumProfileViewsPreviewEnabled(), []);

  const showProfile = (user: LiveUser) => {
    setSelectedUser(user);
  };

  const hideProfile = () => {
    setSelectedUser(null);
  };

  return (
    <ProfileContext.Provider value={{ selectedUser, showProfile, hideProfile, isPremiumUser }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    if (__DEV__) {
      console.warn('useProfile must be used within a ProfileProvider. Using default values.');
    }
    // Return safe default values instead of throwing
    return {
      selectedUser: null,
      showProfile: () => {
        if (__DEV__) {
          console.warn('showProfile called outside ProfileProvider');
        }
      },
      hideProfile: () => {
        if (__DEV__) {
          console.warn('hideProfile called outside ProfileProvider');
        }
      },
      isPremiumUser: false,
    };
  }
  return context;
}
