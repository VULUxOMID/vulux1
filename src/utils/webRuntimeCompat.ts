import { Keyboard, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  blurDocumentActiveElement,
  hasScreenOrientationApiSupport,
  isIgnorableOrientationError,
} from './webRuntimeCompat.shared';

function isOrientationApiSupportedOnWeb(): boolean {
  if (Platform.OS !== 'web') {
    return true;
  }

  const globalScreen = (globalThis as {
    screen?: {
      orientation?: {
        lock?: unknown;
        unlock?: unknown;
      } | null;
    };
  }).screen;
  return hasScreenOrientationApiSupport(globalScreen);
}

export async function lockPortraitOrientationSafely(): Promise<void> {
  if (!isOrientationApiSupportedOnWeb()) {
    return;
  }

  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch (error) {
    if (isIgnorableOrientationError(error)) {
      return;
    }

    if (__DEV__) {
      console.warn('[orientation] Failed to lock portrait orientation', error);
    }
  }
}

export async function unlockOrientationSafely(): Promise<void> {
  if (!isOrientationApiSupportedOnWeb()) {
    return;
  }

  try {
    await ScreenOrientation.unlockAsync();
  } catch (error) {
    if (isIgnorableOrientationError(error)) {
      return;
    }

    if (__DEV__) {
      console.warn('[orientation] Failed to unlock orientation', error);
    }
  }
}

export function blurActiveWebElement(): void {
  if (Platform.OS !== 'web') {
    return;
  }

  blurDocumentActiveElement(
    (globalThis as {
      document?: { activeElement?: { blur?: () => void } | null };
    }).document,
  );
}

export function dismissKeyboardAndBlurActiveWebElement(): void {
  Keyboard.dismiss();
  blurActiveWebElement();
}
