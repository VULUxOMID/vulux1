import { colors } from './colors';

export const spacing = {
  xxs: 2,
  xsMinus: 3,
  xs: 4,
  xsPlus: 5,
  smMinus: 6,
  sm: 8,
  smPlus: 10,
  md: 12,
  mdPlus: 14,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  screenBottom: 100,
} as const;

export const radius = {
  xs: 4,
  smMinus: 6,
  sm: 8,
  md: 12,
  lgMinus: 16,
  lg: 20,
  xl: 30,
  full: 9999,
} as const;

// ── Core variants (12) ─────────────────────────────────────────────
const core = {
  h1:        { fontSize: 30, fontWeight: '700' as const },
  h2:        { fontSize: 24, fontWeight: '700' as const },
  h3:        { fontSize: 20, fontWeight: '600' as const },
  bodyLarge: { fontSize: 18, fontWeight: '600' as const },
  body:      { fontSize: 16, fontWeight: '500' as const },
  bodyBold:  { fontSize: 16, fontWeight: '700' as const },
  label:     { fontSize: 15, fontWeight: '700' as const },
  small:     { fontSize: 14, fontWeight: '400' as const },
  smallBold: { fontSize: 14, fontWeight: '700' as const },
  tiny:      { fontSize: 12, fontWeight: '400' as const },
  tinyBold:  { fontSize: 12, fontWeight: '700' as const },
  micro:     { fontSize: 10, fontWeight: '700' as const },
} as const;

// ── Deprecated aliases (old names → core) ──────────────────────────
// These will be removed in a future version. Migrate to core names.
const deprecated = {
  displayBlack:         core.h1,
  title:                core.h1,
  titleHeavy:           core.h1,
  h2Black:              core.h1,
  subtitle:             core.h3,
  subtitleStrong:       core.h3,
  bodySemiStrong:       core.bodyBold,
  bodyStrong:           core.bodyBold,
  bodyHeavy:            core.bodyBold,
  bodyBlack:            core.bodyBold,
  bodyLargeStrong:      core.bodyLarge,
  bodyLargeHeavy:       core.bodyLarge,
  bodyLargeBlack:       core.bodyLarge,
  input:                core.small,
  smallMedium:          core.small,
  smallRelaxed:         core.small,
  smallStrong:          core.smallBold,
  smallHeavy:           core.smallBold,
  smallBlack:           core.smallBold,
  caption:              core.small,
  captionStrong:        core.small,
  captionHeavy:         core.smallBold,
  captionCompact:       core.tinyBold,
  captionCompactStrong: core.tinyBold,
  tinySemiStrong:       core.tinyBold,
  tinyStrong:           core.tinyBold,
  tinyBlack:            core.tinyBold,
  microStrong:          core.micro,
  nano:                 core.micro,
  picoBlack:            core.micro,
} as const;

export const typography = { ...core, ...deprecated } as const;

export type TypographyVariant = keyof typeof typography;

export { colors };
