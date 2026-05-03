// Live Room Types - Yubo-style Live Streaming

export type UserRole = 'Music' | 'Withdrawal' | 'Image' | 'Creator';

export type LiveUser = {
  id: string;
  name: string;
  username: string;
  age: number;
  verified?: boolean;
  country: string;
  bio: string;
  avatarUrl: string;
  photos?: string[];
  roles?: UserRole[];
  // Media state
  isMuted?: boolean;
  cameraEnabled?: boolean;
  role?: 'host' | 'panel' | 'watcher';
  connectionState?: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed' | 'unknown';
  isSpeaking?: boolean;
  hasAudioTrack?: boolean;
  hasVideoTrack?: boolean;
  isLocal?: boolean;
  isConnectedToRtc?: boolean;
  isFriend?: boolean;
  isSelfPreview?: boolean;
  // Music listening state
  isListening?: boolean;
  currentTrack?: {
    title: string;
    artist: string;
    artwork: string;
  };
};

export type ChatMessage = {
  id: string;
  type: 'user' | 'system';
  user?: LiveUser;
  text: string;
  timestamp: number;
  // System message metadata
  systemType?: 'join' | 'leave' | 'invite' | 'boost' | 'kick' | 'ban';
  boostAmount?: number;
  invitedBy?: string;
};

export type LiveRoom = {
  id: string;
  title: string;
  inviteOnly: boolean;
  hostUser: LiveUser;
  streamers: LiveUser[];
  watchers: LiveUser[];
  chatMessages: ChatMessage[];
  boostRank: number | null;
  totalBoosts: number;
  bannedUserIds: string[];
  bannedUsers?: LiveUser[];
  createdAt: number;
};

export type LiveState = 'LIVE_FULL' | 'LIVE_MINIMIZED' | 'LIVE_CLOSED';

export type BoostMultiplier = 1 | 5 | 10 | 30;

export const BOOST_COSTS: Record<BoostMultiplier, number> = {
  1: 10,
  5: 45,
  10: 80,
  30: 200,
};

// Fuel System Types (Premium GemPlus)
export type FuelFillAmount = 30 | 60 | 120 | 300 | 600; // fuel units added

export const FUEL_COSTS: Record<FuelFillAmount, { gems: number; cash: number }> = {
  30: { gems: 12, cash: 120 },
  60: { gems: 20, cash: 200 },
  120: { gems: 35, cash: 350 },
  300: { gems: 80, cash: 800 },
  600: { gems: 150, cash: 1500 },
};

// Server-authoritative fuel has no enforced hard cap today; keep 600 as the
// baseline display capacity so legacy empty/low balances still render sanely.
export const MAX_FUEL_MINUTES = 600;
export const FUEL_DRAIN_RATE = 1; // 1 fuel unit per second while live

export function getFuelDisplayCapacity(currentFuel: number): number {
  const normalizedFuel = Math.max(0, Math.floor(currentFuel));
  if (normalizedFuel <= MAX_FUEL_MINUTES) {
    return MAX_FUEL_MINUTES;
  }

  return Math.ceil(normalizedFuel / 100) * 100;
}

// Profile Views Modal Types
export type ProfileViewer = {
  user: LiveUser;
  viewCount: number;
  lastViewedAt: Date;
};

export type ProfileViewData = {
  user: LiveUser;
  viewedAt: number;
  viewCount: number;
};

export type ProfileViewsModalProps = {
  visible: boolean;
  onClose: () => void;
  viewers?: LiveUser[];
  totalViews: number;
  profileViewData?: ProfileViewData[];
  isPremiumUser?: boolean;
  onUpgradePress?: () => void;
};
