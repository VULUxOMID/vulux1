import { Platform } from 'react-native';

import {
  hasGeneratedFontRule,
  isFontTimeoutError,
} from './expoFontTimeoutCompat.helpers';

const INSTALL_KEY = '__vuluExpoFontTimeoutCompatInstalled__';

type AnyRecord = Record<string, unknown>;

function installExpoFontTimeoutCompat(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return;
  }

  const globalRecord = globalThis as AnyRecord;
  if (globalRecord[INSTALL_KEY]) {
    return;
  }

  const expoFontLoader = require('expo-font/build/ExpoFontLoader.web') as {
    default?: {
      loadAsync?: (fontFamilyName: string, resource: unknown) => Promise<void>;
    };
  };

  const loader = expoFontLoader.default;
  if (!loader || typeof loader.loadAsync !== 'function') {
    return;
  }

  const originalLoadAsync = loader.loadAsync.bind(loader);

  loader.loadAsync = ((fontFamilyName: string, resource: unknown) => {
    return Promise.resolve(originalLoadAsync(fontFamilyName, resource)).catch((error) => {
      if (!fontFamilyName || !isFontTimeoutError(error)) {
        throw error;
      }

      if (!hasGeneratedFontRule(fontFamilyName)) {
        throw error;
      }
    });
  }) as typeof loader.loadAsync;

  globalRecord[INSTALL_KEY] = true;
}

installExpoFontTimeoutCompat();
