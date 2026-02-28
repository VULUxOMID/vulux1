export const AD_WALL_DURATION = 10000; // 10 seconds
export const AD_WALL_REWARD = 10;
export const VIDEO_AD_DURATION = 2000; // 2 seconds
export const STREAK_STORAGE_KEY = '@vulu_watch_streak_opened';
export const STREAK_FIRST_OPEN_KEY = '@vulu_streak_first_box';

export const REWARDS = [
  { amount: 10, label: 'Starter' },
  { amount: 15, label: '1.5x' },
  { amount: 25, label: '2.5x' },
  { amount: 40, label: '4.0x' },
  { amount: 60, label: '6.0x' },
  { amount: 100, label: 'ULTRA' },
] as const;
