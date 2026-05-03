const EXPO_FONT_STYLE_ELEMENT_ID = 'expo-generated-fonts';

function isFontMap(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readRequestedFontFamilies(fontFamilyOrFontMap: unknown): string[] {
  if (typeof fontFamilyOrFontMap === 'string') {
    const trimmed = fontFamilyOrFontMap.trim();
    return trimmed ? [trimmed] : [];
  }

  if (isFontMap(fontFamilyOrFontMap)) {
    return Object.keys(fontFamilyOrFontMap)
      .map((family) => family.trim())
      .filter(Boolean);
  }

  return [];
}

export function isFontTimeoutError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return message.toLowerCase().includes('timeout exceeded');
}

export function hasGeneratedFontRule(
  fontFamily: string,
  getStyleElement: () => unknown = () =>
    typeof document === 'undefined' ? null : document.getElementById(EXPO_FONT_STYLE_ELEMENT_ID),
): boolean {
  const styleElement = getStyleElement();
  if (!styleElement || typeof styleElement !== 'object') {
    return false;
  }

  const textContent =
    'textContent' in styleElement && typeof styleElement.textContent === 'string'
      ? styleElement.textContent
      : '';

  if (!textContent) {
    return false;
  }

  const normalizedFamily = fontFamily.toLowerCase();
  return textContent.toLowerCase().includes(`font-family:"${normalizedFamily}"`);
}
