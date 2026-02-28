export const colors = {
  // Background & Surfaces (The "Inky Abyss")
  background: '#09090B', // Pitch Black
  surface: '#111113', // Very Dark Gray
  surfaceAlt: '#1A1A1E',
  borderSubtle: '#27272A',

  // Text & Content
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  textOnLight: '#000000',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: 'rgba(255, 255, 255, 0.7)',
  textOnDarkStrong: 'rgba(255, 255, 255, 0.9)',
  textOnDarkFaint: 'rgba(255, 255, 255, 0.3)',
  textOnDarkDim: 'rgba(255, 255, 255, 0.2)',

  // Accents
  accentPrimary: '#00E676', // SpacetimeDB Neon Green
  accentPrimarySoft: '#00B359',
  accentPayPal: '#003087', // PayPal Blue
  accentPremium: '#BE38F3', // Gemstone Purple
  accentPremiumSoft: '#9A2ABF', // Added for pressed state
  accentCash: '#19FA98', // Cash Green (formerly Gold)
  accentCashText: '#1A1A1A',
  accentCashSubtle: 'rgba(25, 250, 152, 0.1)',
  accentPrimarySubtle: 'rgba(0, 230, 118, 0.1)',
  accentRankGold: '#F2D24A',
  accentRankSilver: '#C0C0C0',
  accentRankBronze: '#CD7F32',
  accentSuccess: '#00E676', // Adjusted to Neon Green
  accentWarning: '#FFD700', // Yellow Dust (kept for warnings/stars)
  accentDanger: '#FF4458', // Urgent Red for Live

  // UI Specific
  badgeNotificationBg: '#FF4458', // Using danger color for notifications
  badgeNotificationText: '#FFFFFF',
  inputBackground: '#111113',
  inputBorder: '#27272A',
  inputPlaceholder: '#71717A', // Using textMuted
  // Overlays
  overlayDark: 'rgba(0, 0, 0, 0.44)',
  overlayDarkMedium: 'rgba(0, 0, 0, 0.52)',
  overlayDarkStrong: 'rgba(0, 0, 0, 0.6)',
  overlayDarkSubtle: 'rgba(0, 0, 0, 0.3)',
  overlayDarkHeavy: 'rgba(0, 0, 0, 0.85)',
  overlayDarkSolid: 'rgba(0, 0, 0, 0.9)',
  overlayLight: 'rgba(255, 255, 255, 0.28)',
  overlayRankGoldSubtle: 'rgba(242, 210, 74, 0.15)',
  overlayRankGoldFaint: 'rgba(242, 210, 74, 0.05)',
  overlayAccentPremiumSubtle: 'rgba(190, 56, 243, 0.2)',
  overlayAccentPrimarySubtle: 'rgba(123, 97, 255, 0.15)',
  overlayAccentSuccessSubtle: 'rgba(25, 250, 152, 0.2)',
  overlayAccentDangerSubtle: 'rgba(242, 63, 67, 0.2)',
  borderAccentPremiumSubtle: 'rgba(190, 56, 243, 0.3)',
  borderRankGoldSubtle: 'rgba(242, 210, 74, 0.3)',
  // Play / Casino
  playNeonGreen: '#CCFF00',
  playNeonGreenSubtle: 'rgba(204, 255, 0, 0.2)',
  playNeonPink: '#FF00CC',
  playSurfaceBlack: '#000000',
  playSurfaceDeepest: '#0A0A0A',
  playSurfaceDeep: '#0F0F0F',
  playSurfaceRaised: '#1A1A1A',
  playSurfaceMid: '#222222',
  playSurfaceHighlight: '#444444',
  playSurfaceShadow: '#111111',
  playSurfaceDisabled: '#444444',
  playCardBorder: '#333333',
  playGameCardMinesStart: '#007AFF',
  playGameCardMinesEnd: '#00C6FF',
  playGameCardDiceStart: '#A020F0',
  playGameCardDiceEnd: '#E056FD',
  playGameCardPlinkoEnd: '#FF3366',
  playGameCardHiloStart: '#00B09B',
  playGameCardHiloEnd: '#96C93D',
  playGameCardDragonStart: '#F2994A',
  playGameCardDragonEnd: '#F2C94C',
  divider: '#27272A',
} as const;

export type ColorToken = keyof typeof colors;
