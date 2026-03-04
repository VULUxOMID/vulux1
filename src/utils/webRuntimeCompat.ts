import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

const IGNORABLE_ORIENTATION_ERROR_NAMES = new Set(['NotSupportedError', 'AbortError']);

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : '';
}

function readErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  return '';
}

function isIgnorableOrientationError(error: unknown): boolean {
  const name = readErrorName(error);
  if (IGNORABLE_ORIENTATION_ERROR_NAMES.has(name)) {
    return true;
  }

  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes('notsupportederror') ||
    message.includes('aborterror') ||
    message.includes('not supported') ||
    message.includes('screen orientation')
  );
}

function isOrientationApiSupportedOnWeb(): boolean {
  if (Platform.OS !== 'web') {
    return true;
  }

  const globalScreen = (globalThis as { screen?: { orientation?: unknown } }).screen;
  const orientation = globalScreen?.orientation as
    | { lock?: unknown; unlock?: unknown }
    | undefined;

  return !!orientation && typeof orientation.lock === 'function' && typeof orientation.unlock === 'function';
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

  const globalDocument = (globalThis as {
    document?: { activeElement?: { blur?: () => void } | null };
  }).document;
  const activeElement = globalDocument?.activeElement;
  if (activeElement && typeof activeElement.blur === 'function') {
    activeElement.blur();
  }
}
