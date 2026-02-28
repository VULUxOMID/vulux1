import type { ImageSourcePropType } from 'react-native';

export function normalizeImageUri(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function hasImageUri(value: string | null | undefined): value is string {
  return Boolean(normalizeImageUri(value));
}

export function toImageSource(value: string | null | undefined): ImageSourcePropType | undefined {
  const uri = normalizeImageUri(value);
  if (!uri) return undefined;
  return { uri };
}
