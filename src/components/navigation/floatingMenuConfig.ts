export type MenuKey =
  | 'music'
  | 'play'
  | 'clash-of-drone'
  | 'leaderboard'
  | 'shop'
  | 'videos'
  | 'admin'
  | 'admin-v2';

export type FloatingMenuItemConfig = {
  id: MenuKey;
  icon: string;
  label: string;
  accessibilityLabel: string;
  route: string;
  matchRoutes: string[];
};

export const MENU_ITEMS: FloatingMenuItemConfig[] = [
  {
    id: 'music',
    icon: 'musical-notes',
    label: 'Music',
    accessibilityLabel: 'Open Music',
    route: '/(tabs)/music',
    matchRoutes: ['/music'],
  },
  {
    id: 'videos',
    icon: 'videocam',
    label: 'Videos',
    accessibilityLabel: 'Open Videos',
    route: '/(tabs)/videos',
    matchRoutes: ['/videos'],
  },
  {
    id: 'play',
    icon: 'game-controller',
    label: 'Play',
    accessibilityLabel: 'Open Play',
    route: '/(tabs)/play',
    matchRoutes: ['/play'],
  },
  {
    id: 'clash-of-drone',
    icon: 'hardware-chip',
    label: 'Clash of Drone',
    accessibilityLabel: 'Open Clash of Drone',
    route: '/game/clash-of-drone',
    matchRoutes: ['/game/clash-of-drone'],
  },
  {
    id: 'leaderboard',
    icon: 'trophy',
    label: 'Leaderboard',
    accessibilityLabel: 'Open Leaderboard',
    route: '/(tabs)/leaderboard',
    matchRoutes: ['/leaderboard'],
  },
  {
    id: 'shop',
    icon: 'cart',
    label: 'Shop',
    accessibilityLabel: 'Open Shop',
    route: '/(tabs)/shop',
    matchRoutes: ['/shop'],
  },
];

export const ADMIN_MENU_ITEMS: FloatingMenuItemConfig[] = [
  {
    id: 'admin',
    icon: 'shield',
    label: 'Admin',
    accessibilityLabel: 'Open Admin',
    route: '/admin',
    matchRoutes: ['/admin'],
  },
  {
    id: 'admin-v2',
    icon: 'grid',
    label: 'Admin Ops',
    accessibilityLabel: 'Open Admin Ops',
    route: '/admin-v2',
    matchRoutes: ['/admin-v2'],
  },
];
